// Draws the pile far-to-near. Depth cues: perspective size, soft shadows that
// people cast on whoever is under them, far people seen through layers of
// warm dark air, and a lamp lighting the mound from the upper left so it reads
// as one rounded shape. Everyone breathes together.
import { SIZE, LOOK, BREATH, POSE } from "./config.js";
import { project } from "./camera.js";
import { createDust, drawDust } from "./dust.js";
import { createSky, drawSky } from "./sky.js";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const r = { canvas, ctx, w: 0, h: 0, dpr: 1, shadow: makeShadow(), dust: createDust(), sky: createSky() };
  r.resize = () => {
    const rect = canvas.getBoundingClientRect();
    r.dpr = Math.min(window.devicePixelRatio || 1, 2);
    r.w = rect.width;
    r.h = rect.height;
    canvas.width = Math.round(r.w * r.dpr);
    canvas.height = Math.round(r.h * r.dpr);
  };
  r.resize();
  return r;
}

function makeShadow() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(28, 14, 8, 1)");
  grad.addColorStop(1, "rgba(28, 14, 8, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

function drawFloor(ctx, r, cam, world) {
  const R = world.radius;
  const back = project(cam, 0, 0, -R * 0.6);
  const g = ctx.createLinearGradient(0, back.y - 30, 0, r.h);
  g.addColorStop(0, "rgba(40, 24, 18, 0)");
  g.addColorStop(0.3, "rgba(40, 24, 18, 0.2)");
  g.addColorStop(0.7, "rgba(40, 24, 18, 0.3)");
  g.addColorStop(1, "rgba(40, 24, 18, 0)");      // no hard edge where the stage ends
  ctx.fillStyle = g;
  ctx.fillRect(0, back.y - 30, r.w, r.h - back.y + 30);
  // The mound's footprint shadow.
  const c = project(cam, 0, 0, 0);
  const rx = R * c.k * 1.15;
  const ry = Math.max(12, R * 0.6 * cam.sinP * c.k * 1.3);
  ctx.globalAlpha = 0.75;
  ctx.drawImage(r.shadow, c.x - rx, c.y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = 1;
}

// How much figure a picture holds: the square root of its solid area, in the
// picture's own pixels. Measured once per picture on a small canvas.
const MASS_PX = 64;
let massCtx = null;
function figureMass(img) {
  if (img._mass) return img._mass;
  massCtx = massCtx || Object.assign(document.createElement("canvas"), { width: MASS_PX, height: MASS_PX })
    .getContext("2d", { willReadFrequently: true });
  const s = MASS_PX / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
  massCtx.clearRect(0, 0, MASS_PX, MASS_PX);
  massCtx.drawImage(img, 0, 0, w, h);
  let solid = 0;
  try {
    const a = massCtx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < a.length; i += 4) if (a[i] > 128) solid++;
  } catch { solid = w * h * 0.45; }   // can't read the pixels: assume a typical figure
  img._mass = Math.sqrt(Math.max(solid, 1)) / s;
  return img._mass;
}

// A pose's shadow: its silhouette, dark and soft. Drawn tiny and scaled up, so
// it blurs without canvas filters (which not every phone has). Made once per picture.
const SHADOW_PX = 28;
function shadowOf(img) {
  if (img._shadow) return img._shadow;
  const s = SHADOW_PX / Math.max(img.naturalWidth, img.naturalHeight);
  const pad = 4;
  const c = Object.assign(document.createElement("canvas"), {
    width: Math.ceil(img.naturalWidth * s) + pad * 2, height: Math.ceil(img.naturalHeight * s) + pad * 2 });
  const g = c.getContext("2d");
  g.drawImage(img, pad, pad, img.naturalWidth * s, img.naturalHeight * s);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "rgb(58, 30, 22)";   // warm brown, like shade on clay, not black
  g.fillRect(0, 0, c.width, c.height);
  img._shadow = { canvas: c, pad: pad / s };
  return img._shadow;
}

// Fit a pose image into the person's box, feet at the origin. Every picture is
// scaled so the figure in it covers the same area, whatever the pose, so
// everyone in the pile reads as the same size.
function poseScale(img, size) {
  return Math.min((size * LOOK.figureMass) / figureMass(img),
    (size * 1.5) / img.naturalWidth, (size * 1.35) / img.naturalHeight);
}

function drawPose(ctx, img, size, alpha) {
  if (!img || alpha <= 0.01) return;
  const k = poseScale(img, size);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  ctx.globalAlpha *= alpha;
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.globalAlpha /= alpha;
}

// The person's shadow on whoever is already drawn behind them (and only on
// them: never on the empty room), offset away from the lamp.
function drawPoseShadow(ctx, img, size, flip) {
  if (!img) return;
  const { canvas, pad } = shadowOf(img);
  const k = poseScale(img, size) * LOOK.dropShadowGrow;
  const w = (img.naturalWidth + pad * 2) * k, h = (img.naturalHeight + pad * 2) * k;
  ctx.drawImage(canvas, -w / 2 + size * LOOK.dropShadowDx * Math.sign(flip || 1), -h + pad * k + size * LOOK.dropShadowDy, w, h);
}

function placeOnScreen(p, cam, tilt, top) {
  // Draw from a smoothed position, so tiny physics wobbles never show: the
  // pile reads as a still, heavy sculpture. Real moves (falling, rolling) follow quickly.
  const moving = p.falling || p.rolling || p.pinned;
  if (!p.show || moving) p.show = { ...p.pos };
  else for (const k of ["x", "y", "z"]) p.show[k] += (p.pos[k] - p.show[k]) * (Math.abs(p.pos[k] - p.show[k]) > 6 ? 0.25 : 0.06);
  const pr = project(cam, p.show.x, p.show.y, p.show.z);
  const rise = Math.max(0, p.pos.y / Math.max(top, 1));
  const sway = tilt * LOOK.swayPx * rise * rise * pr.k;
  p.sx = pr.x + sway;
  p.sy = pr.y;
  p.k = pr.k;
  p.depth = pr.depth;
  // Smoothed depth for drawing order, so near neighbours don't flicker in front
  // of and behind each other.
  p.dz = p.dz == null ? pr.depth : p.dz + (pr.depth - p.dz) * 0.08;
  p.size = p.s * SIZE.sprite * pr.k;
  p.swayPx = sway;
}

function drawPerson(ctx, p, cam, shadow, t) {
  const size = p.size;
  // The soft shadow this person casts on whoever is under them.
  const under = project(cam, p.show.x, p.show.y - p.r * 0.9, p.show.z);
  ctx.globalAlpha = LOOK.contactShadow * p.alpha;
  ctx.drawImage(shadow, under.x + p.swayPx - size * 0.42, under.y - size * 0.1, size * 0.84, size * 0.22);

  const breathe = p.base ? 0 : Math.sin((t / BREATH.periodMs) * TAU + p.breath) * BREATH.amp;
  const sq = p.squish;
  const sx = (1 + sq * 0.5 - breathe * 0.4) * p.flip;
  const sy = 1 - sq * 0.38 + breathe;
  const feet = p.sy + p.r * p.k * 0.85 - p.hop * size * 0.12;
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(p.sx, feet);
  ctx.rotate(p.lean + (p.sway || 0) + (p.spin || 0) + p.nod * POSE.nodDeg * DEG);
  ctx.scale(sx, sy);
  if (p.alpha > 0.5 && !p.falling) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = LOOK.dropShadow * p.alpha;
    drawPoseShadow(ctx, p.poses[p.pose] || p.poses.open, size, p.flip);   // mirrored people: still away from the lamp
    ctx.restore();
  }
  // Crossfade that never goes see-through: the old pose stays solid until the
  // new one is half in, then fades out underneath it.
  const k = p.poseT;
  if (k < 1) drawPose(ctx, p.poses[p.prevPose], size, Math.min(1, (1 - k) * 2));
  drawPose(ctx, p.poses[p.pose] || p.poses.open, size, k < 1 ? Math.min(1, k * 2) : 1);
  ctx.restore();
}

