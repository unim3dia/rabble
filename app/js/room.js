// The glowing lights in the room around the pile. Each wider ring pulls the
// view back: the lights shrink toward the middle and more of them come into
// view from beyond the edges, so the space grows with the pile.
const RING_SCALE = { neighborhood: 1, city: 0.72, state: 0.52, world: 0.36 };
const SPREAD = 2.8;          // lights are scattered over this many screens' worth

function scatter(box, count, make) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    // Most lights sit near the middle; more and more are further out.
    const r = Math.pow(Math.random(), 0.75) * SPREAD * 50;
    const a = Math.random() * Math.PI * 2;
    el.style.left = `${50 + Math.cos(a) * r}%`;
    el.style.top = `${55 + Math.sin(a) * r * 0.8}%`;
    make(el, r);
    box.append(el);
  }
}

export function createRoom() {
  scatter(document.getElementById("zoom-far"), 14, (el, r) => {
    el.className = "lamp";
    const s = 180 + Math.random() * 260;
    el.style.width = `${s}px`;
    el.style.height = `${s * (0.6 + Math.random() * 0.4)}px`;
    el.style.opacity = (0.18 + Math.random() * 0.35).toFixed(2);
  });
  scatter(document.getElementById("zoom-near"), 34, (el) => {
    el.className = "mote";
    const s = 18 + Math.random() * 50;
    el.style.width = el.style.height = `${s}px`;
    el.style.opacity = (0.35 + Math.random() * 0.5).toFixed(2);
    el.style.animationDelay = `${-Math.random() * 14}s`;
  });
  return {
    setRing(ring) {
      document.documentElement.style.setProperty("--room-scale", RING_SCALE[ring]);
    },
  };
}
