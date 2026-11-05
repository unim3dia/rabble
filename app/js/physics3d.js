// A small 3D physics for the pile. Everyone is a soft ball; contacts and
// friction are solved by nudging positions (Verlet), which stays calm and
// stable for a heap. Gentle magnets pull people toward each other and toward
// the centre line, so the pile is always one cosy, upright mound.
import { PHYS } from "./config.js";

const DT = 1 / 60;

export function createWorld() {
  return { people: [], top: 0, radius: 100, form: pickForm() };
}

// Every tower has its own character: a lean to one side, a gentle S-bend, or
// both. It stays the same as the tower grows, so the taller it gets, the more
// the shape shows.
function pickForm() {
  const side = Math.random() < 0.5 ? -1 : 1;
  return {
    lean: side * (0.2 + Math.random() * 0.45),          // × base radius at the top
    bend: (Math.random() - 0.5) * 0.7,                 // × base radius at mid-height
  };
}

export function addBody(world, person, x, y, z, s) {
  person.s = s;
  person.r = s * PHYS.radiusK;
  person.pos = { x, y, z };
  person.prev = { x, y, z };
  person.still = 0;
  person.asleep = false;
  person.pinned = false;   // moved by hand (your drop-in), not by physics
  world.people.push(person);
  world.quiet = 0;         // someone new: the pile has a while to settle again
  return person;
}

export function removeBody(world, person) {
  world.people = world.people.filter((p) => p !== person);
}

export function resizeBody(person, s) {
  person.s = s;
  person.r = s * PHYS.radiusK;
}

// The base of the pile is set like stone: ordinary bumps don't wake it.
// force wakes anyone (resizing for a new ring, someone rolling out).
export function wake(p, force = false) {
  if (p.base && !force) return;
  p.asleep = false;
  p.still = 0;
}

export function wakeAll(world) {
  world.people.forEach(wake);
}

export function moveTo(p, x, y, z) {
  p.pos.x = x; p.pos.y = y; p.pos.z = z;
  p.prev.x = x; p.prev.y = y; p.prev.z = z;
}

export function nudge(p, vx, vy, vz) {
  // A push as a change in velocity (px per step).
  p.prev.x -= vx; p.prev.y -= vy; p.prev.z -= vz;
  wake(p);
}

// Pairs of people close enough to matter, found with a coarse 3D grid so each
// person only checks their neighbours. Pairs come out lowest person first,
// which lets "held up" flow from the floor upward in one pass.
function nearbyPairs(world) {
  const live = world.people;
  let maxR = 1;
  for (const p of live) if (p.r > maxR) maxR = p.r;
  const cell = maxR * PHYS.magnetRange;
  const key = (x, y, z) => ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0;
  const grid = new Map();
  const cx = new Int32Array(live.length), cy = new Int32Array(live.length), cz = new Int32Array(live.length);
  live.forEach((p, i) => {
    cx[i] = Math.floor(p.pos.x / cell); cy[i] = Math.floor(p.pos.y / cell); cz[i] = Math.floor(p.pos.z / cell);
    const k = key(cx[i], cy[i], cz[i]);
    const bucket = grid.get(k);
    if (bucket) bucket.push(i); else grid.set(k, [i]);
  });
  const pairs = [];
  for (let i = 0; i < live.length; i++) {
    if (live[i].leaving || live[i].rolling) continue;   // rollers pass in front of the pile
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(key(cx[i] + dx, cy[i] + dy, cz[i] + dz));
      if (!bucket) continue;
      for (const j of bucket) if (j > i && !live[j].leaving && !live[j].rolling) pairs.push(i, j);
    }
  }
  return pairs;
}

