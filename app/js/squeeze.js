// A squeeze: one real person reaching another. A small warm glow leaves the
// sender, arcs over the pile to the other person, and they give a little
// squish when it lands. Every phone animates it on its own; the server only
// says who sent it to whom.

const TRAVEL_MS = 1100;
const ARC = 0.35;                 // how high the glow arcs, as a share of the distance

const at = (p) => ({ x: p.sx, y: p.sy - p.size * 0.45 });
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export function sendSqueeze(overlay, from, to, { onArrive, lovely = false } = {}) {
  const el = document.createElement("div");
  el.className = `squeeze${lovely ? " lovely" : ""}`;
  el.setAttribute("aria-hidden", "true");
  overlay.appendChild(el);
  from.squish = Math.max(from.squish, 0.18);
  const start = performance.now();
  function step(now) {
    const k = Math.min(1, (now - start) / TRAVEL_MS);
    const a = at(from), b = at(to), e = ease(k);
    const lift = Math.hypot(b.x - a.x, b.y - a.y) * ARC * Math.sin(Math.PI * e);
    const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e - lift;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${0.7 + 0.5 * Math.sin(Math.PI * e)})`;
    if (k < 1) return requestAnimationFrame(step);
    el.classList.add("landed");
    setTimeout(() => el.remove(), 600);
    to.squish = Math.max(to.squish, 0.35);
    onArrive?.();
  }
  requestAnimationFrame(step);
}
