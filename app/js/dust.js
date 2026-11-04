// Dust in the room's light: soft motes drifting slowly through the air, most
// of them far behind the pile, now and then a big, out-of-focus one floating
// past close to the camera. They glint as they turn through the light, and
// slide with the camera a little (near ones more), so the room feels deep.
import { DUST } from "./config.js";

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

function makeMote() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255, 244, 222, 1)");
  grad.addColorStop(0.35, "rgba(255, 236, 205, 0.45)");
  grad.addColorStop(1, "rgba(255, 230, 195, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// depth: 0 far behind the pile … 1 right in front of the camera.
function spawn(front, anywhere) {
  const depth = front ? rand(0.75, 1) : rand(0, 0.55);
  return {
    depth,
    x: Math.random(),
    y: anywhere ? Math.random() : 1.05,
    vx: rand(-1, 1) * DUST.drift,
    vy: -rand(0.2, 1) * DUST.drift,            // dust in warm air rises, barely
    phase: rand(0, TAU),
    glint: rand(0.4, 1.2),
    size: front ? rand(10, 24) : rand(1.4, 3.6) * (0.6 + depth),
    alpha: front ? rand(0.07, 0.14) : rand(0.25, 0.6) * (0.5 + depth),
  };
}

export function createDust() {
  const back = Array.from({ length: DUST.back }, () => spawn(false, true));
  const front = Array.from({ length: DUST.front }, () => spawn(true, true));
  return { back, front, sprite: makeMote(), last: 0 };
}

function step(list, dt, front) {
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    // A slow wander: the current sways, so no mote travels in a straight line.
    m.phase += dt * 0.00025 * m.glint;
    m.x += (m.vx + Math.sin(m.phase * 1.7) * DUST.drift * 0.6) * dt * (0.4 + m.depth);
    m.y += (m.vy + Math.cos(m.phase) * DUST.drift * 0.4) * dt * (0.4 + m.depth);
    if (m.y < -0.05 || m.x < -0.08 || m.x > 1.08) list[i] = spawn(front, false);
  }
}

function paint(ctx, list, sprite, w, h, t, yaw) {
  for (const m of list) {
    // Turning in the light: each mote fades in and out on its own slow beat.
    const shine = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.0007 * m.glint + m.phase * 3)) ** 2;
    const x = m.x * w - yaw * w * (0.08 + m.depth * 0.5);
    const y = m.y * h;
    const s = m.size;
    ctx.globalAlpha = m.alpha * shine;
    ctx.drawImage(sprite, x - s, y - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1;
}

// layer: "back" (drawn before the pile) or "front" (after it).
export function drawDust(ctx, dust, layer, w, h, t, yaw, still) {
  if (layer === "back") {
    const dt = dust.last ? Math.min(64, t - dust.last) : 16;
    dust.last = t;
    if (!still) { step(dust.back, dt, false); step(dust.front, dt, true); }
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  paint(ctx, dust[layer], dust.sprite, w, h, t, yaw);
  ctx.restore();
}
