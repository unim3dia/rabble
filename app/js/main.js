// Rabble: a pile of tiny people awake right now. Drop in and be held.
import {
  RINGS, CROWD, PHYS, SIZE, CAMERA, BREATH, SQUISH, TILT, FLOW, CLOSEUP, POSE,
} from "./config.js";
import { createWorld, addBody, removeBody, step, presettle, conePositions, nudge, wakeNear } from "./physics3d.js";
import { createCamera, updateCamera, unproject, cameraDepth } from "./camera.js";
import { createRenderer, draw } from "./render.js";
import { createTilt } from "./tilt.js";
import { createSfx } from "./sfx.js";
import { createCards, placeCards } from "./cards.js";
import { startDropIn } from "./dropin.js";
import { rollOut, stepRolling, dropIn, stepSizes } from "./crowd.js";
import { setupControls } from "./controls.js";
import { createUi } from "./ui.js";
import { createLighting } from "./lighting.js";
import { setupTalk, playLines } from "./talk.js";
import { sendSqueeze } from "./squeeze.js";
import { connectPile } from "./shared.js";
import { connectOffline } from "./offline.js";
import { createRoom } from "./room.js";
import { makeRabbleFromPhoto } from "./selfie.js";
import { setPose, settlePose, stepPose, shiftSomeone, nextShiftDelay, doze } from "./poses.js";

const $ = (s) => document.querySelector(s);
const STEP = 1000 / 60;
const DEG = Math.PI / 180;