function integrate(world, pairs) {
  const live = world.people;
  const g = PHYS.gravity * DT * DT;
  // Magnets between close neighbours, mostly sideways so they hold on
  // rather than squash down.
  const ax = new Float32Array(live.length);
  const ay = new Float32Array(live.length);
  const az = new Float32Array(live.length);
  const m = PHYS.magnet * DT * DT;
  for (let n = 0; n < pairs.length; n += 2) {
    const i = pairs[n], j = pairs[n + 1];
    const a = live[i], b = live[j];
    if (a.rolling || b.rolling || a.falling || b.falling) continue;   // leaving or still falling: no pull
    const range = (a.r + b.r) * 0.5 * PHYS.magnetRange;
    const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    if (d > range) continue;
    const f = m * (1 - d / range) / d;
    ax[i] += dx * f; ay[i] += dy * f * PHYS.magnetLift; az[i] += dz * f;
    ax[j] -= dx * f; ay[j] -= dy * f * PHYS.magnetLift; az[j] -= dz * f;
  }
  const kx = PHYS.axisPullX * DT * DT, kz = PHYS.axisPullZ * DT * DT;
  for (let i = 0; i < live.length; i++) {
    const p = live[i];
    if (p.pinned || p.asleep) continue;
    const { pos, prev } = p;
    let vx = (pos.x - prev.x) * PHYS.damping;
    let vy = (pos.y - prev.y) * PHYS.damping;
    let vz = (pos.z - prev.z) * PHYS.damping;
    // Nobody gets flung: a hard squeeze can't send anyone flying off.
    const speed = Math.hypot(vx, vy, vz);
    if (speed > PHYS.maxSpeed) { const k = PHYS.maxSpeed / speed; vx *= k; vy *= k; vz *= k; }
    prev.x = pos.x; prev.y = pos.y; prev.z = pos.z;
    const lift = p.leaving ? 0 : 1;
    const hold = p.rolling || p.falling ? 0 : lift;   // rolling out or falling in: no pull toward the pile
    // You float a little and drift toward the camera, so you stay on top and in view.
    const float = p.buoyancy ?? 1;
    const fx = p.towardCamera ? p.towardCamera.x * PHYS.youDrift : 0;
    const fz = p.towardCamera ? p.towardCamera.z * PHYS.youDrift : 0;
    pos.x += vx + (ax[i] - (pos.x - spineAt(world, pos.y)) * kx + fx) * hold;
    pos.y += vy - g * lift * float + ay[i] * lift;
    pos.z += vz + (az[i] - pos.z * kz + fz) * hold;
  }
}

// How easily someone is moved by a contact: not at all while carried by hand,
// barely while resting (they're part of the ground others lie on).
function weight(p) {
  if (p.pinned) return 0;
  return p.asleep ? PHYS.restingWeight : 1;
}

// Move a body; a resting body keeps resting (no velocity from being nudged).
function shift(p, x, y, z) {
  p.pos.x += x; p.pos.y += y; p.pos.z += z;
  if (p.asleep) { p.prev.x += x; p.prev.y += y; p.prev.z += z; }
}

function solveContacts(world, pairs, contacts) {
  const live = world.people;
  for (const p of live) {
    if (p.pos.y < p.r) p.pos.y = p.r;
    if (p.pos.y <= p.r + PHYS.touchMargin) p.supported = true;
  }
  for (let n = 0; n < pairs.length; n += 2) {
    const i = pairs[n], j = pairs[n + 1];
    const a = live[i], b = live[j];
    {
      const rs = a.r + b.r;
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const touch = rs + PHYS.touchMargin;
      if (d2 >= touch * touch || d2 === 0) continue;
      // Resting on someone who is held up (by the floor, or by someone who
      // is) counts as being held up. This spreads upward through the heap.
      if (dy > a.r * 0.3 && a.supported) b.supported = true;
      if (dy < -b.r * 0.3 && b.supported) a.supported = true;
      // Who is resting on whom (to spot someone balanced on a single person).
      if (contacts) {
        if (dy > a.r * 0.3) { b.supports++; b.supporter = a; }
        if (dy < -b.r * 0.3) { a.supports++; a.supporter = b; }
      }
      if (d2 >= rs * rs) continue;
      const d = Math.sqrt(d2);
      const overlap = rs - d;
      // Only a real arrival or departure wakes people, not the pile settling into itself.
      const mover = a.falling || b.falling || a.pinned || b.pinned || a.rolling || b.rolling;
      if (mover && overlap > PHYS.wakeOverlap) { wake(a); wake(b); }
      const wa = weight(a), wb = weight(b);
      if (wa + wb === 0) continue;
      const k = overlap / d / (wa + wb);
      shift(a, -dx * k * wa, -dy * k * wa, -dz * k * wa);
      shift(b, dx * k * wb, dy * k * wb, dz * k * wb);
      if (contacts) contacts.push(a, b, i, j);
    }
  }
  for (const p of live) {
    if (p.pos.y < p.r) p.pos.y = p.r;
  }
}

