// The orbit dial: a frosted strip along the bottom that shows up once you're
// zoomed in close. Slide along it and the camera circles around whoever you're
// looking at (they stay put on screen; the people around them shift past).
// A flick keeps it gliding, easing to a stop. Out wide, a normal drag already
// turns the pile, so the dial fades away.
import { CAMERA } from "./config.js";

const YAW_PER_PX = CAMERA.dragYawPerPx * 0.9;
const TICK_PX = 14;               // tick spacing on the strip
const FRICTION = 0.92;            // per frame, after a flick
const KEY_STEP_PX = 40;           // arrow keys turn this far
const SETTLE_MS = 1600;           // after it stops, how long the anchor holds while the camera eases in

export function createOrbitDial({ el, cam, findAnchor, isShown }) {
  let drag = null;
  let vel = 0;                    // px per frame, for the glide
  let lastMove = 0;
  let offset = 0;                 // how far the ticks have scrolled

  function turn(px) {
    cam.dragYaw += px * YAW_PER_PX;
    offset += px;
    el.style.setProperty("--ticks", `${offset % TICK_PX}px`);
    lastMove = performance.now();
  }

  function begin() {
    if (!cam.orbitAnchor) cam.orbitAnchor = findAnchor();
  }

  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    begin();
    drag = { x: e.clientX, t: performance.now() };
    vel = 0;
  });
  el.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const now = performance.now();
    const dx = e.clientX - drag.x;
    turn(dx);
    vel = (dx / Math.max(1, now - drag.t)) * 16;            // px per ~frame
    drag = { x: e.clientX, t: now };
  });
  const end = () => { drag = null; };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    begin();
    vel = (e.key === "ArrowLeft" ? -1 : 1) * KEY_STEP_PX * (1 - FRICTION);
  });

  // Called every frame: show or hide, glide after a flick, let go of the anchor.
  function step() {
    const shown = isShown();
    el.classList.toggle("on", shown);
    el.tabIndex = shown ? 0 : -1;
    if (!drag && Math.abs(vel) > 0.05) {
      turn(vel);
      vel *= FRICTION;
    } else if (!drag) {
      vel = 0;
    }
    if (!drag && cam.orbitAnchor && performance.now() - lastMove > SETTLE_MS) cam.orbitAnchor = null;
  }

  return { step };
}
