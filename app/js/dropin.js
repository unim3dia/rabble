// The drop-in: you drift down onto the side of the mound that faces you. The
// people there reach up to catch you, then wrap around you; a ripple of tiny
// squeezes travels out through the whole pile, and the camera leans in.
import { DROP, CAMERA } from "./config.js";
import { addBody, wakeNear, nudge } from "./physics3d.js";
import { towardCamera } from "./camera.js";
import { setPose } from "./poses.js";

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const HUG_POSES = ["drape", "curl", "drape", "lean"];

// The highest spot on the camera's side of the mound.
function landingSpot(world, cam) {
  const toward = towardCamera(cam);
  const upper = world.people.filter((p) => !p.isYou && p.pos.y > world.top * 0.5);
  const pool = upper.length ? upper : world.people;
  let best = pool[0], bestScore = -Infinity;
  for (const p of pool) {
    const score = p.pos.y + (p.pos.x * toward.x + p.pos.z * toward.z) * 0.7 - Math.abs(p.pos.x) * 0.3;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return {
    x: best.pos.x + toward.x * best.r * 0.5,
    y: best.pos.y + best.r * 1.6,
    z: best.pos.z + toward.z * best.r * 0.5,
  };
}

export function startDropIn({ world, cam, scene, you, now, onLanded }) {
  const land = landingSpot(world, cam);
  const start = { x: land.x, y: world.top + you.s * 6, z: land.z };
  const right = { x: cam.cosY, z: -cam.sinY };

  const catchers = world.people
    .filter((p) => !p.isYou)
    .map((p) => ({ p, d: Math.hypot(p.pos.x - land.x, p.pos.y - land.y, p.pos.z - land.z) }))
    .filter(({ p, d }) => d < p.r * DROP.reachRadius)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)
    .map(({ p }) => p);
  catchers.forEach((p, i) => {
    p.holding = true;
    setTimeout(() => {
      setPose(p, "open");
      p.nodTarget = Math.sign(land.x - p.pos.x) || 1;
    }, 300 + i * 160);
  });

  scene.glow = { x: land.x, y: land.y - you.r, z: land.z, r: you.s * 1.4, a: 0 };
  addBody(world, you, start.x, start.y, start.z, you.s);
  you.pinned = true;
  you.falling = true;
  you.glow = 1;

  const t0 = now;
  let landedAt = 0;

  return function update(t) {
    const g = scene.glow;
    if (!landedAt) {
      const k = Math.min(1, (t - t0) / DROP.fallMs);
      const e = easeInOut(k);
      g.a = Math.min(1, k * 2);
      // A slow, swaying descent, like a leaf.
      const side = Math.sin(k * Math.PI * 2.5) * you.s * 0.3 * (1 - k);
      you.pos.x = start.x + (land.x - start.x) * e + right.x * side;
      you.pos.y = start.y + (land.y - start.y) * e;
      you.pos.z = start.z + (land.z - start.z) * e + right.z * side;
      you.prev.x = you.pos.x; you.prev.y = you.pos.y; you.prev.z = you.pos.z;
      you.sway = Math.sin(k * Math.PI * 3) * 0.2 * (1 - k);
      // Catchers shuffle aside a touch to open a nest.
      if (k < 0.6) {
        for (const p of catchers) {
          const dx = p.pos.x - land.x, dz = p.pos.z - land.z;
          const d = Math.hypot(dx, dz) || 1;
          nudge(p, (dx / d) * 0.08, 0, (dz / d) * 0.08);
        }
      }
      if (k >= 1) {
        landedAt = t;
        you.sway = 0;
        you.pinned = false;
        you.falling = false;
        nudge(you, 0, -1.5, 0);
        you.squish = 0.4;
        wakeNear(world, you.pos.x, you.pos.y, you.pos.z, you.r * 3);
        catchers.forEach((p, i) => setTimeout(() => {
          setPose(p, HUG_POSES[i % HUG_POSES.length]);
          p.squish = 0.3;
        }, 180 + i * 130));
        // The squeeze travels outward through the pile.
        for (const p of world.people) {
          if (p === you) continue;
          const d = Math.hypot(p.pos.x - you.pos.x, p.pos.y - you.pos.y, p.pos.z - you.pos.z);
          p.rippleAt = t + (d / DROP.rippleSpeed) * 1000;
        }
        cam.zoomTarget = CAMERA.joinZoom;
        cam.focusTarget = { x: land.x * 0.6, y: 0, z: land.z * 0.6 };
        if (navigator.vibrate) navigator.vibrate([18, 40, 12]);
        onLanded(you);
      }
      return false;
    }
    g.a = Math.max(0, g.a - 0.01);
    you.glow = Math.max(0.7, you.glow - 0.006);
    if (t - landedAt > DROP.hugMs) {
      catchers.forEach((p) => { p.holding = false; });
      return g.a <= 0;
    }
    return false;
  };
}
