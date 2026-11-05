// The first minute in the pile. You're caught; someone beside you says "There
// you are. We made room."; your light says "You" for a moment; then a person
// next to you asks today's question. Tap the question (or "Answer") to say
// something, or choose "Just sitting": the people around you settle and doze
// while the room's conversation carries on softly around you.
import { doze } from "./poses.js";

const GREET_AFTER_MS = 700;
const GREET_MS = 4200;
const TAG_AFTER_MS = 1500;
const TAG_MS = 3200;
const ASK_AFTER_MS = 4600;
const QUESTION_MS = 60000;        // the question waits for you, as long as a minute
const ROOM_FOR_ANSWER_MS = 6000;   // after the question, the Journey waits this long before carrying on
const SETTLE_COUNT = 6;

// neighbours(): the people nearest you, nearest first. hush(ms): quiet the
// pile's own chatter for a while. openAnswer(): open the answer box beside you.
export function createWelcome({ app, cards, sfx, neighbours, hush, openAnswer }) {
  let asked = null;
  let asker = null;

  function begin() {
    asker = neighbours()[0] || null;
    hush(ASK_AFTER_MS + ROOM_FOR_ANSWER_MS);
    setTimeout(() => {
      if (!asker) return;
      cards.show(asker, "There you are. We made room.", { cls: "companion", ms: GREET_MS });
      sfx.express("smile");
    }, GREET_AFTER_MS);
    setTimeout(() => { if (app.you) cards.show(app.you, "You", { cls: "you-tag", ms: TAG_MS }); }, TAG_AFTER_MS);
    setTimeout(ask, ASK_AFTER_MS);
  }

  function ask() {
    if (!app.question || !app.you || app.said || !asker) return;
    const answer = () => { done(); openAnswer(); };
    asked = cards.show(asker, app.question, {
      cls: "question",
      ms: QUESTION_MS,
      actions: [
        { label: "Answer", onClick: answer },
        { label: "Just sitting", quiet: true, onClick: sit },
      ],
    }).el;
    asked.addEventListener("click", answer, { once: true });    // the question itself opens the answer
    sfx.express("idea");
  }

  // The question has been answered (or set aside): it steps away.
  function done() {
    asked?.classList.add("leaving");
    asked = null;
  }

  function sit() {
    done();                       // the room keeps talking softly; the people beside you doze
    neighbours().slice(0, SETTLE_COUNT).forEach((p, i) => setTimeout(() => doze(p), 300 + i * 400));
    setTimeout(() => {
      if (asker) cards.show(asker, "Stay as long as you like.", { cls: "companion small", ms: 5000 });
    }, 1000);
    sfx.express("sigh");
  }

  return { begin, done };
}
