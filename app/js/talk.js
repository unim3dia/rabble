// Saying something to the pile. The card asks today's question; what you type
// goes up over you exactly as you wrote it, and stays a while so others in the
// pile can answer it. (The pile's own conversations play here too.)
import { pileLetters } from "./ui.js";

const $ = (s) => document.querySelector(s);
// The empty card's hint (today's question once it's known), in a little heap
// like the ring button's letters.
let hintRows = ["say", "something", "to the pile"];

// What you type, broken into rows that widen toward the bottom, like a heap.
function heapRows(text) {
  const words = text.split(/(?<= )/);      // keep the spaces with the words
  const count = Math.max(1, Math.min(6, Math.round(Math.sqrt(text.length / 4))));
  const weights = count * (count + 1) / 2;
  const rows = [];
  let row = "", done = 0;
  for (const word of words) {
    const goal = (text.length * (rows.length + 1) * (rows.length + 2)) / 2 / weights;
    if (row && rows.length < count - 1 && done + row.length + word.length / 2 > goal) {
      rows.push(row);
      done += row.length;
      row = "";
    }
    row += word;
  }
  rows.push(row);
  return rows;
}
const BETWEEN_REPLIES_MS = 3600;
const READ_MS = 6500;            // how long the last line stays once it's in

export function setupTalk({ getYou, send, onSaid, onThinking, onTyping, cards, sfx }) {
  const form = $("#say");
  const input = $("#say-input");
  let busy = false;

  // The card shows a heap of letters: the hint while it's empty, then your own
  // words as you type them, each new letter tumbling in.
  const hint = $("#say-hint");
  let shown = 0;
  const showLetters = () => {
    const text = input.value.replace(/\s+/g, " ");
    const typed = text.trim().length > 0;
    hint.classList.toggle("typed", typed);
    const rows = typed ? heapRows(text) : hintRows;
    const count = rows.join("").length;
    pileLetters(hint, rows, { animateFrom: typed && count > shown ? shown : typed ? count : 0 });
    shown = typed ? count : 0;
  };
  input.addEventListener("input", showLetters);

  // Keep the card just above the phone's keyboard: follow the part of the
  // screen that's actually visible, not the page behind the keyboard.
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv || form.hidden) return;
    const keyboard = window.innerHeight - (vv.height + vv.offsetTop);
    if (keyboard > 80) {
      form.style.top = `${vv.offsetTop + vv.height - form.offsetHeight - 10}px`;
      form.style.bottom = "auto";
    } else if (!form.style.left) {          // beside you: it stays where it opened
      form.style.top = form.style.bottom = "";
    }
  };
  vv?.addEventListener("resize", fit);
  vv?.addEventListener("scroll", fit);

  // Opened from your light: the card sits beside you in the pile (on the side
  // with more room), not down in the corner.
  const BESIDE_PX = 26;
  const placeBeside = (at) => {
    const side = form.offsetWidth, room = window.innerWidth;
    const left = at.x + BESIDE_PX + side < room - 12 ? at.x + BESIDE_PX : at.x - BESIDE_PX - side;
    const top = Math.min(window.innerHeight - side - 90, Math.max(70, at.y - side / 2));
    form.style.left = `${Math.max(12, left)}px`;
    form.style.top = `${top}px`;
    form.style.right = form.style.bottom = "auto";
  };

  const open = (at) => {
    form.hidden = false;
    if (at) placeBeside(at);
    showLetters();
    $("#say-btn").setAttribute("aria-expanded", "true");
    onTyping?.(true);        // others' words wait until you've said yours, so you see them
    input.focus();
    fit();
  };
  const close = () => {
    form.hidden = true;
    form.style.top = form.style.bottom = form.style.left = form.style.right = "";
    $("#say-btn").setAttribute("aria-expanded", "false");
    onTyping?.(false);
    input.blur();
  };
  $("#say-btn").addEventListener("click", () => (form.hidden ? open() : close()));
  // Enter sends; Shift+Enter makes a new line.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const you = getYou();
    const text = input.value.trim();
    if (!you || !text || busy) return;
    busy = true;
    onThinking?.(true);      // the pile hushes its own chat to listen
    input.value = "";
    close();
    sfx.unlock();
    const thinking = cards.show(you, "…", { cls: "yours thinking", ms: 60000 });
    let out;
    try {
      out = await send(text);
    } catch (err) {
      thinking.el.dismiss();
      // Only you see why it didn't go up (unkind, identifying, or a worry): time to read it.
      cards.show(you, err.message, { cls: "yours note", ms: 9000 });
      onThinking?.(false);
      busy = false;
      return;
    }
    thinking.el.dismiss();
    onSaid(out);
    busy = false;
  });

  return {
    // Open (or close) the card beside a spot on screen: your light.
    toggleAt(at) { if (form.hidden) open(at); else close(); },
    openAt(at) { if (form.hidden) open(at); },
    setQuestion(q) {
      hintRows = heapRows(q);
      $("#say-input").setAttribute("aria-label", q);
      if (!form.hidden) showLetters();
    },
  };
}

function stop(timers, shown) {
  timers.forEach(clearTimeout);
  for (const el of shown) {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 900);
  }
}

// The pile starts a conversation of its own: a few lines from people around
// you, a few moments apart, each with its little sound.
// Returns { ms, cancel } (cancel stops it and clears its cards when someone speaks up).
export function playLines({ lines, speakers, cards, sfx }) {
  const at = (i) => i * BETWEEN_REPLIES_MS;
  const total = at(lines.length - 1) + READ_MS + 2000;
  const shown = [];
  const timers = lines.map((line, i) => setTimeout(() => {
    const who = speakers[i];
    if (!who) return;
    shown.push(cards.show(who, line.text, { ms: total - at(i) }).el);
    sfx.express(line.tone);
  }, at(i)));
  return { ms: total, cancel: () => stop(timers, shown) };
}
