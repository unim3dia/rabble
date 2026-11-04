// Records the Rabble demo on a phone-sized screen, scene by scene, and writes
// when each scene starts (seconds into the video) to demo/timeline.json.
//   node demo/record.mjs   (with the Rabble server running on RABBLE_URL)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const URL_ = process.env.RABBLE_URL || "http://127.0.0.1:8131/";
const PHONE = { width: 390, height: 844 };
const scenes = JSON.parse(fs.readFileSync(path.join(DIR, "scenes.json"), "utf8"));
const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({
  viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: false,
  recordVideo: { dir: path.join(DIR, "raw"), size: PHONE },
});
const t0 = Date.now();
const page = await ctx.newPage();
const timeline = [];

// Each scene lasts at least as long as its narration (plus a breath).
async function scene(id, act) {
  const start = (Date.now() - t0) / 1000;
  timeline.push({ id, start });
  console.log(`scene ${id} at ${start.toFixed(1)}s`);
  const minMs = (byId[id].audio_s + 1.2) * 1000;
  const began = Date.now();
  await act();
  const left = minMs - (Date.now() - began);
  if (left > 0) await sleep(left);
}

// Tap a button directly (some of them gently bob, which a normal click waits out).
const tap = (pg, sel) => pg.$eval(sel, (el) => el.click());
const cards = () => page.locator(".card:not(.thinking)").count();
async function waitForCards(n, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if ((await cards()) >= n) return true; await sleep(250); }
  return false;
}

await page.goto(URL_ + "?mute");
await page.waitForFunction(() => document.querySelectorAll("#ring-letters .ring-letter").length > 0);

await scene("intro", async () => { await sleep(2500); });
await scene("people", async () => { await sleep(3000); });     // newcomers drop in on their own
await scene("ring", async () => {
  await tap(page, "#ring"); await sleep(4500);
  await tap(page, "#ring"); await sleep(4000);
});
await scene("selfie", async () => {
  await tap(page, "#selfie"); await sleep(5500);
  await tap(page, "#consent-no"); await sleep(800);
});
await scene("join", async () => { await tap(page, "#join"); await sleep(8000); });
await scene("chat", async () => { await waitForCards(2, 30000); await sleep(4000); });
await scene("say", async () => {
  await tap(page, "#say-btn"); await sleep(600);
  await page.keyboard.type("i miss my mom tonight", { delay: 110 });
  await sleep(900);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll(".card.yours")].some((c) => !c.classList.contains("thinking")), null, { timeout: 40000 });
  await sleep(9000);                                       // the replies come in
});
await scene("shared", async () => {
  const friend = await (await browser.newContext({ viewport: PHONE })).newPage();
  await friend.goto(URL_ + "?mute");
  await friend.waitForFunction(() => document.querySelectorAll("#ring-letters .ring-letter").length > 0);
  await tap(friend, "#join");
  await sleep(9000);
  await tap(friend, "#say-btn"); await sleep(300);
  await friend.keyboard.type("hello from the other phone!", { delay: 40 });
  await friend.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".card.theirs:not(.thinking)"), null, { timeout: 40000 }).catch(() => {});
  await sleep(6000);
});
await scene("zoom", async () => {
  await page.mouse.move(PHONE.width / 2, PHONE.height * 0.62);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -60); await sleep(120); }
  await sleep(4500);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 60); await sleep(80); }
});
await scene("outro", async () => { await sleep(2000); });

const end = (Date.now() - t0) / 1000;
fs.writeFileSync(path.join(DIR, "timeline.json"), JSON.stringify({ end, scenes: timeline }, null, 1));
const video = page.video();
await ctx.close();
fs.renameSync(await video.path(), path.join(DIR, "raw", "phone.webm"));
await browser.close();
console.log(`done: ${end.toFixed(1)}s`);