// Real heaps don't balance people in columns: someone resting on just one
// person (not the floor) slides off sideways into a hollow and can't settle
// there. Two or more people underneath cradle you.
function slideOffPerches(world) {
  for (const p of world.people) {
    const balanced = !p.pinned && !p.rolling && p.supports === 1 && p.pos.y > p.r + PHYS.touchMargin;
    // Slide for a moment; if no better spot turns up, settle where you are.
    p.perchFrames = balanced ? (p.perchFrames || 0) + 1 : 0;
    p.perched = balanced && p.perchFrames < PHYS.perchFrames;
    if (!p.perched) continue;
    const s = p.supporter;
    let dx = p.pos.x - s.pos.x, dz = p.pos.z - s.pos.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.5) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); d = 1; }
    wake(p, true);
    p.pos.x += (dx / d) * PHYS.perchSlide;
    p.pos.z += (dz / d) * PHYS.perchSlide;
  }
}

// Cancel part of the sliding between touching people (and on the floor), so
// they can rest on one another instead of rolling off like marbles.
function applyFriction(contacts, world) {
  for (let c = 0; c < contacts.length; c += 4) {
    const a = contacts[c], b = contacts[c + 1];
    const nx = b.pos.x - a.pos.x, ny = b.pos.y - a.pos.y, nz = b.pos.z - a.pos.z;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const ux = nx / nl, uy = ny / nl, uz = nz / nl;
    const rx = (a.pos.x - a.prev.x) - (b.pos.x - b.prev.x);
    const ry = (a.pos.y - a.prev.y) - (b.pos.y - b.prev.y);
    const rz = (a.pos.z - a.prev.z) - (b.pos.z - b.prev.z);
    const dn = rx * ux + ry * uy + rz * uz;
    const tx = rx - dn * ux, ty = ry - dn * uy, tz = rz - dn * uz;
    const wa = weight(a), wb = weight(b);
    if (wa + wb === 0) continue;
    // Small slips are cancelled completely (static friction), bigger ones partly;
    // someone perched on a single person gets little grip, so they slide off.
    const slip = Math.hypot(tx, ty, tz);
    const grip = a.perched || b.perched ? PHYS.perchGrip : slip < PHYS.staticSlip ? 1 : PHYS.friction;
    const f = grip / (wa + wb);
    a.pos.x -= tx * f * wa; a.pos.y -= ty * f * wa; a.pos.z -= tz * f * wa;
    b.pos.x += tx * f * wb; b.pos.y += ty * f * wb; b.pos.z += tz * f * wb;
  }
  for (const p of world.people) {
    if (p.pinned || p.asleep || p.rolling || p.pos.y > p.r + 0.5) continue;
    p.pos.x = p.prev.x + (p.pos.x - p.prev.x) * (1 - PHYS.groundFriction);
    p.pos.z = p.prev.z + (p.pos.z - p.prev.z) * (1 - PHYS.groundFriction);
  }
}

// When nobody new has arrived for a while, the pile is done: anyone still
// drifting slowly settles where they are (anyone really falling keeps falling).
function settleQuiet(world) {
  world.quiet = (world.quiet || 0) + 1;
  if (world.quiet < PHYS.quietSteps || (world.quiet - PHYS.quietSteps) % PHYS.quietEvery !== 0) return;
  for (const p of world.people) {
    if (p.asleep || p.pinned || p.rolling || p.falling) continue;
    const moved = Math.hypot(p.pos.x - p.prev.x, p.pos.y - p.prev.y, p.pos.z - p.prev.z);
    if (moved > PHYS.quietSpeed) continue;
    p.asleep = true;
    p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
  }
}

