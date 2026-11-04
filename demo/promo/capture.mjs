// Sharp phone-screen capture: full-resolution screenshots taken as fast as
// Chrome gives them (about 20 a second), each saved with when it was taken,
// so ffmpeg can rebuild the clip at the speed it really played.
import fs from "node:fs";
import path from "node:path";

export async function startCapture(page, dir, { width, height, scale, quality = 90 }) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const clip = { x: 0, y: 0, width, height, scale };
  const frames = [];
  const marks = [];
  let running = true;

  const loop = (async () => {
    while (running) {
      const t = Date.now() / 1000;
      try {
        const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality, optimizeForSpeed: true, clip });
        const file = `f${String(frames.length).padStart(6, "0")}.jpg`;
        fs.writeFileSync(path.join(dir, file), Buffer.from(data, "base64"));
        frames.push({ file, t });
      } catch {
        await new Promise((r) => setTimeout(r, 50));    // mid-navigation: try again
      }
    }
  })();

  return {
    // A named moment, in the same clock as the frames.
    mark(name) {
      marks.push({ name, t: Date.now() / 1000 });
      console.log(`mark ${name}`);
    },
    async stop() {
      running = false;
      await loop;
      fs.writeFileSync(path.join(dir, "frames.json"), JSON.stringify({ frames, marks }));
      return { frames, marks };
    },
  };
}
