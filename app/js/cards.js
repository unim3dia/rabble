// Speech cards: what people say in the pile, shown as stickers (paper, glossy
// vinyl, or holographic chrome for the moments that matter) whose words fade
// in one at a time. A card floats above its
// speaker, never covers your face, and never lands on another card.

const MAX_CARDS = 3;
const MAX_TILT_DEG = 4;
const READ_FIRST_MS = 2500;

export function createCards(overlay) {
  // Show a card over someone. Returns { el, done } where done resolves once the
  // words have all appeared. opts.cls adds a style, opts.ms how long it stays,
  // opts.actions ([{ label, onClick }]) small buttons on it (one press, then gone).
  function show(person, text, opts = {}) {
    const el = document.createElement("div");
    el.className = `card ${opts.cls || ""}`;
    const inner = document.createElement("div");
    inner.className = "card-inner";
    el.append(inner);
    const words = text.split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
      const w = document.createElement("span");
      w.className = "card-word";
      w.textContent = word;
      w.style.animationDelay = `${180 + i * (opts.wordMs ?? 130)}ms`;
      inner.append(w, " ");
    });
    if (opts.actions?.length) {
      const row = document.createElement("div");
      row.className = "card-actions";
      for (const action of opts.actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `card-action ${action.quiet ? "quiet" : ""}`;
        btn.textContent = action.label;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          row.querySelectorAll("button").forEach((b) => { b.disabled = true; });
          btn.classList.add("sent");
          action.onClick();
        });
        row.append(btn);
      }
      el.classList.add("has-action");
      el.append(row);
    }
    el.style.setProperty("--tilt", `${(Math.random() * 2 - 1) * MAX_TILT_DEG}deg`);   // stuck on by hand
    el._person = person;
    // Its own little place in the air: a slight offset and a slow float.
    el._drift = { x: (Math.random() - 0.5) * 36, y: Math.random() * 22, phase: Math.random() * Math.PI * 2 };
    overlay.appendChild(el);
    // Never more than a few on screen: the oldest quietly makes room.
    const showing = [...overlay.querySelectorAll(".card:not(.leaving)")];
    for (const old of showing.slice(0, Math.max(0, showing.length - MAX_CARDS))) {
      old.classList.add("leaving");
      setTimeout(() => old.remove(), 900);
    }
    const stay = opts.ms ?? 7000;
    const out = setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 900);
    }, stay);
    el.dismiss = () => { clearTimeout(out); el.remove(); };
    const writeMs = 180 + words.length * (opts.wordMs ?? 130);
    const done = new Promise((r) => setTimeout(r, writeMs));
    // Once it's written and there's been a moment to read it, the card slowly
    // drifts: forward (a little bigger) or back into the room (a little smaller).
    setTimeout(() => el.classList.add(Math.random() < 0.5 ? "forward" : "recede"), writeMs + READ_FIRST_MS);
    return { el, done };
  }

  return { show };
}

const GAP = 6;
const ROOM = 8;          // px between the cards and the top of the pile

// Cards float in the air above the pile, never over it: each one as close
// above its speaker as it can be, a little off-line from the others so they
// hang loosely in the space, drifting gently, with a faint thread down to
// whoever is speaking. `ceiling` is where the space
// starts (under the title), `floor` the top of the pile on screen, and `zoom`
// how far you've zoomed in: the cards grow with the people.
export function placeCards(overlay, { w, ceiling, floor, zoom = 1 }) {
  const placed = [];
  const hits = (a, b) => a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x && a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y;
  const free = (box) => !placed.some((b) => hits(box, b));
  const bottom = Math.max(ceiling, floor - ROOM);
  for (const el of overlay.querySelectorAll(".card")) {
    const p = el._person;
    if (!p) continue;
    const cw = el.offsetWidth, ch = el.offsetHeight;      // its own size…
    const bw = cw * zoom, bh = ch * zoom;                  // …and on screen
    const clampX = (x) => Math.max(8, Math.min(w - bw - 8, x));
    const drift = el._drift || { x: 0, y: 0, phase: 0 };
    const home = clampX(p.sx - bw / 2 + drift.x);
    // Try rows from the pile's top edge upward; in each row, right above the
    // speaker first, then a step to either side.
    let box = null;
    for (let y = bottom - bh - drift.y; !box && y >= ceiling - 0.5; y -= bh + GAP) {
      for (const dx of [0, bw + GAP, -(bw + GAP), 2 * (bw + GAP), -2 * (bw + GAP)]) {
        const c = { x: clampX(home + dx), y, w: bw, h: bh };
        if (free(c)) { box = c; break; }
      }
    }
    // No room left above the pile (you've zoomed right in): from the top of the
    // screen down, the first spot that's clear of the other cards.
    for (let y = ceiling; !box && y < ceiling + 6 * (bh + GAP); y += bh + GAP) {
      for (const dx of [0, bw + GAP, -(bw + GAP), 2 * (bw + GAP), -2 * (bw + GAP)]) {
        const c = { x: clampX(home + dx), y, w: bw, h: bh };
        if (free(c)) { box = c; break; }
      }
    }
    box = box || { x: home, y: ceiling, w: bw, h: bh };
    placed.push(box);
    const t = performance.now() / 1000;
    box.x += Math.sin(t * 0.35 + drift.phase) * 3;
    box.y += Math.sin(t * 0.5 + drift.phase * 1.3) * 2.5;
    // Scaled from its bottom middle, so move it to keep the scaled box in place.
    el.style.transform = `translate3d(${box.x + (bw - cw) / 2}px, ${box.y + bh - ch}px, 0) scale(${zoom})`;
    // The line from the card down to just above the speaker's head.
    const dx = p.sx - (box.x + bw / 2);
    const dy = p.sy - p.size * 0.85 - (box.y + bh);
    el.style.setProperty("--tail-len", `${Math.max(0, Math.hypot(dx, dy) - 4) / zoom}px`);
    el.style.setProperty("--tail-angle", `${Math.atan2(-dx, dy)}rad`);
    el.classList.toggle("no-tail", dy < 6);
  }
}
