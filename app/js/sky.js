// The sky over the pile, in the top fifth of the screen: thin clouds drifting
// slowly across, now and then a small flock of birds flapping by, and once in
// a while an eagle gliding through on wide, still wings. It belongs to the
// wide view: as you zoom in it fades away. Drawn behind everything.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

const SKY = {
  band: 0.2,                  // the top fifth of the screen
  clouds: 5,
  cloudSpeed: 0.006,          // screen widths per second
  cloudAlpha: [0.16, 0.28],
  flockEveryS: [14, 26],
  flockSize: [4, 4],          // two white birds and two black
  birdSpeed: [0.05, 0.08],    // screen widths per second
  birdSize: [5, 8],           // px, wing tip to wing tip / 2
  eagleEveryS: [30, 50],
  eagleSpeed: 0.03,
  eagleSize: 17,
  ink: "rgba(28, 20, 36, 0.6)",
  white: "rgba(255, 250, 240, 0.85)",
  fadeZoom: 1.6,              // fully gone at this much zoom
};

function makeCloud() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const g = c.getContext("2d");
  // A few soft blobs stretched long: a thin wisp, no hard edge.
  for (let i = 0; i < 6; i++) {
    const x = rand(50, 206), y = rand(24, 40), r = rand(18, 32);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255, 248, 240, 0.55)");
    grad.addColorStop(1, "rgba(255, 248, 240, 0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

function cloud(anywhere) {
  return {
    img: makeCloud(),
    x: anywhere ? Math.random() : -0.4,
    y: rand(0.15, 0.85),           // within the band
    w: rand(0.45, 0.9),            // × screen width
    alpha: rand(...SKY.cloudAlpha),
    speed: SKY.cloudSpeed * rand(0.6, 1.4),
  };
}

export function createSky() {
  return {
    clouds: Array.from({ length: SKY.clouds }, () => cloud(true)),
    birds: [],
    nextFlock: performance.now() + rand(3, 8) * 1000,
    nextEagle: performance.now() + rand(12, 20) * 1000,
    last: 0,
  };
}

function launch(sky, now) {
  const n = Math.round(rand(...SKY.flockSize));
  const fromLeft = Math.random() < 0.5;
  const y = rand(0.25, 0.75), speed = rand(...SKY.birdSpeed);
  for (let i = 0; i < n; i++) {
    sky.birds.push({
      x: fromLeft ? -0.05 - i * 0.03 : 1.05 + i * 0.03, dir: fromLeft ? 1 : -1,
      y: y + rand(-0.12, 0.12), speed: speed * rand(0.92, 1.08),
      size: rand(...SKY.birdSize), flap: rand(0, TAU), flapRate: rand(9, 12), glide: 0, white: i % 2 === 0,
    });
  }
  sky.nextFlock = now + rand(...SKY.flockEveryS) * 1000;
}

function launchEagle(sky, now) {
  const fromLeft = Math.random() < 0.5;
  sky.birds.push({
    x: fromLeft ? -0.08 : 1.08, dir: fromLeft ? 1 : -1, y: rand(0.3, 0.6),
    speed: SKY.eagleSpeed, size: SKY.eagleSize, flap: 0, flapRate: 3, glide: 1, eagle: true,
  });
  sky.nextEagle = now + rand(...SKY.eagleEveryS) * 1000;
}

// A bird is two arcs, its wings, rising and falling as it flaps. An eagle holds
// its wings out flat and only now and then gives one slow beat.
function drawBird(ctx, b, x, y, t) {
  const beat = b.eagle ? Math.max(0, Math.sin(t * 0.0012 + b.flap)) ** 8 : (Math.sin(b.flap) + 1) / 2;
  const s = b.size, lift = (b.eagle ? 0.18 : 0.75) * s * (beat - 0.3);
  ctx.beginPath();
  ctx.moveTo(x - s, y - lift);
  ctx.quadraticCurveTo(x - s * 0.45, y - s * (b.eagle ? 0.22 : 0.5) - lift * 0.4, x, y);
  ctx.quadraticCurveTo(x + s * 0.45, y - s * (b.eagle ? 0.22 : 0.5) - lift * 0.4, x + s, y - lift);
  ctx.lineWidth = b.eagle ? 2.6 : 1.5;
  ctx.stroke();
  if (b.eagle) {                       // a small body and fanned tail under the wings
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.08, s * 0.13, s * 0.08, 0, 0, TAU);
    ctx.fill();
  }
}

export function drawSky(ctx, sky, w, h, t, zoom, still) {
  const fade = Math.max(0, Math.min(1, (SKY.fadeZoom - zoom) / (SKY.fadeZoom - 1)));
  const dt = sky.last ? Math.min(0.1, (t - sky.last) / 1000) : 0;
  sky.last = t;
  if (fade <= 0.01) return;
  const band = h * SKY.band;

  for (const c of sky.clouds) {
    if (!still) c.x += c.speed * dt;
    if (c.x > 1.1) Object.assign(c, cloud(false));
    const cw = c.w * w;
    ctx.globalAlpha = c.alpha * fade;
    ctx.drawImage(c.img, c.x * w - cw / 2, c.y * band - cw / 12, cw, cw / 3);
  }
  ctx.globalAlpha = 1;
  if (still) return;                  // reduced motion: just the clouds, standing still

  if (t > sky.nextFlock) launch(sky, t);
  if (t > sky.nextEagle) launchEagle(sky, t);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = SKY.ink;
  ctx.lineCap = "round";
  ctx.globalAlpha = fade;
  for (const b of sky.birds) {
    b.x += b.dir * b.speed * dt;
    b.flap += b.flapRate * dt;
    const y = b.y * band + Math.sin(t * 0.0009 + b.flap * 0.05) * (b.eagle ? 6 : 3);
    ctx.strokeStyle = ctx.fillStyle = b.white ? SKY.white : SKY.ink;
    drawBird(ctx, b, b.x * w, y, t);
  }
  ctx.restore();
  sky.birds = sky.birds.filter((b) => b.x > -0.2 && b.x < 1.2);
}
