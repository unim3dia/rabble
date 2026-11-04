// Renders the commercials' title frames (title.html) to full-resolution PNGs
// in demo/promo/spots/titles/. Each frame is a still, cut in on the beat.
//   node demo/promo/render_titles.mjs   (with the project root served on TITLES_URL)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, "spots", "titles");
const URL_ = process.env.TITLES_URL || "http://127.0.0.1:8151/demo/promo/title.html";
const PHONE = { width: 414, height: 736 };

export const TITLES = {
  one: { words: "One." },
  another: { words: "Then another." },
  everyone: { words: "Then everyone." },
  lockupA: { lockup: "A pile for everyone." },
  isYou: { words: "This is you.", bg: "selfie.jpg" },
  alsoYou: { words: "This is also you.", figure: "spots/you.png" },
  everyoneElse: { words: "And this is everyone." },
  thereYouAre: { words: "There you are." },
  lockupB: { lockup: "Come find your spot." },
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: PHONE, deviceScaleFactor: 1080 / PHONE.width });
for (const [name, params] of Object.entries(TITLES)) {
  await page.goto(`${URL_}?${new URLSearchParams(params)}`);
  await page.waitForFunction(() => document.body.dataset.ready === "1");
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(name);
}
await browser.close();
