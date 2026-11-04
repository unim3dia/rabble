// Records the welcome promo's gameplay (the current Rabble: your photo, the
// first minute, what's on your mind, the pile answering with its bodies) on an
// iPhone-sized screen in one continuous take, marking each moment
// (demo/promo/frames-welcome/frames.json). compose_welcome.py cuts it.
//   node demo/promo/record_welcome.mjs   (with the Rabble server on RABBLE_URL)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { startCapture } from "./capture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const URL_ = process.env.RABBLE_URL || "http://127.0.0.1:8135/";
const PHONE = { width: 414, height: 736 };
const SCALE = 1080 / PHONE.width;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE, isMobile: true });

// A soft fingertip so you can see where the screen is touched.
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:9999;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;" +
      "background:radial-gradient(circle,rgba(255,255,255,.55),rgba(255,255,255,.18) 60%,transparent 72%);" +
      "box-shadow:0 0 0 2px rgba(255,255,255,.35);pointer-events:none;opacity:0;transform:scale(.6);" +
      "transition:opacity 160ms ease, transform 160ms ease;";
    document.body.append(dot);
    const at = (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; };
    addEventListener("pointerdown", (e) => { at(e); dot.style.opacity = "1"; dot.style.transform = "scale(1)"; }, true);
    addEventListener("pointermove", at, true);
    addEventListener("pointerup", () => { dot.style.opacity = "0"; dot.style.transform = "scale(.6)"; }, true);
  });
});

// Record what the app plays: everything sent to the speakers also goes to a
// MediaRecorder, started (and timestamped) when the app makes its AudioContext.
await ctx.addInitScript(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = connect.call(this, dest, ...rest);
    const ctx = this.context;
    if (dest === ctx.destination) {
      if (!ctx.__tap) {
        ctx.__tap = ctx.createMediaStreamDestination();
        const rec = new MediaRecorder(ctx.__tap.stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 192000 });
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstart = () => { window.__audioStart = Date.now() / 1000; };
        rec.start(1000);
        window.__audioStop = () => new Promise((resolve) => {
          rec.onstop = async () => {
            const buf = await new Blob(chunks, { type: "audio/webm" }).arrayBuffer();
            let s = ""; const b = new Uint8Array(buf);
            for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
            resolve({ start: window.__audioStart, data: btoa(s) });
          };
          rec.stop();
        });
      }
      connect.call(this, ctx.__tap);
    }
    return out;
  };
});

const page = await ctx.newPage();
// The pile's own background conversations stay out of this take: the only
// words on screen are the visitor's and the pile's answers to them.
const pileTalks = false;
await page.route("**/api/events*", async (route) => {
  const res = await route.fetch();
  const body = await res.json().catch(() => null);
  if (body && body.events && !pileTalks) body.events = body.events.filter((e) => e.type !== "chat");
  await route.fulfill({ response: res, json: body ?? undefined });
});
const tap = async (sel) => {
  const box = await page.locator(sel).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
};
async function drag(from, to, ms = 1200, steps = 40) {
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
    await sleep(ms / steps);
  }
  await page.mouse.up();
}
async function zoom(at, ticks, dy, everyMs = 70) {
  await page.mouse.move(...at);
  for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, dy); await sleep(everyMs); }
}
const you = () => page.evaluate(() => { const y = window.rabble.app.you; return y && [y.sx, y.sy - y.size * 0.25]; });
// People on screen, not you, not too close to the edges: a few to tap.
const tappable = (n) => page.evaluate((n) => window.rabble.world.people
  .filter((p) => !p.isYou && p.sx > 60 && p.sx < 354 && p.sy > 200 && p.sy < 600 && p.size > 40)
  .sort(() => Math.random() - 0.5).slice(0, n).map((p) => [p.sx, p.sy - p.size * 0.25]), n);

const FRAMES = path.join(DIR, "frames-welcome");
// A spot on screen for a card's button (they float, so look each time).
const buttonAt = (label) => page.evaluate((label) => {
  const b = [...document.querySelectorAll(".card-action")].find((x) => x.textContent === label);
  const r = b?.getBoundingClientRect();
  return r && [r.x + r.width / 2, r.y + r.height / 2];
}, label);
const touch = async (at) => { await page.mouse.move(...at); await page.mouse.down(); await sleep(90); await page.mouse.up(); };
const lightAt = () => page.evaluate(() => { const y = window.rabble.app.you; return [y.sx, y.sy - y.size * 0.95 - 14]; });

