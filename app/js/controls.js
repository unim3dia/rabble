// Touch and mouse on the pile: tap someone; press on your own person and drag
// to move them; press and hold anyone else, then drag, to pick them up and
// place them (sculpting the pile); drag anywhere else sideways to turn the pile and up/down to look
// from higher or lower; pinch (or scroll) to zoom toward your fingers, and once
// zoomed in, drag to move around.
import { CAMERA, ZOOM } from "./config.js";
import { clampPitch, zoomAt } from "./camera.js";

const DRAG_START_PX = 6;
const HOLD_MS = 350;               // press and hold this long on someone to pick them up
const HOLD_SLOP_PX = 12;           // a finger may wobble this much while holding

export function setupControls(canvas, cam, { onTap, grabYou, grabOther, moveYou, dropYou }) {
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const local = (x, y) => {
    const rect = canvas.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  };
  const middle = () => {
    const [a, b] = [...pointers.values()];
    return local((a.x + b.x) / 2, (a.y + b.y) / 2);
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinch = { d: spread() };
      drag = null;
    } else if (pointers.size === 1) {
      const rect = canvas.getBoundingClientRect();
      const holding = grabYou(e.clientX - rect.left, e.clientY - rect.top);
      drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, holding };
      if (!holding && grabOther) {
        const mine = drag;
        mine.timer = setTimeout(() => {
          if (drag !== mine || mine.moved || pointers.size !== 1) return;
          if (grabOther(mine.x0 - rect.left, mine.y0 - rect.top)) {
            mine.holding = mine.lifted = true;          // picked up: now a drag moves them
            navigator.vibrate?.(12);
          }
        }, HOLD_MS);
      }
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      // Zoom toward the point between your fingers.
      const d = spread();
      const m = middle();
      zoomAt(cam, d / pinch.d, m.x, m.y, ZOOM.min, ZOOM.max);
      pinch.d = d;
      return;
    }
    if (!drag) return;
    const slop = drag.timer && !drag.lifted ? HOLD_SLOP_PX : DRAG_START_PX;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > slop) drag.moved = true;
    if (drag.moved && drag.holding) {
      const rect = canvas.getBoundingClientRect();
      moveYou(e.clientX - rect.left, e.clientY - rect.top);
      return;
    }
    // Zoomed in: one finger moves around the pile (to reach the top, say).
    if (drag.moved && cam.view.zoom > 1.05) {
      zoomAt(cam, 1, 0, 0, ZOOM.min, ZOOM.max);   // (re-clamps the pan)
      cam.view.panX += e.clientX - drag.x;
      cam.view.panY += e.clientY - drag.y;
      zoomAt(cam, 1, 0, 0, ZOOM.min, ZOOM.max);
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
    if (drag.moved) {
      cam.dragYaw += (e.clientX - drag.x) * CAMERA.dragYawPerPx;
      cam.dragPitch += (e.clientY - drag.y) * CAMERA.dragPitchPerPx;
      clampPitch(cam);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });

  const end = (e) => {
    if (drag) clearTimeout(drag.timer);
    const wasTap = drag && !drag.moved && !drag.lifted && !pinch && pointers.size === 1;
    if (drag && drag.holding) dropYou();
    pointers.delete(e.pointerId);
    if (wasTap && e.type === "pointerup") {
      const rect = canvas.getBoundingClientRect();
      onTap(e.clientX - rect.left, e.clientY - rect.top);
    }
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = local(e.clientX, e.clientY);
    zoomAt(cam, Math.exp(-e.deltaY * ZOOM.wheel), p.x, p.y, ZOOM.min, ZOOM.max);
  }, { passive: false });
}