function settleSleep(world) {
  let top = 0;
  const reach = [];
  for (const p of world.people) {
    if (p.leaving) continue;
    const moved = Math.abs(p.pos.x - p.prev.x) + Math.abs(p.pos.y - p.prev.y) + Math.abs(p.pos.z - p.prev.z);
    // The bottom of the pile is its foundation: once held up, it's set at once,
    // and stays set (only leaving, being carried, or a hop frees it for a moment).
    if (p.loose > 0) p.loose--;
    const free = p.rolling || p.pinned || p.falling || p.loose > 0;
    p.base = !free && p.supported && (p.base || p.pos.y < world.top * PHYS.baseFrac);
    if (p.base && !p.asleep) {
      p.asleep = true;
      p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
    }
    // Held up and only creeping: settle in place, so the pile keeps its shape.
    // Resting on nothing any more (for a few frames running): wake up and fall.
    p.unheld = p.supported ? 0 : (p.unheld || 0) + 1;
    if (p.asleep && p.unheld > PHYS.unheldFrames && !p.pinned) wake(p, true);
    // Held at the tower's edge, the small back-and-forth with the wall counts as still.
    const calm = moved < PHYS.sleepSpeed * (p.atWall ? PHYS.wallCalm : 1);
    // Held up but still fidgeting after a few seconds: settle where you are.
    const resting = !p.asleep && p.supported && !p.pinned && !p.rolling && !p.falling;
    p.restless = resting ? (p.restless || 0) + 1 : 0;
    if (p.restless > PHYS.restlessFrames) {
      p.asleep = true;
      p.restless = 0;
      p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
    }
    if (!p.pinned && p.supported && !p.perched && calm) {
      if (++p.still > PHYS.sleepFrames) {
        p.asleep = true;
        p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
      }
    } else if (moved >= PHYS.sleepSpeed) {
      p.still = 0;
    }
    if (!p.falling && !p.rolling) {
      top = Math.max(top, p.pos.y + p.r);
      reach.push(Math.hypot(p.pos.x, p.pos.z) + p.r);
    }
  }
  world.top = top;
  // Frame on where most of the pile is, not on one person who rolled off.
  if (reach.length) {
    reach.sort((a, b) => a - b);
    world.radius = reach[Math.floor((reach.length - 1) * 0.97)];
  }
}

export function step(world) {
  // Lowest first, so "held up" flows from the floor to the top in one pass.
  world.people.sort((a, b) => a.pos.y - b.pos.y);
  for (const p of world.people) { p.supported = false; p.supports = 0; p.supporter = null; }
  const pairs = nearbyPairs(world);
  integrate(world, pairs);
  const contacts = [];
  for (let it = 0; it < PHYS.iterations; it++) {
    solveContacts(world, pairs, it === PHYS.iterations - 1 ? contacts : null);
  }
  slideOffPerches(world);
  applyFriction(contacts, world);
  keepShape(world);           // last, so nothing pushes anyone back outside it
  settleSleep(world);
  settleQuiet(world);
}

// Settle off-screen until (nearly) everyone has come to rest, so the pile
// opens perfectly still. Anyone still moving keeps settling on screen.
export function presettle(world, steps) {
  // Still building: the outline holds everyone while the first pile takes shape.
  for (let i = 0; i < steps; i++) { step(world); world.quiet = 0; }
  // Set everyone who is held up, then let anyone still in the air land.
  for (const p of world.people) {
    if (p.pinned || !p.supported) continue;
    p.asleep = true;
    p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prev.z = p.pos.z;
  }
  for (let i = 0; i < steps; i++) {
    step(world);
    if (world.people.every((p) => p.asleep || p.pinned)) break;
  }
}

// Wake only the people near a point (someone landing, someone poked).
export function wakeNear(world, x, y, z, radius) {
  for (const p of world.people) {
    if (Math.hypot(p.pos.x - x, p.pos.y - y, p.pos.z - z) < radius) wake(p);
  }
}

// Starting spots inside a cone (lowest first); physics does the rest. The cone
// grows until it holds everyone, so no one is left stacked in a column.
const DEPTH = 0.55;                    // front-to-back ÷ left-to-right

// How grown-up the tower is: 0 for the first ring's crowd, 1 for the world's.
const growth = (count) => Math.max(0, Math.min(1, (count - 44) / 96));

// The tower's outline at a share f (0 floor … 1 top) of its height, for a crowd
// of this growth: the bottom third is a wide, gently sloping base; above a
// short shoulder, the top two thirds are the tower, tapering a little and
// rounding off at the top. The base widens as the crowd grows.
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function towerWidth(f, g) {
  const column = Math.max(0.25, 1 - f) ** 0.35;
  const wide = (0.9 + 0.5 * g) * (1 - 0.35 * f / 0.33);   // the base's extra width, sloping in a little
  return column + wide * (1 - smooth(0.26, 0.38, f));
}

