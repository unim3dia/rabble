// The pile without a server (the GitHub page): the same shape as the shared
// pile, but its talk is a night of conversations Muse Spark wrote ahead of
// time (app/offline.json). What you say stays as you wrote it, and a clay
// companion answers with one of the lines it recorded for things people often
// say. No one else is here, so there's no one to squeeze back.

const LINE_MS = 3600, READ_MS = 7000;      // how long a conversation plays (matches the server)
const GAP_MS = [35000, 70000];             // room between conversations, as on the server
const FIRST_MS = 2500;
const THINK_MS = 900;
const ANSWER_MS = 5000;                     // a companion answers after this (no one else is here)

const between = ([a, b]) => a + Math.random() * (b - a);
const words = (s) => new Set(s.toLowerCase().match(/[a-z']+/g) || []);

function closest(sayings, text) {
  const mine = words(text);
  let best = null, score = 0;
  for (const [said, out] of Object.entries(sayings)) {
    const theirs = words(said);
    const shared = [...theirs].filter((w) => mine.has(w)).length / theirs.size;
    if (shared > score) { best = out; score = shared; }
  }
  return score >= 0.5 ? best : null;
}

export function connectOffline({ onChat, onReply, onQuestion }) {
  let talks = [], sayings = {}, anything = [], next = 0, busyUntil = 0;
  const ready = fetch("offline.json").then((r) => r.json()).then((d) => {
    talks = d.conversations || [];
    sayings = d.sayings || {};
    anything = d.anything || [];
    talks.sort(() => Math.random() - 0.5);
  }).catch(() => {});

  async function play() {
    await ready;
    const wait = busyUntil - Date.now();
    if (wait > 0 || !talks.length) return setTimeout(play, Math.max(wait, 1000));
    const lines = talks[next++ % talks.length];
    onChat({ lines });
    busyUntil = Date.now() + lines.length * LINE_MS + READ_MS;
    setTimeout(play, busyUntil - Date.now() + between(GAP_MS));
  }
  setTimeout(play, FIRST_MS);
  fetch("questions.json").then((r) => r.json())
    .then((qs) => onQuestion(qs[Math.floor(Date.now() / 86400000) % qs.length])).catch(() => {});

  // Your words go up as you wrote them; a companion answers from what it said
  // to something like it, or with one of its warm answers for anything.
  async function say(text) {
    await ready;
    await new Promise((r) => setTimeout(r, THINK_MS));
    const sid = Math.random().toString(36).slice(2, 10);
    const known = closest(sayings, text)?.replies?.[0];
    const reply = known || anything[Math.floor(Math.random() * anything.length)];
    busyUntil = Date.now() + ANSWER_MS + LINE_MS + READ_MS;
    // Recorded answers have no gesture: their tone stands in for one.
    const gesture = { chuckle: "chuckle", aww: "lean", sigh: "lean", hmm: "lean" }[reply?.tone] || "cheer";
    if (reply) setTimeout(() => onReply({ to: "you", sid, gesture, ...reply }), ANSWER_MS);
    return { sid, text };
  }

  return {
    offline: true,
    join: async () => ({ id: "you", token: "offline" }),
    leave() {},
    say,
    get id() { return "you"; },
  };
}
