// The mood of the room. Every minute or two the light slowly shifts to a new,
// bold mood: it recolours the room behind the pile and the light falling on it.
import { MOOD } from "./config.js";

const MOODS = [
  { name: "lamplight", deep: "#2e211b", mid: "#5a3d30", glow: "#c9825a", lamp: "#ffd7a1",
    key: [255, 214, 160, 0.22], haze: [52, 33, 26, 0.17], under: [34, 18, 12, 0.32] },
  { name: "moonlight", deep: "#0d1426", mid: "#1f2f52", glow: "#5c7bb8", lamp: "#cfe0ff",
    key: [190, 215, 255, 0.24], haze: [14, 22, 46, 0.22], under: [6, 10, 26, 0.38] },
  { name: "rose dusk", deep: "#2a1020", mid: "#6b2a45", glow: "#e0718f", lamp: "#ffc2d1",
    key: [255, 170, 195, 0.26], haze: [58, 18, 38, 0.18], under: [30, 8, 20, 0.34] },
  { name: "aurora", deep: "#06201c", mid: "#0f4a3e", glow: "#36c29a", lamp: "#b8ffe4",
    key: [150, 255, 210, 0.22], haze: [8, 40, 34, 0.2], under: [2, 18, 14, 0.36] },
  { name: "candle", deep: "#2b0b05", mid: "#6e1e0c", glow: "#ff6a2b", lamp: "#ffb36b",
    key: [255, 150, 80, 0.3], haze: [60, 16, 6, 0.18], under: [30, 6, 2, 0.4] },
  { name: "violet neon", deep: "#150a2e", mid: "#3d1a74", glow: "#a65cff", lamp: "#ff8ae6",
    key: [220, 140, 255, 0.28], haze: [30, 12, 60, 0.2], under: [14, 4, 32, 0.38] },
  { name: "golden hour", deep: "#3a2208", mid: "#8a5a1a", glow: "#ffc24a", lamp: "#fff0b8",
    key: [255, 225, 140, 0.3], haze: [70, 44, 12, 0.14], under: [40, 24, 6, 0.3] },
  { name: "deep sea", deep: "#031a24", mid: "#0b3f55", glow: "#2fb3c9", lamp: "#a8f2ff",
    key: [140, 235, 255, 0.24], haze: [4, 30, 42, 0.22], under: [0, 14, 22, 0.4] },
];

const hex = (h) => (Array.isArray(h) ? h : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const rgb = (c) => `rgb(${c.slice(0, 3).map(Math.round).join(",")})`;
const rgba = (c) => `rgba(${c.slice(0, 3).map(Math.round).join(",")},${c[3].toFixed(3)})`;
const ease = (t) => t * t * (3 - 2 * t);

export function createLighting() {
  // Open on one of the colourful moods (never the plain brown lamplight), then
  // wander through all of them.
  const order = MOODS.map((_, i) => i).sort(() => Math.random() - 0.5);
  if (MOODS[order[0]].name === "lamplight" || MOODS[order[0]].name === "candle") order.push(order.shift());
  if (MOODS[order[0]].name === "lamplight" || MOODS[order[0]].name === "candle") order.push(order.shift());
  const first = MOODS[order[0]];
  const state = { i: 0, from: first, to: first, now: first, start: 0, next: 0, k: 1, fadeMs: MOOD.fadeMs, light: null };
  let step = 0;

  function blend(k) {
    const a = state.from, b = state.to;
    // Where the light is right now, so the next change starts from here (no jump).
    state.now = Object.fromEntries(["deep", "mid", "glow", "lamp", "key", "haze", "under"]
      .map((key) => [key, mix(hex(a[key]), hex(b[key]), k)]));
    const col = (key) => rgb(state.now[key]);
    const root = document.documentElement.style;
    root.setProperty("--room-deep", col("deep"));
    root.setProperty("--room-mid", col("mid"));
    root.setProperty("--room-glow", col("glow"));
    root.setProperty("--lamp", col("lamp"));
    // Less shine, more shape: a softer key light and a deeper shadow underneath.
    const key = mix(a.key, b.key, k);
    const under = mix(a.under, b.under, k);
    key[3] *= MOOD.keyScale;
    under[3] = Math.min(0.55, under[3] * MOOD.underScale);
    state.light = {
      key: rgba(key),
      keyFade: rgba([...key.slice(0, 3), 0]),
      haze: rgba((() => { const hz = mix(a.haze, b.haze, k); hz[3] *= MOOD.hazeScale; return hz; })()),
      under: rgba(under),
      underFade: rgba([...under.slice(0, 3), 0]),
    };
  }
  blend(1);

  // Start moving to the next mood now (when the ring changes), quickly.
  state.shift = () => { state.next = 1; state.quick = true; };

  state.update = (t) => {
    if (!state.next) state.next = t + MOOD.firstAfterMs;
    if (t > state.next) {
      step = (step + 1) % order.length;
      state.from = state.now;
      state.to = MOODS[order[step]];
      state.start = t;
      state.fadeMs = state.quick ? MOOD.shiftFadeMs : MOOD.fadeMs;
      state.quick = false;
      state.next = t + MOOD.everyMs[0] + Math.random() * (MOOD.everyMs[1] - MOOD.everyMs[0]);
    }
    const k = Math.max(0, Math.min(1, (t - state.start) / state.fadeMs));
    if (k < 1 || state.k < 1) blend(ease(k));
    state.k = k;
    return state.light;
  };

  return state;
}