await page.goto(URL_ + "?debug");
await page.waitForFunction(() => window.rabble && document.querySelectorAll("#ring-letters .ring-letter").length > 0);
await page.evaluate(() => { window.rabble.sfx.unlock(); window.rabble.sfx.click(); });   // sound on from the start
await sleep(1200);
const cap = await startCapture(page, FRAMES, { ...PHONE, scale: SCALE });

// 1. The pile from far off, steady; people falling in; a slow turn.
cap.mark("menu");
await sleep(5000);
await drag([340, 420], [90, 420], 4000, 100);   // on the pile, well above the Join button
await sleep(1200);
cap.mark("menu-end");

// 2. Your photo becomes your clay self.
cap.mark("photo");
await tap("#selfie");
await sleep(1300);
await page.setInputFiles("#photo", path.join(DIR, "selfie.jpg"));
cap.mark("making");
await page.waitForSelector("#making-img:not([hidden])", { timeout: 180000 });
cap.mark("made");
await sleep(3200);

// 3. Drop in: caught; "There you are. We made room."; "You".
cap.mark("join");
await tap("#making-join");
await page.waitForFunction(() => window.rabble.app.joined, null, { timeout: 30000 });
cap.mark("landed");
await sleep(700);
cap.mark("greet");

// 4. What's on your mind? Answer; your words; a reply and a cheer.
await page.waitForSelector(".card.question .card-action", { timeout: 15000 });
cap.mark("asked");
await sleep(3500);
await touch(await buttonAt("Answer"));
await sleep(900);
await page.keyboard.type("I finally finished my first painting", { delay: 80 });
await sleep(700);
await page.keyboard.press("Enter");
cap.mark("sent");
await page.waitForFunction(() => [...document.querySelectorAll(".card.yours")].some((c) => !c.classList.contains("thinking")), null, { timeout: 60000 });
cap.mark("yours");
await page.waitForSelector(".card.companion:not(.small)", { timeout: 60000 });
cap.mark("reply");
await sleep(8000);
cap.mark("reply-end");

// 5. Tap your light to talk; a tired line; the pile leans in and settles.
await page.waitForFunction(() => document.querySelectorAll(".card:not(.leaving)").length === 0, null, { timeout: 30000 }).catch(() => {});
await sleep(800);
cap.mark("light");
const boxOpen = () => page.$eval("#say", (f) => !f.hidden);
for (let i = 0; i < 2 && !(await boxOpen()); i++) { await touch(await lightAt()); await sleep(700); }
if (!(await boxOpen())) { console.log("light tap missed: using the say button"); await tap("#say-btn"); }
await sleep(700);
await page.keyboard.type("long week. I'm so tired", { delay: 80 });
await sleep(700);
await page.keyboard.press("Enter");
cap.mark("sent2");
await page.waitForFunction(() => document.querySelectorAll(".card.companion:not(.small):not(.leaving)").length > 0, null, { timeout: 60000 });
cap.mark("reply2");
await sleep(9000);
cap.mark("reply2-end");

// 6. Close: in among the sleeping faces.
await page.waitForFunction(() => document.querySelectorAll(".card:not(.leaving)").length === 0, null, { timeout: 30000 }).catch(() => {});
const me = await you();
cap.mark("close");
await zoom(me, 24, -45, 120);
await sleep(1000);
await drag([300, 420], [110, 380], 5000, 120);
await sleep(1000);
cap.mark("close-end");
await zoom([207, 400], 30, 80, 40);
await sleep(1200);

// 7. The world: everyone falls in; the tower, large and steady, slowly round.
await tap("#corner-btn"); await sleep(700);
cap.mark("ring");
for (let i = 0; i < 3; i++) { await tap("#m-ring"); await sleep(600); }
await tap("#corner-btn"); await sleep(9000);
await zoom([207, 420], 3, 60, 120);
await sleep(1200);
cap.mark("tower");
await drag([330, 640], [90, 650], 7000, 140);
await sleep(2500);
cap.mark("tower-end");

await cap.stop();
await page.unrouteAll({ behavior: "ignoreErrors" });
const audio = await page.evaluate(() => window.__audioStop());
fs.writeFileSync(path.join(FRAMES, "sfx.webm"), Buffer.from(audio.data, "base64"));
fs.writeFileSync(path.join(FRAMES, "sfx.json"), JSON.stringify({ start: audio.start }));
await browser.close();
console.log("done");
