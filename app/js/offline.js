// The pile without a server (the GitHub page): the same shape as the shared
// pile, but its talk is a night of conversations Muse Spark wrote ahead of
// time (app/offline.json), and what you say gets an answer from the ones it
// recorded for things people often say.

const LINE_MS = 3600, READ_MS = 7000;      // how long a conversation plays (matches the server)
const GAP_MS = [5000, 10000];
const FIRST_MS = 2500;
const THINK_MS = 1600;

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

export function connectOffline({ onChat }) {
  let talks = [], sayings = {}, next = 0, busyUntil = 0;
  const ready = fetch("offline.json").then((r) => r.json()).then((d) => {
    talks = d.conversations || [];
    sayings = d.sayings || {};
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

  // Your words stay yours here (there's no AI to reword them); someone answers
  // from what the pile said to something like it, or to "hello" if nothing fits.
  async function say(text) {
    await ready;
    await new Promise((r) => setTimeout(r, THINK_MS));
    const out = closest(sayings, text);
    const fallback = sayings["hello everyone"] || { replies: [] };
    const replies = (out || fallback).replies;
    busyUntil = Date.now() + (replies.length + 1) * LINE_MS + READ_MS;
    return out || { you: text, youTone: "smile", replies };
  }

  return {
    offline: true,
    join: async () => ({ id: "you", token: "offline" }),
    leave() {},
    say,
    get id() { return "you"; },
  };
}