// Tint everything drawn so far (and only that) with a layer of air or light.
function wash(ctx, w, h, style) {
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function light(ctx, r, cam, world, mood) {
  const R = world.radius, top = world.top;
  const lamp = project(cam, -R * 0.7, top * 0.95, R * 0.4);
  const g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, Math.max(1, R * lamp.k * 2.2));
  g.addColorStop(0, mood.key);
  g.addColorStop(1, mood.keyFade);
  wash(ctx, r.w, r.h, g);
  const base = project(cam, 0, 0, R * 0.5);
  const mid = project(cam, 0, top * 0.45, 0);
  const s = ctx.createLinearGradient(0, mid.y, 0, base.y);
  s.addColorStop(0, mood.underFade);
  s.addColorStop(1, mood.under);
  wash(ctx, r.w, r.h, s);
}

// A small glowing marker always floats above your head, on top of everyone,
// so you can find yourself in the pile. Off screen, an arrow at the edge points
// the way.
// Other real people in the pile get a small soft dot over their heads.
function drawRealMarkers(ctx, world, t) {
  for (const p of world.people) {
    if (!p.remote || p.rolling) continue;
    const x = p.sx, y = p.sy - p.size * 0.95 - 8 + Math.sin(t / 800 + p.breath) * 2;
    const r = 4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, "rgba(180, 230, 255, 0.85)");
    g.addColorStop(1, "rgba(180, 230, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.fillStyle = "#eaf7ff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawYouMarker(ctx, you, t, w, h) {
  if (!you || you.rolling) return;
  const bob = Math.sin(t / 700) * 3;
  const x = you.sx, y = you.sy - you.size * 0.95 - 14 + bob;
  const inside = x > 12 && x < w - 12 && y > 12 && y < h - 12;
  ctx.save();
  if (inside) {
    const r = 7;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    g.addColorStop(0, "rgba(255, 226, 170, 0.9)");
    g.addColorStop(1, "rgba(255, 226, 170, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
    ctx.fillStyle = "#fff4e2";
    ctx.beginPath();                       // a little downward-pointing drop
    ctx.moveTo(x, y + r * 1.4);
    ctx.bezierCurveTo(x - r * 1.3, y, x - r, y - r * 1.2, x, y - r * 1.2);
    ctx.bezierCurveTo(x + r, y - r * 1.2, x + r * 1.3, y, x, y + r * 1.4);
    ctx.fill();
  } else {
    const cx = Math.max(22, Math.min(w - 22, x)), cy = Math.max(22, Math.min(h - 22, y));
    const a = Math.atan2(y - cy, x - cx);
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = "rgba(255, 226, 170, 0.95)";
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function draw(r, world, cam, scene, t) {
  const { ctx, w, h, dpr } = r;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  drawFloor(ctx, r, cam, world);

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  drawSky(ctx, r.sky, w, h, t, cam.view.zoom, still);
  drawDust(ctx, r.dust, "back", w, h, t, cam.yaw, still);

  for (const p of world.people) placeOnScreen(p, cam, scene.tilt, world.top);
  // Where the heap's top edge lands on screen (before your own zoom), for framing.
  let top = Infinity;
  for (const p of world.people) {
    if (p.falling || p.rolling) continue;
    const head = (p.sy - p.size * 0.95 - cam.view.panY - h / 2) / cam.view.zoom + h / 2;
    if (head < top) top = head;
  }
  cam.screenTop = top === Infinity ? null : top;
  // Far to near. Two people at almost the same depth keep last frame's order.
  const order = [...world.people].sort((a, b) => {
    const diff = b.dz - a.dz;
    const close = Math.min(a.size, b.size) * LOOK.orderHysteresis;
    if (Math.abs(diff) < close && a.order != null && b.order != null) return a.order - b.order;
    return diff;
  });
  order.forEach((p, i) => { p.order = i; });
  // You're always visible: drawn after everyone else, so the pile never hides you.
  const you = order.findIndex((p) => p.isYou);
  if (you >= 0) order.push(order.splice(you, 1)[0]);
  const per = Math.ceil(order.length / LOOK.hazeBands);
  order.forEach((p, i) => {
    drawPerson(ctx, p, cam, r.shadow, t);
    // Between bands, everything further back sinks into a little more air.
    if ((i + 1) % per === 0 && i < order.length - 1) wash(ctx, w, h, scene.light.haze);
  });
  ctx.globalAlpha = 1;
  light(ctx, r, cam, world, scene.light);
  drawDust(ctx, r.dust, "front", w, h, t, cam.yaw, still);
  drawRealMarkers(ctx, world, t);
  drawYouMarker(ctx, order.find((p) => p.isYou), t, w, h);
}
