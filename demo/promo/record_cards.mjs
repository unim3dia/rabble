// Records each cutaway card (card.html) as it builds, at full phone resolution.
//   node demo/promo/record_cards.mjs   (with the project root served on CARDS_URL)
import { createRequire } from "node:module";
import path from "node:path";
import { startCapture } from "./capture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const URL_ = process.env.CARDS_URL || "http://127.0.0.1:8151/demo/promo/card.html";
const PHONE = { width: 414, height: 736 };
const SCALE = 1080 / PHONE.width;
const CARDS = ["title", "meta", "you", "dive", "ring", "talk", "say", "together", "next", "end"];
const HOLD_MS = 4200;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: SCALE, isMobile: true });
for (const id of CARDS) {
  const page = await ctx.newPage();
  await page.goto(`${URL_}?c=${id}`);
  await page.waitForFunction(() => document.body.dataset.ready === "1");
  await page.waitForTimeout(300);
  // Rewind and hold the card's entrance until the capture is running.
  await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; }));
  const cap = await startCapture(page, path.join(DIR, "cards", id), { ...PHONE, scale: SCALE });
  await page.waitForTimeout(250);
  cap.mark("ready");
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  await page.waitForTimeout(HOLD_MS);
  await cap.stop();
  await page.close();
  console.log(id);
}
await browser.close();