// Where the tower's spine is (left/right) at a share f of its height.
function spine(form, base, f) {
  return base * (form.lean * f ** 1.5 + form.bend * Math.sin(Math.PI * f));
}

// The tower's spine at a height, for the pile as it is now (0 before it has a shape).
function spineAt(world, y) {
  const s = world.shapeFor;
  return s ? spine(world.form, s.base, Math.min(1, Math.max(0, y / s.height))) : 0;
}

// The smallest tower that holds this many people: { base, height, spots }.
function coneFor(count, r, form) {
  const spacing = r * PHYS.packSpacing;
  const g = growth(count);
  const aspect = 4.8 - 0.4 * g;        // tall, and a little stockier as it grows
  for (let base = spacing * 1.5; ; base *= 1.08) {
    const spots = coneSpots(base, base * aspect, spacing, r, form, g);
    if (spots.length >= count) return { base, height: base * aspect, spots };
  }
}

export function conePositions(world, count, r) {
  const { spots } = coneFor(count, r, world.form);
  spots.sort((a, b) => a.y - b.y);
  return spots.slice(0, count);
}

// The pile keeps its shape: anyone outside the mound's outline (for its
// current crowd) can't slide any further outward, so it stays tall instead of
// slumping, without anyone being shoved (so everyone can come to rest).
function keepShape(world) {
  const people = world.people.filter((p) => !p.rolling && !p.falling && !p.pinned);
  if (!people.length) return;
  const r = people[0].r;
  if (world.shapeFor?.count !== people.length || world.shapeFor.r !== r) {
    const { base, height } = coneFor(people.length, r, world.form);
    const b = base * PHYS.shapeSlack;
    world.shapeFor = { count: people.length, r, base: b, height: height * PHYS.shapeSlack,
      foot: b * towerWidth(0, growth(people.length)) };     // how far the foot reaches
  }
  const { base, height, count } = world.shapeFor;
  const g = growth(count);
  for (const p of people) {
    p.atWall = false;
    // While people are arriving the wall shapes everyone; once the pile is
    // done, it only catches those sliding or falling (resting people stay put).
    const building = (world.quiet || 0) < PHYS.quietSteps;
    // Above the outline's top, nobody is squeezed: they slide down, not up into a spire.
    if (p.asleep || (p.supported && !building) || p.pos.y > height) continue;
    const f = p.pos.y / height;
    const reach = base * towerWidth(f, g);
    const cx = spine(world.form, base, f);
    const d = Math.hypot(p.pos.x - cx, p.pos.z / DEPTH);
    if (d <= reach || d < 1) continue;
    p.atWall = true;
    // A soft wall: back inside the outline, and no outward momentum left.
    const k = 1 - (1 - reach / d) * PHYS.shapeHold;
    const x = cx + (p.pos.x - cx) * k, z = p.pos.z * k;
    // Move them in, and keep only part of their sideways speed.
    p.prev.x = x - (p.pos.x - p.prev.x) * k;
    p.prev.z = z - (p.pos.z - p.prev.z) * k;
    p.pos.x = x;
    p.pos.z = z;
  }
}

function coneSpots(base, height, spacing, r, form, g) {
  const depth = DEPTH;
  const spots = [];
  for (let y = r, layer = 0; y < height; y += spacing * 0.86, layer++) {
    // The tower's width at this height, around its (leaning) spine.
    const R = base * towerWidth(y / height, g);
    const cx = spine(form, base, y / height);
    // A grid centred on the axis, so even the narrowest layer has a spot.
    const nx = Math.floor(R / spacing), nz = Math.floor((R * depth) / spacing);
    for (let i = -nx; i <= nx; i++) {
      for (let j = -nz; j <= nz; j++) {
        const x = i * spacing + (layer % 2) * spacing * 0.5 * Math.sign(i || 1);
        const z = j * spacing;
        if (R > 0 && (x * x) / (R * R) + (z * z) / (R * R * depth * depth) > 1.05) continue;
        spots.push({ x: cx + x + (Math.random() - 0.5) * r * 0.3, y, z: z + (Math.random() - 0.5) * r * 0.3 });
      }
    }
  }
  return spots;
}
