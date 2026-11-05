// Speech cards: what people say in the pile, shown as stickers (paper, glossy
// vinyl, or holographic chrome for the moments that matter) whose words fade
// in one at a time. A card floats above its
// speaker, never covers your face, and never lands on another card.

const MAX_CARDS = 2;             // at most two stickers at once, so the faces stay clear
const MAX_TILT_DEG = 7;
const RIP_PX = 3.5;               // how far the ripped edge bites into the sticker

// A ripped, slightly warped sticker edge: a polygon around the box whose points
// wander inward by a few pixels. Every sticker gets its own.
function rippedEdge() {
  const pts = [];
  const bite = () => (Math.random() * RIP_PX).toFixed(1);
  const along = (n, f) => { for (let i = 0; i < n; i++) pts.push(f(i / n)); };
  along(9, (t) => `${(t * 100).toFixed(1)}% ${bite()}px`);
  along(4, (t) => `calc(100% - ${bite()}px) ${(t * 100).toFixed(1)}%`);
  along(9, (t) => `${(100 - t * 100).toFixed(1)}% calc(100% - ${bite()}px)`);
  along(4, (t) => `${bite()}px ${(100 - t * 100).toFixed(1)}%`);
  return `polygon(${pts.join(", ")})`;
}
const READ_FIRST_MS = 2500;

export function createCards(overlay) {
  // Show a card over someone. Returns { el, done } where done resolves once the
  // words have all appeared. opts.cls adds a style, opts.ms how long it stays,
  // opts.actions ([{ label, onClick }]) small buttons on it (one press, then gone),
  // opts.onTap what tapping the card itself does.
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
    el.style.setProperty("--tilt", `${(Math.random() * 2 - 1) * MAX_TILT_DEG}deg`);   // slapped on by hand
    el.style.setProperty("--rip", rippedEdge());
    el.style.setProperty("--sway", `${(5 + Math.random() * 3).toFixed(1)}s`);   // each floats at its own pace
    el._person = person;
    // Hands on: press and hold a sticker, then drag, to move it (it stays put);
    // tap it to peel it off. Your own words (opts.onTap) open the message box
    // instead, and a tucked sticker (zoomed in) opens to be read first.
    if (!opts.actions?.length) grabbable(el);   // stickers with buttons stay put; their buttons decide
    el.addEventListener("click", (e) => {
      if (e.target.closest(".card-action") || el.classList.contains("has-action")) return;   // its buttons decide
      e.stopPropagation();
      if (el._dragged) { el._dragged = false; return; }
      if (el.classList.contains("tucked") && !el.classList.contains("open")) el.classList.add("open");
      else if (opts.onTap && !el.classList.contains("tucked")) opts.onTap();
      else peel(el);
    });
    // Its own little place in the air: a slight offset and a slow float.
    el._drift = { x: (Math.random() - 0.5) * 36, y: Math.random() * 22, phase: Math.random() * Math.PI * 2 };
    overlay.appendChild(el);
    // Never more than a few on screen: the oldest quietly makes room.
    const showing = [...overlay.querySelectorAll(".card:not(.leaving):not(.yours)")];   // your words stay up
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
const GLIDE = 0.04;      // per frame, how gently a sticker eases toward its spot
const MAX_GLIDE_PX = 1.4; // …and never faster than this per frame
const ROOM = 26;         // px between the stickers and the top of the pile: they keep clear of heads

// Cards float in the air above the pile, never over it: each one as close
// above its speaker as it can be, a little off-line from the others so they
// hang loosely in the space, drifting gently, with a faint thread down to
// whoever is speaking. `ceiling` is where the space
// starts (under the title), `floor` the top of the pile on screen, and `zoom`
// how far you've zoomed in: the cards grow with the people.
const HOLD_MS = 300;
const HOLD_SLOP_PX = 10;

function grabbable(el) {
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".card-action")) return;
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let held = false;
    const hold = setTimeout(() => { held = true; el.classList.add("held"); navigator.vibrate?.(8); }, HOLD_MS);
    const move = (ev) => {
      if (!held) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > HOLD_SLOP_PX) clearTimeout(hold);
        return;
      }
      const r = el.parentElement.getBoundingClientRect();
      el._pinned = { x: ev.clientX - r.left - el.offsetWidth / 2, y: ev.clientY - r.top - el.offsetHeight / 2 };
      el._dragged = true;
    };
    const up = () => {
      clearTimeout(hold);
      el.classList.remove("held");
      el.removeEventListener("pointermove", move);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up, { once: true });
    el.addEventListener("pointercancel", up, { once: true });
  });
}

// Peeled off: it lifts at a corner and is gone.
function peel(el) {
  el.classList.add("peeled");
  setTimeout(() => el.remove(), 450);
}

// A sticker you placed by hand stays there (with the same gentle float).
function placePinned(el, t) {
  const drift = el._drift || { phase: 0 };
  const x = el._pinned.x + Math.sin(t * 0.35 + drift.phase) * 3;
  const y = el._pinned.y + Math.sin(t * 0.5 + drift.phase * 1.3) * 2.5;
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  el.classList.add("no-tail");
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

// Zoomed in close, stickers stay up in the sky, just above the frame: only a
// sliver peeks down over their speaker. Tap the sliver and it drops in to be read.
const PEEK_PX = 14;
function tuck(cards, w, ceiling) {
  const placed = [];
  for (const el of cards) {
    el.classList.add("tucked", "no-tail");
    const cw = el.offsetWidth, ch = el.offsetHeight;
    let x = Math.max(8, Math.min(w - cw - 8, (el._person?.sx ?? w / 2) - cw / 2));
    for (const b of placed) if (x < b.x + b.w + GAP && x + cw + GAP > b.x) x = Math.min(w - cw - 8, b.x + b.w + GAP);
    const y = el.classList.contains("open") ? ceiling : PEEK_PX - ch;
    placed.push({ x, w: cw });
    const at = el._at || { x, y };
    at.x += (x - at.x) * GLIDE;
    at.y += (y - at.y) * GLIDE;
    el._at = at;
    el.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
  }
}

export function placeCards(overlay, { w, ceiling, floor, zoom = 1, tucked = false }) {
  const now = performance.now() / 1000;
  const cards = [...overlay.querySelectorAll(".card")].filter((el) => el._person);
  const pinned = cards.filter((el) => el._pinned).map((el) => placePinned(el, now));
  const all = cards.filter((el) => !el._pinned);
  if (tucked) return tuck(all, w, ceiling);
  for (const el of all) el.classList.remove("tucked", "open");
  const placed = [...pinned];
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
    // Keep its spot while that spot stays clear: stickers don't hop about.
    if (el._spot) {
      const c = { x: clampX(el._spot.x), y: el._spot.y, w: bw, h: bh };
      if (free(c) && c.y >= ceiling - 0.5 && c.y + bh <= bottom + bh * 0.5) box = c;
    }
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
    el._spot = { x: box.x, y: box.y };
    placed.push({ ...box });
    const t = performance.now() / 1000;
    // Glide, don't jump: when a sticker must make room, it eases over to its new spot.
    const at = el._at || { x: box.x, y: box.y };
    const ease = (d) => Math.max(-MAX_GLIDE_PX, Math.min(MAX_GLIDE_PX, d * GLIDE));   // soft, and never fast
    at.x += ease(box.x - at.x);
    at.y += ease(box.y - at.y);
    el._at = at;
    box.x = at.x + Math.sin(t * 0.35 + drift.phase) * 4;
    box.y = at.y + Math.sin(t * 0.5 + drift.phase * 1.3) * 3.5;
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
