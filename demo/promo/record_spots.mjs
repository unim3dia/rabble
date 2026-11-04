// Records clean footage for the two short commercials: the app with its
// buttons and menus hidden, no touch marker, the app's sounds recorded, and
// speech bubbles shown only for the one "hi". Marks each moment
// (demo/promo/spots/frames.json); also saves your clay figure (spots/you.png).
//   node demo/promo/record_spots.mjs   (with the Rabble server on RABBLE_URL)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { startCapture } from "./capture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, "spots");
const URL_ = process.env.RABBLE_URL || "http://127.0.0.1:8131/";
const PHONE = { width: 414, height: 736 };
const SCALE = 1080 / PHONE.width;
const BEAT_MS = 600;                 // 100 BPM: taps land on the music's half-beats

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE, isMobile: true });

// Clean screen: no title, buttons, menus or hint; speech bubbles only when we say so.
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = `.top, .dock, .corner, .hint, #hint { opacity: 0 !important; }
      body:not(.show-talk) .overlay, body:not(.show-talk) .say-card { opacity: 0 !important; }`;
    document.head.append(style);
  });
});
// Record what the app plays (same tap as record.mjs).
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
            const b = new Uint8Array(await new Blob(chunks).arrayBuffer());
            let s = "";
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
// The pile's own conversations stay out of these spots entirely.
await page.route("**/api/events*", async (route) => {
  const res = await route.fetch();
  const body = await res.json().catch(() => null);
  if (body?.events) body.events = body.events.filter((e) => e.type !== "chat");
  await route.fulfill({ response: res, json: body ?? undefined });
});
const click = (sel) => page.$eval(sel, (el) => el.click());
async function drag(from, to, ms, steps = 90) {
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
    await sleep(ms / steps);
  }
  await page.mouse.up();
}
async function zoom(at, ticks, dy, everyMs) {
  await page.mouse.move(...at);
  for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, dy); await sleep(everyMs); }
}
const you = () => page.evaluate(() => { const y = window.rabble.app.you; return [y.sx, y.sy - y.size * 0.25]; });
const crowd = () => page.evaluate(() => window.rabble.world.people.length);

await page.goto(URL_ + "?debug");
await page.waitForFunction(() => window.rabble && document.querySelectorAll("#ring-letters .ring-letter").length > 0);
await page.evaluate(() => window.rabble.sfx.unlock());
await sleep(800);
fs.mkdirSync(OUT, { recursive: true });
const cap = await startCapture(page, path.join(OUT, "frames"), { ...PHONE, scale: SCALE });

// One: the opening pile, and the first newcomer dropping onto it.
cap.mark("pile");
const before = await crowd();
await page.waitForFunction((n) => window.rabble.world.people.length > n, before, { timeout: 30000 });
cap.mark("arrive");
await sleep(4500);

// Your photo becomes your clay self (the making card isn't used in the spots).
await click("#selfie");
await sleep(500);
await page.setInputFiles("#photo", path.join(DIR, "selfie.jpg"));
await page.waitForSelector("#making-img:not([hidden])", { timeout: 180000 });
const png = await page.$eval("#making-img", (img) => img.src);
fs.writeFileSync(path.join(OUT, "you.png"), Buffer.from(png.split(",")[1], "base64"));
await sleep(600);

// Then another: you drop in.
await click("#making-join");
cap.mark("drop");
await sleep(7000);

// Closer: a slow push all the way in to your face, then along the faces.
const me = await you();
cap.mark("push");
await zoom(me, 28, -40, 140);
await sleep(1200);
cap.mark("faces");
await drag([300, 420], [110, 380], 4200);
await sleep(800);

// Back out a little; tap people on the beat, and they bop (each one sings a note).
await zoom([207, 400], 14, 50, 60);
await sleep(1200);
const targets = await page.evaluate(() => window.rabble.world.people
  .filter((p) => !p.isYou && p.sx > 70 && p.sx < 344 && p.sy > 220 && p.sy < 600 && p.size > 40)
  .sort((a, b) => a.sx - b.sx).slice(0, 8).map((p) => [p.sx, p.sy - p.size * 0.25]));
cap.mark("bop");
for (const at of targets) {
  await page.mouse.move(...at);
  await page.mouse.down(); await sleep(40); await page.mouse.up();
  await sleep(BEAT_MS / 2 - 40);
}
await sleep(1500);
await zoom([207, 400], 24, 80, 40);
await sleep(1500);

// Then everyone: neighborhood → world in three quick turns, and the sky empties onto the tower.
cap.mark("rain");
for (let i = 0; i < 3; i++) { await click("#m-ring"); await sleep(450); }
await sleep(9000);

// The tower, large and steady, seen from far off: a slow turn around it.
await zoom([207, 420], 3, 60, 120);
await sleep(800);
cap.mark("tower");
await drag([330, 640], [90, 650], 7000, 140);
await sleep(2000);

// Hi: say one thing; one answer.
await page.evaluate(() => document.body.classList.add("show-talk"));
cap.mark("say");
await click("#say-btn");
await sleep(500);
await page.keyboard.type("hi everyone", { delay: 70 });
await sleep(400);
await page.keyboard.press("Enter");
cap.mark("sent");
await page.waitForFunction(() => [...document.querySelectorAll(".card.yours")].some((c) => !c.classList.contains("thinking")), null, { timeout: 60000 });
cap.mark("answered");
await sleep(9000);
cap.mark("end");

await cap.stop();
await page.unrouteAll({ behavior: "ignoreErrors" });
const audio = await page.evaluate(() => window.__audioStop());
fs.writeFileSync(path.join(OUT, "frames", "sfx.webm"), Buffer.from(audio.data, "base64"));
fs.writeFileSync(path.join(OUT, "frames", "sfx.json"), JSON.stringify({ start: audio.start }));
await browser.close();
console.log("done");
