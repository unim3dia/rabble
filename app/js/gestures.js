// How the pile answers with its bodies. Along with its words, the AI picks one
// gesture from what you actually said, and the people around you do it:
//   cheer    a small win: a few people bounce, each with its note
//   lean     a hard or tired day: people lean in toward you; the pile hushes
//   chuckle  something playful: a ripple of little laughs
//   doze     winding down: the people nearby settle and doze off
import { doze } from "./poses.js";

const LEAN_MS = 7000;
const HUSH_LEAN_MS = 25000;
const HUSH_DOZE_MS = 40000;

// people: those nearest you, nearest first. hush(ms): quiet the pile's chatter.
export function react(gesture, you, people, { sfx, hush }) {
  if (gesture === "cheer") {
    people.slice(0, 5).forEach((p, i) => setTimeout(() => {
      p.hop = 1;
      p.squish = Math.max(p.squish, 0.25);
      sfx.note(p.info.slug);
    }, i * 140));
  } else if (gesture === "lean") {
    hush(HUSH_LEAN_MS);
    sfx.express("aww");
    for (const p of people.slice(0, 4)) {
      p.nodTarget = Math.sign(you.pos.x - p.pos.x) || 1;
      setTimeout(() => { p.nodTarget = 0; }, LEAN_MS);
    }
  } else if (gesture === "chuckle") {
    people.slice(0, 4).forEach((p, i) => setTimeout(() => {
      p.squish = Math.max(p.squish, 0.22);
      if (i < 3) sfx.express("chuckle");
    }, i * 220));
  } else if (gesture === "doze") {
    hush(HUSH_DOZE_MS);
    sfx.express("sigh");
    people.slice(0, 5).forEach((p, i) => setTimeout(() => doze(p), 400 + i * 500));
  }
}
