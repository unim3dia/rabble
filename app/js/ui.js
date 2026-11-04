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

export function createUi({ onRing, onRoll, onLeave, onSound, onMenu }) {
  const menu = $("#corner-menu");
  const cornerBtn = $("#corner-btn");
  const mine = $("#mine");
  let mineImg = null;
  let ring = null;
  // Measure again once the display font has loaded (it changes letter widths).
  document.fonts?.ready.then(() => ring && pileLetters($("#ring-letters"), RING_ROWS[ring]));

  const closeMenu = () => {
    menu.hidden = true;
    cornerBtn.setAttribute("aria-expanded", "false");
  };

  cornerBtn.addEventListener("click", () => {
    onMenu?.();
    menu.hidden = !menu.hidden;
    cornerBtn.setAttribute("aria-expanded", String(!menu.hidden));
  });
  $("#ring").addEventListener("click", onRing);   // (plays the chance sound in onRing)
  $("#m-ring").addEventListener("click", onRing);
  $("#m-roll").addEventListener("click", () => { closeMenu(); onRoll(); });
  $("#m-leave").addEventListener("click", () => { closeMenu(); onLeave(); });
  for (const id of ["#sound", "#m-sound"]) $(id).addEventListener("click", onSound);

  const showMine = () => {
    if (!mineImg) return;
    $("#mine-img").src = mineImg.src;
    closeMenu();
    mine.showModal();
  };
  $("#mine-open").addEventListener("click", showMine);
  $("#m-mine").addEventListener("click", showMine);
  $("#mine-close").addEventListener("click", () => mine.close());

  return {
    enterPile() { document.body.classList.add("in-pile"); },
    leavePile() { document.body.classList.remove("in-pile"); closeMenu(); },
    setRing(next) {
      ring = next;
      pileLetters($("#ring-letters"), RING_ROWS[ring]);
      $("#ring").setAttribute("aria-label", `${RING_NAMES[ring]}. Tap to widen who's in the pile.`);
      $("#m-ring").textContent = `${RING_NAMES[ring]} ›`;
    },
    setMine(img) {
      mineImg = img;
      $("#mine-open").hidden = !img;
      $("#m-mine").hidden = !img;
    },
    setSound(on) {
      for (const id of ["#sound", "#m-sound"]) {
        $(id).setAttribute("aria-pressed", String(on));
        $(id).textContent = on ? "Sound on" : "Sound off";
      }
    },
  };
}
