// Tests and films the orbit dial: join, zoom in close, slide the dial both
// ways (and a flick), and check the person in the middle stays put on screen.
//   node demo/promo/record_orbit.mjs   (with the Rabble server on RABBLE_URL)
import { createRequire } from "node:module";
import path from "node:path";
import { startCapture } from "./capture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const URL_ = process.env.RABBLE_URL || "http://127.0.0.1:8135/";
const PHONE = { width: 414, height: 736 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 1080 / PHONE.width, isMobile: true });
await ctx.addInitScript(() => addEventListener("DOMContentLoaded", () => {
  const dot = document.createElement("div");
  dot.style.cssText = "position:fixed;z-index:9999;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.6),rgba(255,255,255,.15) 60%,transparent 72%);pointer-events:none;opacity:0;transition:opacity 150ms";
  document.body.append(dot);
  addEventListener("pointerdown", (e) => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; dot.style.opacity = 1; }, true);
  addEventListener("pointermove", (e) => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; }, true);
  addEventListener("pointerup", () => { dot.style.opacity = 0; }, true);
}));
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
await page.goto(URL_ + "?debug&mute");
await page.waitForFunction(() => window.rabble && document.querySelector("#join"));
await sleep(1200);
await page.$eval("#join", (b) => b.click());
await page.waitForFunction(() => window.rabble.app.joined);
await sleep(5000);
await page.evaluate(() => document.querySelectorAll(".card").forEach((c) => c.remove()));
console.log("dial shown when out wide:", await page.$eval("#orbit", (d) => d.classList.contains("on")));
await page.mouse.move(207, 430);
for (let i = 0; i < 22; i++) { await page.mouse.wheel(0, -50); await sleep(70); }
await sleep(1500);
console.log("dial shown close up:", await page.$eval("#orbit", (d) => d.classList.contains("on")), "zoom", await page.evaluate(() => window.rabble.cam.view.zoom.toFixed(2)));
const box = await page.locator("#orbit").boundingBox();
console.log("dial box", Object.values(box).map(Math.round));
const cap = await startCapture(page, path.join(DIR, "frames-orbit"), { ...PHONE, scale: 1080 / PHONE.width });
await sleep(800);
// Track the anchored person: who is nearest the middle now.
const watch = () => page.evaluate(() => {
  const r = window.rabble, a = r.cam.orbitAnchor;
  return { yaw: r.cam.yaw.toFixed(3), anchor: a && [Math.round(a.sx), Math.round(a.sy)] };
});
const slide = async (x0, x1, ms) => {
  const y = box.y + box.height / 2;
  await page.mouse.move(x0, y); await page.mouse.down();
  for (let i = 1; i <= 40; i++) { await page.mouse.move(x0 + (x1 - x0) * i / 40, y); await sleep(ms / 40); }
  await page.mouse.up();
};
const before = await watch();
await slide(box.x + 40, box.x + box.width - 30, 2600);
await sleep(300);
const mid = await watch();
const person = await page.evaluate(() => {
  const r = window.rabble, a = r.cam.orbitAnchor; if (!a) return null;
  const p = r.world.people.reduce((b, q) => (Math.hypot(q.pos.x - a.x, q.pos.z - a.z, q.pos.y - a.y) < Math.hypot(b.pos.x - a.x, b.pos.z - a.z, b.pos.y - a.y) ? q : b));
  return [Math.round(p.sx), Math.round(p.sy)];
});
console.log("before", before, "after slide", mid, "anchored person now at", person);
await sleep(1200);
await slide(box.x + box.width - 40, box.x + 60, 500);    // a flick back
await sleep(2500);
console.log("after flick", await watch());
await sleep(1500);
await cap.stop();
await browser.close();
