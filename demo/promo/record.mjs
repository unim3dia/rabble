// Records the Rabble promo's gameplay on an iPhone-sized screen (414×736,
// 9:16) in one continuous take, marking where each moment starts and ends
// (demo/promo/frames/frames.json). compose.py cuts the clips from it.
//   node demo/promo/record.mjs   (with the Rabble server on RABBLE_URL)
import { createRequire } from "node:module";
import path from "node:path";
import { startCapture } from "./capture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const URL_ = process.env.RABBLE_URL || "http://127.0.0.1:8131/";
const PHONE = { width: 414, height: 736 };
const SCALE = 1080 / PHONE.width;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: process.env.CHROME });
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

const page = await ctx.newPage();
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

await page.goto(URL_ + "?mute&debug");
await page.waitForFunction(() => window.rabble && document.querySelectorAll("#ring-letters .ring-letter").length > 0);
await sleep(1200);
const cap = await startCapture(page, path.join(DIR, "frames"), { ...PHONE, scale: SCALE });

// 1. The menu: people fall in; turn the pile; zoom in and out.
cap.mark("menu");
await sleep(4500);
await drag([340, 560], [80, 560], 1600);
await sleep(400);
await drag([80, 560], [300, 540], 1400);
await zoom([207, 500], 10, -70);
await sleep(700);
await zoom([207, 500], 10, 70);
await sleep(600);
cap.mark("menu-end");

// 2. Your photo becomes your Rabble person.
cap.mark("photo");
await tap("#selfie");
await sleep(1300);
await page.setInputFiles("#photo", path.join(DIR, "selfie.jpg"));
cap.mark("making");
await page.waitForSelector("#making-img:not([hidden])", { timeout: 180000 });
cap.mark("made");
await sleep(3200);
cap.mark("photo-end");

// 3. Join: you drop into the pile; look around.
cap.mark("join");
await tap("#making-join");
await sleep(6500);
await drag([360, 420], [60, 440], 1800);
await sleep(600);
cap.mark("join-end");

// 4. Zoom all the way in on yourself, look around up close.
cap.mark("zoom");
const me = (await you()) || [207, 450];
await zoom(me, 26, -60, 90);
await sleep(1500);
await drag([150, 380], [270, 330], 1500);
await sleep(800);
cap.mark("zoom-end");

// 5. Back out a little and tap people: they bop.
await zoom([207, 400], 12, 60, 60);
await sleep(800);
cap.mark("bop");
for (const at of await tappable(6)) {
  await page.mouse.move(...at);
  await page.mouse.down(); await sleep(80); await page.mouse.up();
  await sleep(550);
}
await sleep(600);
cap.mark("bop-end");
await zoom([207, 400], 20, 80, 50);
await sleep(1200);

// 6. Widen the ring: neighborhood → city → state.
cap.mark("ring");
await tap("#corner-btn"); await sleep(700);
await tap("#m-ring"); await sleep(5200);       // (the menu stays open between rings)
await tap("#m-ring"); await sleep(5600);
cap.mark("ring-end");
await tap("#corner-btn"); await sleep(500);

// 7–8. Say something; the pile answers.
cap.mark("say");
await tap("#say-btn"); await sleep(700);
await page.keyboard.type("is anyone else still awake?", { delay: 85 });
await sleep(600);
await page.keyboard.press("Enter");
cap.mark("sent");
await page.waitForFunction(() => [...document.querySelectorAll(".card.yours")].some((c) => !c.classList.contains("thinking")), null, { timeout: 60000 });
cap.mark("answered");
await sleep(11000);
cap.mark("say-end");

// 9. A friend opens the link on another phone and lands in the same pile.
cap.mark("friend");
const friend = await (await browser.newContext({ viewport: PHONE })).newPage();
await friend.goto(URL_ + "?mute");
await friend.waitForFunction(() => document.querySelectorAll("#ring-letters .ring-letter").length > 0);
await friend.$eval("#join", (el) => el.click());
await sleep(7000);
await friend.$eval("#say-btn", (el) => el.click()); await sleep(300);
await friend.keyboard.type("hi from across town!", { delay: 30 });
await friend.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector(".card.theirs:not(.thinking)"), null, { timeout: 60000 }).catch(() => {});
cap.mark("friend-said");
await sleep(6000);
cap.mark("friend-end");

await cap.stop();
await browser.close();
console.log("done");
