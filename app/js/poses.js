// Poses: people shift between lying positions the way people do in a heap,
// curling up, draping over someone, leaning in, reaching out.
import { POSE } from "./config.js";

// Awake and lively (eyes open, grinning, reaching)…
const BY_HEIGHT = {
  top: ["prop", "chin", "open", "snuggle", "chin", "prop"],
  middle: ["snuggle", "prop", "chin", "snuggle", "prop"],
  bottom: ["snuggle", "prop", "snuggle", "chin"],
};
// …and about one in five dozing, eyes closed. Missing poses are skipped.
const SLEEPY = ["curl", "drape", "lean"];

function choices(p, top) {
  if (Math.random() < POSE.sleepyShare) {
    const sleepy = SLEEPY.filter((name) => p.poses[name]);
    if (sleepy.length) return sleepy;
  }
  return available(p, BY_HEIGHT[band(p, top)]);
}

// How high up the mound someone is (top is the mound's height).
function band(p, top) {
  const f = p.pos.y / Math.max(top, 1);
  if (f > 0.6) return "top";
  if (f > 0.3) return "middle";
  return "bottom";
}

function available(p, list) {
  const ok = list.filter((name) => p.poses[name]);
  return ok.length ? ok : Object.keys(p.poses);
}

export function setPose(p, pose) {
  if (!p.poses[pose] || pose === p.pose) return;
  p.prevPose = p.pose;
  p.pose = pose;
  p.poseT = 0;
}

export function settlePose(p, top) {
  const list = choices(p, top);
  const pick = list[Math.floor(Math.random() * list.length)];
  setPose(p, pick);
  p.poseT = 1;
}

// Doze off: switch to a sleepy pose (eyes closed), if this person has one.
export function doze(p) {
  const sleepy = SLEEPY.filter((name) => p.poses[name]);
  if (sleepy.length) setPose(p, sleepy[Math.floor(Math.random() * sleepy.length)]);
}

export function stepPose(p, dt) {
  if (p.poseT < 1) p.poseT = Math.min(1, p.poseT + dt / POSE.fadeMs);
  p.nod += (p.nodTarget - p.nod) * 0.03;
}

// Lean toward whoever is closest, like resting your head on a shoulder.
// Leaning happens on screen, so the side is the screen side.
function nearestSide(world, p) {
  let best = null, bd = Infinity;
  for (const q of world.people) {
    if (q === p || q.leaving) continue;
    const d = Math.hypot(q.pos.x - p.pos.x, q.pos.y - p.pos.y, q.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = q; }
  }
  return best ? Math.sign(best.sx - p.sx) : 0;
}

export function shiftSomeone(world, top) {
  const calm = world.people.filter((p) => !p.leaving && !p.falling && !p.isYou && !p.holding && !p.base);
  if (!calm.length) return;
  const p = calm[Math.floor(Math.random() * calm.length)];
  const list = choices(p, top).filter((name) => name !== p.pose);
  if (list.length) setPose(p, list[Math.floor(Math.random() * list.length)]);
  p.nodTarget = nearestSide(world, p) * (0.4 + Math.random() * 0.6);
}

export function nextShiftDelay() {
  const [lo, hi] = POSE.shiftEveryMs;
  return lo + Math.random() * (hi - lo);
}
