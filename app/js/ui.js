// The buttons around the pile. Before you join: title, ring button, join and
// a few chips. Once you're in the pile all of that fades away and only one
// small corner button stays, opening a menu (my Rabble, ring, sound, roll out,
// leave).
const $ = (s) => document.querySelector(s);

const RING_NAMES = { neighborhood: "Neighborhood", city: "City", state: "State", world: "World" };

// The word in rows read top to bottom, widest at the bottom, like a heap.
const RING_ROWS = {
  neighborhood: ["nei", "ghbo", "rhood"],
  city: ["c", "ity"],
  state: ["st", "ate"],
  world: ["wo", "rld"],
};

// Lay the letters out in a little pile, each one tilted and nudged a bit, as big
// as they can be while still fitting the card, and let them tumble in from above.
// Letters before `animateFrom` appear in place (when a pile is rebuilt as you type).
export function pileLetters(card, rows, { animateFrom = 0 } = {}) {
  card.replaceChildren();
  const letters = [];
  let n = 0;
  rows.forEach((row) => {
    const line = document.createElement("span");
    line.className = "ring-row";
    for (const ch of row) {
      const el = document.createElement("span");
      el.className = "ring-letter";
      el.textContent = ch === " " ? "\u00a0" : ch;
      el.style.rotate = `${((n * 37) % 19) - 9}deg`;   // the same tilt every time it's rebuilt
      if (n < animateFrom) el.style.animation = "none";
      else el.style.animationDelay = `${(n - animateFrom) * 35}ms`;
      n++;
      letters.push(el);
      line.append(el);
    }
    card.append(line);
  });
  // Measure the rows themselves (overflow above the card wouldn't show in scrollHeight).
  const room = () => {
    const cs = getComputedStyle(card);
    return {
      h: card.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      w: card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    };
  };
  const fits = () => {
    const { h, w } = room();
    const rows = [...card.children];
    const height = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    return height <= h + 0.5 && rows.every((row) => row.scrollWidth <= w + 0.5);
  };
  // As big as fits: halve the range until we find it.
  const setSize = (px) => letters.forEach((el) => { el.style.fontSize = `${px}px`; });
  let lo = 8, hi = Math.max(lo, card.clientHeight);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    setSize(mid);
    if (fits()) lo = mid; else hi = mid;
  }
  setSize(lo);
}

// The start screen's ring and sound buttons, and in the pile the bottom row:
// find yourself, say something (see talk.js), sound, widen the ring, and the
// door: a kind check, a thank-you, then back to the start.
const THANKS_MS = 2200;

// The ring button's icon shows where you are: a house, the city's buildings,
// a flag, the globe. (Line drawings, like the rest of the bottom row.)
const RING_ICONS = {
  neighborhood: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9.5h11V10"/><path d="M10.5 19.5v-5h3v5"/>',
  city: '<path d="M3.5 20.5h17"/><path d="M5 20.5V9.5h5v11"/><path d="M10 20.5V4.5h6v16"/><path d="M16 20.5v-8h3.5v8"/><path d="M12 8h2M12 11h2M12 14h2M7 12.5h1M7 15.5h1"/>',
  state: '<path d="M5 21V3.5"/><path d="M5 4.5h14v9.5H5"/><path d="M5 4.5h6.5V9H5z"/><path d="M11.5 6.5H19M11.5 9H19M5 11.5h14"/><circle cx="7" cy="6.2" r="0.35"/><circle cx="9.4" cy="6.2" r="0.35"/><circle cx="8.2" cy="7.6" r="0.35"/>',
  world: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/>',
};

export function createUi({ onRing, onLeave, onSound, onFind }) {
  const mine = $("#mine");
  const leave = $("#leave");
  let mineImg = null;
  let ring = null;
  // Measure again once the display font has loaded (it changes letter widths).
  document.fonts?.ready.then(() => ring && pileLetters($("#ring-letters"), RING_ROWS[ring]));

  $("#ring").addEventListener("click", onRing);   // (plays the chance sound in onRing)
  $("#world-btn").addEventListener("click", onRing);
  $("#find-btn").addEventListener("click", onFind);
  for (const id of ["#sound", "#sound-btn"]) $(id).addEventListener("click", onSound);

  $("#leave-btn").addEventListener("click", () => {
    $(".leave-ask").hidden = false;
    $(".leave-thanks").hidden = true;
    leave.showModal();
  });
  $("#leave-stay").addEventListener("click", () => leave.close());
  $("#leave-go").addEventListener("click", () => {
    $(".leave-ask").hidden = true;
    $(".leave-thanks").hidden = false;
    setTimeout(() => { leave.close(); onLeave(); }, THANKS_MS);
  });

  $("#mine-open").addEventListener("click", () => {
    if (!mineImg) return;
    $("#mine-img").src = mineImg.src;
    mine.showModal();
  });
  $("#mine-close").addEventListener("click", () => mine.close());

  return {
    enterPile() { document.body.classList.add("in-pile"); },
    leavePile() { document.body.classList.remove("in-pile"); },
    setRing(next) {
      ring = next;
      pileLetters($("#ring-letters"), RING_ROWS[ring]);
      $("#ring").setAttribute("aria-label", `${RING_NAMES[ring]}. Tap to widen who's in the pile.`);
      $("#world-btn").setAttribute("aria-label", `${RING_NAMES[ring]}. Tap to widen the ring.`);
      $("#world-btn svg").innerHTML = RING_ICONS[ring] || RING_ICONS.world;
    },
    setMine(img) {
      mineImg = img;
      $("#mine-open").hidden = !img;
    },
    setSound(on) {
      $("#sound").setAttribute("aria-pressed", String(on));
      $("#sound").textContent = on ? "Sound on" : "Sound off";
      $("#sound-btn").setAttribute("aria-pressed", String(on));
      $("#sound-btn").setAttribute("aria-label", on ? "Sound on" : "Sound off");
    },
  };
}
