// Comings and goings. People roll out of the pile (down the side, along the
// floor and off the edge of the screen), newcomers tumble in from above, and
// when the ring changes everyone gently resizes to make room.
import { PHYS, FLOW } from "./config.js";
import { addBody, removeBody, nudge, wake } from "./physics3d.js";
import { project } from "./camera.js";

export function rollOut(p, dir) {
  p.rolling = { dir: dir || (p.sx < window.innerWidth / 2 ? -1 : 1) };
  p.holding = false;
  p.asleep = false;
  p.base = false;
  nudge(p, 0, 1.2, 0);      // a little hop up and over the edge
}

// Called every physics step: rollers tumble down the front of the pile, then
// along the floor and off the side of the screen.
export function stepRolling(world, cam, w, onGone) {
  const right = { x: cam.cosY, z: -cam.sinY };
  const front = { x: cam.sinY, z: cam.cosY };
  for (const p of [...world.people]) {
    if (!p.rolling) continue;
    const { dir } = p.rolling;
    const vx = p.pos.x - p.prev.x, vz = p.pos.z - p.prev.z;
    // Out toward the camera first (in front of everyone), then sideways.
    const out = Math.max(0, 1 - (p.rolling.t = (p.rolling.t || 0) + 1) / 50);
    const tx = (right.x * dir + front.x * out * 1.2) * FLOW.rollSpeed;
    const tz = (right.z * dir + front.z * out * 1.2) * FLOW.rollSpeed;
    p.prev.x = p.pos.x - (vx + (tx - vx) * 0.08);
    p.prev.z = p.pos.z - (vz + (tz - vz) * 0.08);
    p.spin = (p.spin || 0) + (dir * Math.hypot(vx, vz)) / Math.max(p.r, 1);
    wake(p, true);
    if (p.sx < -p.size || p.sx > w + p.size) {
      removeBody(world, p);
      onGone(p);
    }
  }
}

// A newcomer drops in from the sky: it starts above the top of the screen,
// straight over a spot on the mound, and falls down onto the pile.
export function dropIn(world, person, s, cam) {
  // Within the tower's own foot (not the whole spread of the pile), so a big
  // crowd builds up into a tall tower instead of slumping into a wide mound.
  const reach = (world.shapeFor?.foot || world.radius) * FLOW.landSpread;
  const surfaceAt = (x, z) => {
    let top = 0;
    for (const q of world.people) {
      if (q.rolling || q.falling) continue;
      if (Math.hypot(q.pos.x - x, q.pos.z - z) < s * 0.7) top = Math.max(top, q.pos.y + q.r);
    }
    return top;
  };
  // Try a few spots and take the lowest: newcomers fill hollows, not peaks.
  let x = 0, z = 0, surface = Infinity;
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * reach;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d * 0.55;
    const top = surfaceAt(cx, cz);
    if (top < surface) { surface = top; x = cx; z = cz; }
  }
  // High enough to start out of sight, above the top of the screen.
  let y = surface + s * 1.6;
  if (cam) {
    for (let i = 0; i < 40 && project(cam, x, y, z).y > -s * 1.5 * (cam.fit || 1); i++) y += s;
  }
  addBody(world, person, x, y, z, s);
  person.settleCheck = true;
  person.falling = true;    // doesn't count toward the pile's height until it lands
  person.squish = 0.2;
  return person;
}

// Ease everyone toward a new size; returns true while anyone is still resizing.
export function stepSizes(world) {
  let moving = false;
  for (const p of world.people) {
    if (!p.sTarget || Math.abs(p.s - p.sTarget) < 0.15) continue;
    p.s += (p.sTarget - p.s) * FLOW.resizeEase;
    p.r = p.s * PHYS.radiusK;
    wake(p, true);
    moving = true;
  }
  return moving;
}
