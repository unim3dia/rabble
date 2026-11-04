// Phone tilt -> sideways gravity. On a computer the mouse stands in for tilt.
import { TILT } from "./config.js";

export function createTilt() {
  const state = { target: 0, value: 0, hasSensor: false };

  function onOrient(e) {
    if (e.gamma == null) return;
    state.hasSensor = true;
    // gamma is left/right tilt in portrait; flip for landscape.
    const angle = screen.orientation && Math.abs(screen.orientation.angle) === 90
      ? (e.beta || 0) * Math.sign(screen.orientation.angle)
      : e.gamma;
    state.target = Math.max(-1, Math.min(1, angle / TILT.degreesForMax));
  }

  function onPointer(e) {
    if (state.hasSensor || e.pointerType === "touch") return;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    state.target = Math.max(-1, Math.min(1, nx * 1.1));
  }

  window.addEventListener("deviceorientation", onOrient);
  window.addEventListener("pointermove", onPointer);
  window.addEventListener("pointerleave", () => { if (!state.hasSensor) state.target = 0; });

  // iOS asks for permission, and only from a tap.
  state.requestPermission = async () => {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === "function") {
      try {
        return (await D.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
    return true;
  };

  // A dead zone so the small shakes of a hand-held phone don't move anything.
  state.update = () => {
    const t = state.target;
    const dz = TILT.deadZone;
    const shaped = Math.abs(t) < dz ? 0 : Math.sign(t) * (Math.abs(t) - dz) / (1 - dz);
    state.value += (shaped - state.value) * TILT.smoothing;
    return state.value;
  };

  return state;
}