const canvas = $("#pile");
const overlay = $("#overlay");
const joinBtn = $("#join");
const joinLabel = $(".join-label");
const hint = $("#hint");
const awakeText = $("#awake-text");
const layers = [...document.querySelectorAll(".layer")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const app = {
  ring: "neighborhood",
  roster: [],
  poses: new Map(),      // slug -> { open, curl, drape, lean, prop, chin, snuggle } images
  you: null,
  youPoses: null,
  dropping: null,
  joined: false,
  scene: { glow: null, tilt: 0 },
  arriving: [],          // newcomers waiting to tumble in
  leaving: [],           // people waiting to roll out
  nextArrive: 0,
  nextLeave: 0,
  nextAmbient: 0,
  nextCount: 0,
  nextMenuArrival: 0,
  menuArrivals: 0,
  nextShift: 0,
  closeUpUntil: 0,
  restFocus: { x: 0, y: 0, z: 0 },
  baseZoom: 1,
  visitors: 0,
};

let world, cam, renderer, tilt, sfx, cards, ui, lighting, room, talkBox;

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const posePath = (slug, name) => `people-web/${name === "open" ? slug : `${slug}-${name}`}.webp`;

// Load a set of poses into a person's pose table (missing ones are skipped).
async function loadInto(table, slug, names) {
  await Promise.all(names.map(async (name) => {
    if (table[name]) return;
    try { table[name] = await loadImage(posePath(slug, name)); } catch { /* pose missing */ }
  }));
}

// Everything that isn't needed for the first picture, a few at a time.
async function loadRest(roster) {
  for (const p of roster) {
    await loadInto(app.poses.get(p.slug), p.slug, p.poses);
  }
}

const rank = (ring) => RINGS.indexOf(ring);
const inRing = (p, ring) => rank(p.ring) >= 0 && rank(p.ring) <= rank(ring);

// The crowd for a ring: its own people first, then everyone else, repeating
// as needed to reach the ring's size. Each place in the crowd gets an id.
function crowdFor(ring) {
  const own = app.roster.filter((p) => inRing(p, ring));
  const rest = app.roster.filter((p) => !inRing(p, ring));
  const pool = [...own, ...rest];
  const out = [];
  for (let i = 0; i < CROWD[ring]; i++) {
    const p = pool[i % pool.length];
    out.push({ ...p, id: `${p.slug}#${Math.floor(i / pool.length)}` });
  }
  return out;
}

// Everyone in the pile right now (not you, not other real people, not anyone leaving).
function crowdCount() {
  return world.people.filter((p) => !p.isYou && !p.remote && !p.rolling).length;
}

// You and the people of the pile.
function updateAwakeText() {
  const n = crowdCount();
  const text = app.joined ? `you + ${n} people` : `${n} people awake`;
  if (awakeText.textContent !== text) awakeText.textContent = text;
}

// ---------- the pile ----------
// Everyone is the same size in the world; a bigger crowd makes a bigger heap,
// and the camera pulls back to take it all in (so wider rings zoom out).
function personSize() {
  return SIZE.world;
}

function makePerson(info, poses) {
  return {
    info, poses,
    pose: "open", prevPose: null, poseT: 1,
    squish: 0, hop: 0, spin: 0,
    breath: (Math.random() - 0.5) * 2 * BREATH.spread,
    flip: Math.random() < 0.5 ? -1 : 1,
    lean: (Math.random() - 0.5) * 0.35,
    alpha: 1, glow: 0, nod: 0, nodTarget: 0,
    sx: 0, sy: 0, k: 1, depth: 0, size: 0,
  };
}

// Fill a cone with the crowd, then let physics settle it before anyone sees.
function buildPile() {
  const people = crowdFor(app.ring);
  const s = personSize(people.length);
  const spots = conePositions(world, people.length, s * PHYS.radiusK);
  people.forEach((info, i) => {
    const spot = spots[i];
    addBody(world, makePerson(info, app.poses.get(info.slug)), spot.x, spot.y, spot.z, s);
  });
  presettle(world, PHYS.presettleSteps);
  for (const p of world.people) settlePose(p, world.top);
}

// ---------- the ring: one button widens it, round and round ----------
// Growing: everyone shrinks a little to make room and newcomers tumble in.
// Shrinking: the extra people roll out of the pile and everyone grows back.
function nextRing() {
  if (app.dropping) return;
  const ring = RINGS[(rank(app.ring) + 1) % RINGS.length];
  app.ring = ring;
  ui.setRing(ring);
  room.setRing(ring);
  cam.ringScaleTarget = CAMERA.ringScale[ring];
  lighting.shift();          // a soft change of mood with the new crowd
  updateAwakeText();
  sfx.unlock();
  sfx.chance();
  const crowd = crowdFor(ring);
  const wanted = new Set(crowd.map((c) => c.id));
  const staying = world.people.filter((p) => p.isYou || p.remote || p.rolling || wanted.has(p.info.id));
  const here = new Set(staying.map((p) => p.info.id));
  app.leaving = world.people
    .filter((p) => !staying.includes(p))
    .sort((a, b) => b.pos.y - a.pos.y);          // the ones on top go first
  app.arriving = crowd.filter((c) => !here.has(c.id));
  const s = personSize(crowd.length + (app.you ? 1 : 0));
  for (const p of world.people) p.sTarget = s;
  // Reframe for the new ring while it fills in, then hold still again.
  reframe(3000);
  app.growSettledAt = 0;
}

function stepComings(t) {
  if (app.leaving.length && t > app.nextLeave) {
    const p = app.leaving.shift();
    if (world.people.includes(p) && !p.rolling) rollOut(p);
    app.nextLeave = t + FLOW.leaveEveryMs;
  }
  if (app.arriving.length && t > app.nextArrive) {
    const info = app.arriving.shift();
    const s = personSize(CROWD[app.ring] + (app.you ? 1 : 0));
    const p = dropIn(world, makePerson(info, app.poses.get(info.slug)), s, cam);
    p.sTarget = s;
    setPose(p, pick(["open", "prop", "snuggle"]));
    p.poseT = 1;                       // no crossfade while falling
    app.nextArrive = t + FLOW.spawnEveryMs;
  }
  stepTalk(performance.now());
  // Now and then someone leaves and someone new arrives, like real people would.
  // Now and then someone in the pile makes a small human sound.
  if (t > app.nextExpression) {
    app.nextExpression = t + FLOW.expressEveryMs[0] + Math.random() * (FLOW.expressEveryMs[1] - FLOW.expressEveryMs[0]);
    expressSomeone();
  }
  if (t > app.nextCount) {                 // the count follows who's really in the pile
    app.nextCount = t + 400;
    updateAwakeText();
  }
  // On the opening screen someone new drops in every so often (the count goes
  // up by one); once you're in, people come and go now and then.
  if (!app.joined && !app.leaving.length && !app.arriving.length && !app.dropping && t > app.nextMenuArrival) {
    // The first two come quickly (so the pile is clearly alive), then every so often.
    const [lo, hi] = FLOW.menuArriveEveryMs;
    const soon = FLOW.menuFirstArrivalsMs[++app.menuArrivals];
    app.nextMenuArrival = t + (soon ?? lo + Math.random() * (hi - lo));
    if (crowdCount() < CROWD[app.ring] + FLOW.menuExtraMax) dropNewcomer();
  }
  if (!app.leaving.length && !app.arriving.length && !app.dropping && t > app.nextAmbient) {
    app.nextAmbient = t + FLOW.ambientEveryMs[0] + Math.random() * (FLOW.ambientEveryMs[1] - FLOW.ambientEveryMs[0]);
    if (world.people.length > 6) leaveAndArrive();
  }
}

const EXPRESS_MIX = ["smile", "smile", "chuckle", "sigh", "aww", "idea", "hmm", "cough"];

function expressSomeone() {
  const awake = world.people.filter((p) => !p.isYou && !p.base && !p.rolling && !p.falling);
  if (!awake.length) return;
  const p = pick(awake);
  sfx.express(pick(EXPRESS_MIX));
  p.nodTarget = Math.random() < 0.5 ? -0.5 : 0.5;   // the faintest turn of the head
}

function leaveAndArrive() {
  const outer = world.people
    .filter((p) => !p.isYou && !p.rolling && !p.holding && p.pos.y > world.top * 0.35)
    .sort((a, b) => Math.hypot(b.pos.x, b.pos.z) - Math.hypot(a.pos.x, a.pos.z))
    .slice(0, 6);
  if (!outer.length) return;
  const goer = pick(outer);
  rollOut(goer);
  sfx.tumble();
  setTimeout(() => {
    const info = pick(app.roster);
    const s = personSize(CROWD[app.ring] + (app.you ? 1 : 0));
    const p = dropIn(world, makePerson({ ...info, id: `${info.slug}@${++app.visitors}` }, app.poses.get(info.slug)), s, cam);
    p.sTarget = s;
    setPose(p, "open");
    p.poseT = 1;
  }, FLOW.arriveAfterMs);
}

// Someone new drops into the pile from above (nobody leaves to make room).
function newcomer() {
  if (app.joined) dropNewcomer();
}

function dropNewcomer() {
  const info = pick(app.roster);
  const s = personSize(CROWD[app.ring] + 1);
  const p = dropIn(world, makePerson({ ...info, id: `${info.slug}@${++app.visitors}` }, app.poses.get(info.slug)), s, cam);
  p.sTarget = s;
  setPose(p, pick(["open", "prop", "snuggle"]));
  p.poseT = 1;
  sfx.arrive();
}

function nearest(p) {
  let best = null, bd = Infinity;
  for (const q of world.people) {
    if (q === p || q.rolling) continue;
    const d = Math.hypot(q.pos.x - p.pos.x, q.pos.y - p.pos.y, q.pos.z - p.pos.z);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// Someone has rolled off the edge of the screen.
function onGone(p) {
  if (p !== app.you) return;
  app.pile?.leave();
  app.you = null;
  app.joined = false;
  app.baseZoom = 1;
  app.restFocus = { x: 0, y: 0, z: 0 };
  cam.focusTarget = { ...app.restFocus };
  ui.leavePile();
  cam.stageTarget = CAMERA.stageMenu;
  reframe(3500);
  joinBtn.disabled = false;
  joinLabel.textContent = "Join the pile";
  hint.textContent = "come back any time";
  updateAwakeText();
}

// Leave right away: back to the start, the pile stays as it is.
function leaveNow() {
  const you = app.you;
  if (!you) return;
  app.closeUpUntil = 0;
  removeBody(world, you);
  onGone(you);
}

function rollYouOut() {
  if (!app.you || app.you.rolling) return;
  app.you.buoyancy = 1;
  rollOut(app.you);
  sfx.tumble();
  app.closeUpUntil = 0;
}

// ---------- tap someone; tap your light to talk ----------
const LIGHT_TAP_PX = 30;
const youLightY = () => app.you.sy - app.you.size * 0.95 - 14;   // where render.js draws your light

function personAt(x, y) {
  let best = null;
  for (const p of world.people) {
    const d = Math.hypot(p.sx - x, p.sy - p.size * 0.25 - y);
    if (d > p.size * 0.45) continue;
    if (p.isYou) return p;           // tapping your spot always means you
    if (!best || p.depth < best.depth) best = p;
  }
  return best;
}

// Everyone else is another person, so tapping them only gets a hello (a small
// smile you can hear); only your own person moves when you touch it.
function onTap(x, y) {
  sfx.unlock();
  // Your light (or you): say something, right there beside you.
  if (app.you && !app.you.rolling && (Math.hypot(x - app.you.sx, y - youLightY()) < LIGHT_TAP_PX || personAt(x, y) === app.you)) {
    return talkBox.toggleAt({ x: app.you.sx, y: youLightY() });
  }
  const p = personAt(x, y);
  if (!p || p.rolling) return;
  sfx.note(p.info.slug);                  // everyone holds a note: tap around to make music
  if (!p.base) p.squish = Math.max(p.squish, 0.12);
}

// Press on yourself and drag: you're carried under your finger and squeeze
// into a new spot; the people around you make room.
function grabYou(x, y) {
  const you = app.you;
  if (!you || you.rolling || app.dropping || personAt(x, y) !== you) return false;
  app.carry = { z2: cameraDepth(cam, you.pos.x, you.pos.y, you.pos.z) };
  return true;
}

function moveYou(x, y) {
  const you = app.you;
  if (!you || !app.carry) return;
  if (!you.pinned) {
    you.pinned = true;
    you.squish = 0.3;
    sfx.boop();
  }
  const to = unproject(cam, x, y + you.size * 0.25, app.carry.z2);
  to.y = Math.max(you.r, to.y);
  you.pos.x += (to.x - you.pos.x) * 0.35;
  you.pos.y += (to.y - you.pos.y) * 0.35;
  you.pos.z += (to.z - you.pos.z) * 0.35;
  you.prev.x = you.pos.x; you.prev.y = you.pos.y; you.prev.z = you.pos.z;
  wakeNear(world, you.pos.x, you.pos.y, you.pos.z, you.r * 4);
}

function dropYou() {
  const you = app.you;
  app.carry = null;
  if (!you || !you.pinned) return;
  you.pinned = false;
  you.squish = 0.35;
  app.youSettleUntil = performance.now() + 1500;
  sfx.thump();
}

// The camera flies in to you, lingers, and flies back out.
function closeUp() {
  if (!app.you || app.closeUpUntil) return;
  app.closeUpUntil = performance.now() + CLOSEUP.holdMs;
  app.closeUpAt = performance.now();
  // Clear your own zoom so the close-up lands right on you.
  cam.view.zoom = 1; cam.view.panX = 0; cam.view.panY = 0;
  app.you.hop = 1;
  app.you.squish = 0.35;
  sfx.whoosh(true);
}

function stepCloseUp(t) {
  if (app.closeUpUntil && app.you) {
    // Zooming yourself during the close-up ends it early.
    const userZoomed = (cam.userZoomedAt || 0) > app.closeUpAt;
    if (t < app.closeUpUntil && !userZoomed) {
      cam.focusTarget = { ...app.you.pos };
      cam.centerTarget = 1;
      cam.zoomTarget = CLOSEUP.zoom;
      return;
    }
    app.closeUpUntil = 0;
    sfx.whoosh(false);
  }
  cam.focusTarget = { ...app.restFocus };
  cam.centerTarget = 0;
  cam.zoomTarget = app.baseZoom;
}

// ---------- join ----------
async function join() {
  if (app.joined || app.dropping) return;
  sfx.unlock();
  await tilt.requestPermission();
  let poses = app.youPoses || app.poses.get("you");
  if (!poses || !poses.open) {
    try {
      poses = { open: await loadImage(posePath("you", "open")) };
    } catch {
      hint.textContent = "couldn't load your Rabble person, try again";
      return;
    }
  }
  joinBtn.disabled = true;
  // Into the shared pile, so everyone else sees you drop in too.
  app.pile?.join(app.youFigure).catch((err) => { hint.textContent = err.message; });
  joinLabel.textContent = "Dropping you in…";
  hint.textContent = "the pile is making room";
  ui.enterPile();
  cam.stageTarget = CAMERA.stagePile;
  reframe(3500);
  sfx.chime();
  const you = makePerson({ slug: "you", name: "you", place: "", ring: "you", id: "you" }, poses);
  you.isYou = true;
  you.flip = 1;
  you.lean = 0;
  you.breath = Math.PI;            // out of step at first; you fall into rhythm
  you.s = personSize(CROWD[app.ring] + 1);
  you.r = you.s * PHYS.radiusK;
  app.dropping = startDropIn({
    world, cam, scene: app.scene, you, now: performance.now(),
    onLanded() {
      app.you = you;
      you.buoyancy = PHYS.youBuoyancy;
      app.youSettleUntil = performance.now() + 2500;
      app.joined = true;
      app.baseZoom = CAMERA.joinZoom;
      app.restFocus = { ...cam.focusTarget };
      sfx.thump();
      updateAwakeText();
      talk.quietUntil = performance.now() + QUESTION_AFTER_MS + LANDING_QUIET_MS;
      setTimeout(newcomer, FLOW.followAfterMs);   // and a little later, someone lands after you
      setTimeout(askQuestion, QUESTION_AFTER_MS);
    },
  });
}

// Let the camera find a new framing for a moment (then it holds still again).
function reframe(ms) {
  cam.framing = true;
  app.framingUntil = performance.now() + ms;
}

// ---------- the pile talks ----------
// One conversation at a time, the same for everyone in the shared pile: the
// pile's own chat (from the server), and whatever real people say. Someone
// speaking cuts the pile's chat short; people's words wait their turn.
const talk = { now: null, queue: [], hold: false, typingSince: 0, quietUntil: 0 };
const SAY_MS = 24000;            // what a real person says stays up this long, for others to answer
const QUESTION_MS = 9000;
const LAND_STICK_MS = 4000;       // after landing, newcomers hold their spot while they settle,
const LAND_STICK_MAX_MS = 8000;   // and a while longer if they still aren't at rest
const QUESTION_AFTER_MS = 2500;   // after you land, the pile asks today's question
const LANDING_QUIET_MS = 25000;   // and its own chatter waits while you think
const TYPING_HOLD_MS = 45000;      // others' words wait this long at most while you type
const STALE_CHAT_MS = 40000;     // the pile's chat waits for you to land, not forever
const STALE_SAY_MS = 60000;

// Who says each line: the AI writes for a kid, a teen, a grown-up or an elder,
// and the nearest person of that age says it (anyone close, if none is).
const ageGroup = (age) => (age <= 12 ? "kid" : age <= 19 ? "teen" : age < 70 ? "grown-up" : "elder");

function castLines(lines, pool) {
  const free = [...pool];
  return lines.map((line) => {
    if (!free.length) return null;
    let i = free.findIndex((p) => ageGroup(p.info?.age ?? 40) === line.who);
    if (i < 0) i = 0;
    return free.splice(i, 1)[0];
  });
}

// The ten people nearest a spot on screen (not you, not anyone coming or going).
function nearTo(anchor, skip) {
  return world.people
    .filter((p) => p !== skip && p !== app.you && !p.remote && !p.rolling && !p.falling && p.sy > 60)
    .sort((a, b) => Math.hypot(a.sx - anchor.sx, a.sy - anchor.sy) - Math.hypot(b.sx - anchor.sx, b.sy - anchor.sy))
    .slice(0, 10);
}

function queueTalk(item) {
  item.at = performance.now();
  if (item.kind === "say") {
    if (talk.now?.kind === "chat") { talk.now.cancel(); talk.now = null; }
    const firstChat = talk.queue.findIndex((q) => q.kind === "chat");
    talk.queue.splice(item.mine ? 0 : firstChat < 0 ? talk.queue.length : firstChat, 0, item);
  } else {
    talk.queue = talk.queue.filter((q) => q.kind !== "chat").concat(item);   // only the newest chat waits
  }
}

// Called every frame: start the next thing to say once the last one is done.
function stepTalk(t) {
  if (talk.now && t < talk.now.until) return;
  talk.now = null;
  // Nothing plays on the opening screen: words are for once you're in the pile.
  if (!app.joined) {
    if (talk.now) { talk.now.cancel(); talk.now = null; }
    return;
  }
  // While you're typing (keyboard up), everyone waits, so nothing plays off screen.
  if (talk.typingSince && t - talk.typingSince < TYPING_HOLD_MS) return;
  while (talk.queue.length) {
    const next = talk.queue[0];
    if (next.kind === "chat" && (talk.hold || t < talk.quietUntil)) return;   // people are talking: the pile waits
    talk.queue.shift();
    if (t - next.at > (next.kind === "chat" ? STALE_CHAT_MS : STALE_SAY_MS)) continue;
    const run = next.play();
    if (!run) continue;
    talk.now = { kind: next.kind, cancel: run.cancel, until: t + run.ms + 1500 };
    return;
  }
}

function chatLines(lines) {
  return {
    kind: "chat",
    play() {
      const anchor = app.you || { sx: renderer.w / 2, sy: renderer.h * 0.55 };
      return playLines({ lines, speakers: castLines(lines, nearTo(anchor)), cards, sfx });
    },
  };
}

// ---------- real people talking to each other ----------
// You said something: your own words over you, staying a while, and the
// pile's chat goes quiet so there's room for an answer.
function showSay(person, text) {
  if (talk.now?.kind === "chat") { talk.now.cancel(); talk.now = null; }
  talk.quietUntil = performance.now() + SAY_MS;
  cards.show(person, text, { cls: "yours", ms: SAY_MS });
  sfx.express("smile");
  person.squish = Math.max(person.squish, 0.15);
}


// No one answered in time: a clay companion near them does, marked as a companion.
function onReply(e) {
  const to = e.to && e.to === app.pile?.id ? app.you : null;     // only answers to you
  if (!to) return;
  const [who] = castLines([{ who: e.who || "grown-up" }], nearTo(to, to));
  if (!who) return;
  // Its answer reaches you physically too: a squeeze travels from it to you.
  sendSqueeze(overlay, who, to, { onArrive: () => sfx.boop() });
  cards.show(who, e.text, { cls: "companion", ms: SAY_MS / 2 });
  sfx.express(e.tone || "smile");
}

// Today's question: the say card asks it, and the pile asks you once you land.
function onQuestion(q) {
  app.question = q;
  talkBox?.setQuestion(q);
}

function askQuestion() {
  if (!app.question || !app.you || app.said) return;
  if (talk.now?.kind === "chat") { talk.now.cancel(); talk.now = null; }
  talk.quietUntil = Math.max(talk.quietUntil, performance.now() + LANDING_QUIET_MS);   // room to answer
  app.asked = cards.show(app.you, app.question, { cls: "question", ms: QUESTION_MS }).el;
  $("#say-btn").classList.add("asking");
}

// With no Rabble server behind the page (the GitHub page), the pile talks
// from its recorded night instead, and "Use my photo" goes to the live pile.
const LIVE_URL = "https://rabble-pile.onrender.com/";

async function hasServer() {
  try {
    return (await fetch("api/events?since=-1&v=probe")).ok;
  } catch {
    return false;
  }
}

async function connectShared() {
  if (!(await hasServer())) {
    app.pile = connectOffline({
      onChat(e) { if (e.lines?.length) queueTalk(chatLines(e.lines)); },
      onReply,
      onQuestion,
    });
    app.offline = true;
    return;
  }
  // The pile is yours alone: other visitors don't drop in (their figures would
  // look like another you); you get today's question and the companions' answers.
  const ignore = () => {};
  app.pile = connectPile({
    onSnapshot: ignore, onArrive: ignore, onLeave: ignore, onSay: ignore, onAck: ignore,
    onReply,
    onQuestion,
    onChat(e) { if (e.lines?.length) queueTalk(chatLines(e.lines)); },
  });
}

// ---------- selfie ----------
function setupSelfie() {
  const dialog = $("#consent");
  $("#selfie").addEventListener("click", () => {
    if (app.joined || app.dropping) return;
    if (app.offline) { location.href = LIVE_URL; return; }
    dialog.showModal();
  });
  $("#consent-no").addEventListener("click", () => dialog.close());
  $("#photo").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    dialog.close();
    if (!file) return;
    joinBtn.disabled = true;
    showMaking("working", "Making you…", "SAM is cutting you out, Muse is making you squishy. About half a minute.");
    try {
      const { img, figure } = await makeRabbleFromPhoto(file);
      app.youPoses = { open: img };
      app.youFigure = figure;
      ui.setMine(img);
      joinBtn.disabled = false;
      $("#making-img").src = img.src;
      showMaking("ready", "Here you are", "Ready when you are.");
    } catch (err) {
      joinBtn.disabled = false;
      showMaking("failed", "That didn't work", `${err.message}. Try another photo, or join as you are.`);
    }
  });
  $("#making-close").addEventListener("click", () => { $("#making").hidden = true; });
  $("#making-join").addEventListener("click", () => { $("#making").hidden = true; join(); });
  $("#making-again").addEventListener("click", () => { $("#making").hidden = true; dialog.showModal(); });
}

// The card in the middle while your Rabble person is made: working (letters
// drifting round the circle), ready (you, with Join), or failed.
function showMaking(state, title, text) {
  $("#making-title").textContent = title;
  $("#making-text").textContent = text;
  $("#making-stage").hidden = state === "ready";
  $("#making-img").hidden = state !== "ready";
  $("#making-join").hidden = state !== "ready";
  $("#making-again").hidden = state !== "ready";
  $("#making-close").hidden = state !== "failed";
  $("#making").classList.toggle("failed", state === "failed");
  $("#making").hidden = false;
}

// ---------- loop ----------
let last = 0, acc = 0;

function frame(t) {
  try {
    tick(t);
  } catch (err) {
    console.error("rabble frame failed", err);
    window.rabbleError = String((err && err.stack) || err);
  }
  requestAnimationFrame(frame);
}

function stepTilt(t) {
  const tv = tilt.update();
  // On the opening screen the pile holds still while you reach for the buttons:
  // the mouse only turns it once you're in (a phone's tilt always does).
  app.scene.tilt = tilt.hasSensor || app.joined ? tv : 0;
  // The room behind drifts the other way as the camera swings round.
  const turn = cam.yaw / (CAMERA.tiltYawDeg * DEG);
  const px = reducedMotion ? 0 : TILT.parallaxPx;
  layers[0].style.transform = `translate3d(${turn * px * 0.5}px, 0, 0)`;
  layers[1].style.transform = `translate3d(${turn * px}px, 0, 0)`;
}

// Squeezes, the hug ripple, poses, and you falling into step with everyone.
function stepPeople(t, dt) {
  for (const p of world.people) {
    if (p.rippleAt && t >= p.rippleAt) {
      p.rippleAt = 0;
      if (!p.base) p.squish = Math.max(p.squish, 0.06);   // the faintest squeeze; the base stays still
    }
    p.hop *= 0.88;
    p.squish *= SQUISH.decay;
    stepPose(p, dt);
    // Just landed: they hold the spot where they touched down (others make room),
    // with no sideways speed, so they never skid across the pile.
    if (p.stickAt && !p.rolling && (t < p.stickUntil || (!p.asleep && t < p.stickUntil + LAND_STICK_MAX_MS))) {
      p.pos.x = p.prev.x = p.stickAt.x;
      p.pos.z = p.prev.z = p.stickAt.z;
      p.prev.y = Math.max(p.prev.y, p.pos.y);
    }
    if (p.isYou && !p.falling) {
      p.breath += (0 - p.breath) * BREATH.syncRate;
      // Only while you're settling in: then you rest like everyone else.
      p.towardCamera = !p.rolling && t < app.youSettleUntil ? { x: cam.sinY, z: cam.cosY } : null;
    }
    // Newcomers land just as they fell: same pose, a little squish, no switch,
    // and they stay where they touched down (no skidding across the pile).
    if (p.settleCheck && p.supported && !p.rolling) {
      p.settleCheck = false;
      p.falling = false;
      p.stickUntil = t + LAND_STICK_MS;
      p.stickAt = { x: p.pos.x, z: p.pos.z };
      if (!app.arriving.length || Math.random() < 0.15) sfx.arrive();   // not a hundred plops at once
      p.squish = 0.3;
    }
  }
  if (t > app.nextShift) {
    shiftSomeone(world, world.top);
    app.nextShift = t + nextShiftDelay();
  }
}

function tick(t) {
  const dt = Math.min(64, t - (last || t));
  last = t;
  acc += dt;

  stepTilt(t);
  stepComings(t);
  let resizing = false;
  while (acc >= STEP) {
    step(world);
    resizing = stepSizes(world) || resizing;
    stepRolling(world, cam, renderer.w, onGone);
    acc -= STEP;
  }
  stepPeople(t, dt);
  // Once the newcomers have landed and everyone's resized, let the view settle freely.
  if (cam.framing && t > app.framingUntil && !app.arriving.length && !app.leaving.length && !resizing &&
      !world.people.some((p) => p.falling || (p.rolling && !p.isYou))) {
    app.growSettledAt ||= t;
    if (t - app.growSettledAt > 2500) cam.framing = false;
  } else {
    app.growSettledAt = 0;
  }
  if (app.dropping && app.dropping(t)) app.dropping = null;
  if (!app.dropping) stepCloseUp(t);

  updateCamera(cam, renderer, world, reducedMotion ? 0 : app.scene.tilt, reducedMotion ? 0 : t);
  app.scene.light = lighting.update(t);
  draw(renderer, world, cam, app.scene, t);
  placeCards(overlay, { w: renderer.w, ceiling: cardCeiling(), floor: pileTopOnScreen(), zoom: cardZoom() });
}

// Where the space for speech cards starts: under the title before you join,
// near the top of the screen once you're in.
function cardCeiling() {
  const visibleTop = window.visualViewport?.offsetTop || 0;   // the page slides up under a keyboard
  if (app.joined || app.dropping) return visibleTop + 12;
  return Math.max(visibleTop + 12, awakeText.getBoundingClientRect().bottom + 10);
}

// Zoom in and the words grow with the people (up to a point, so a close-up
// stays readable rather than all text).
const MAX_CARD_ZOOM = 2.2;
function cardZoom() {
  const z = cam.view.zoom * (cam.zoom / (app.baseZoom || 1));
  return Math.max(1, Math.min(MAX_CARD_ZOOM, z));
}

// The top of the pile on screen (the highest head), so cards stay above it.
function pileTopOnScreen() {
  let top = renderer.h;
  for (const p of world.people) {
    if (p.falling || p.rolling) continue;
    top = Math.min(top, p.sy - p.size * 0.95);
  }
  return top;
}

function setupButtons() {
  setupControls(canvas, cam, { onTap, grabYou, moveYou, dropYou });
  joinBtn.addEventListener("click", join);
  // Found it: the ring button stops calling for attention.
  $("#ring").addEventListener("click", () => $("#ring").classList.add("tried"), { once: true });
  ui = createUi({
    onRing: nextRing,
    onRoll: rollYouOut,
    onLeave: leaveNow,
    onMenu: () => sfx.click(),
    onSound() {
      sfx.on = !sfx.on;
      ui.setSound(sfx.on);
    },
  });
  ui.setMine(null);
  ui.setRing(app.ring);
  ui.setSound(sfx.on);
  window.addEventListener("resize", () => { renderer.resize(); reframe(1500); });
  $("#find-btn").addEventListener("click", () => { sfx.unlock(); closeUp(); });
  setupSelfie();
  talkBox = setupTalk({
    getYou: () => app.you,
    send: (text) => app.pile.say(text),
    // While the AI is finding your words, the pile's own chat waits.
    onTyping(on) {
      talk.typingSince = on ? performance.now() : 0;
      if (on) app.asked?.classList.add("leaving");   // the box asks the question itself now
    },
    onThinking(on) {
      talk.hold = on;
      if (on && talk.now?.kind === "chat") { talk.now.cancel(); talk.now = null; }
    },
    onSaid(out) {
      talk.hold = false;
      app.said = true;
      $("#say-btn").classList.remove("asking");
      app.asked?.classList.add("leaving");          // answered: the question steps aside
      if (app.you) showSay(app.you, out.text);
    },
    cards, sfx,
  });
}

async function boot() {
  const roster = await fetch("people.json").then((r) => r.json());
  // First picture fast: each person's open pose plus one awake pose. The
  // other poses stream in afterwards; the pile only uses poses it has.
  for (const p of roster) app.poses.set(p.slug, {});
  await Promise.all(roster.map((p) =>
    loadInto(app.poses.get(p.slug), p.slug, ["open", ...p.poses.filter((n) => n === "snuggle" || n === "prop")])));
  app.roster = roster.filter((p) => p.ring !== "you" && app.poses.get(p.slug).open);

  renderer = createRenderer(canvas);
  world = createWorld();
  cam = createCamera();
  lighting = createLighting();
  room = createRoom();
  tilt = createTilt();
  sfx = createSfx();
  if (location.search.includes("mute")) sfx.on = false;   // silent test runs
  cards = createCards(overlay);
  app.nextAmbient = performance.now() + FLOW.ambientEveryMs[0];
  app.nextMenuArrival = performance.now() + FLOW.menuFirstArrivalsMs[0];
  app.nextExpression = performance.now() + FLOW.expressEveryMs[0];

  setupButtons();
  hint.textContent = coarse ? "tilt, drag or pinch to look around" : "drag or scroll to look around";
  buildPile();
  reframe(2500);
  updateAwakeText();
  if (location.search.includes("debug")) window.rabble = { app, world, cam, renderer, draw, tick, cards, queueTalk, chatLines, sfx };
  requestAnimationFrame(frame);
  // Once the sleepy pictures are in, about a third of the pile dozes off
  // (the base too: one soft fade into sleep, nothing more).
  loadRest(roster).then(() => {
    for (const p of world.people) if (!p.isYou && !p.remote && Math.random() < POSE.sleepyShare) doze(p);
  });
  connectShared();                           // the pile is already talking when you arrive
}

boot();
