// The camera looks down on the mound from a little above. Tilting the phone
// (or the mouse) swings it a little way around the pile, it drifts slowly on
// its own, and you can drag to turn the pile. Moving the camera is what makes
// near people slide past far ones, and that's what makes the pile feel 3D.
import { CAMERA, LOOK } from "./config.js";

const DEG = Math.PI / 180;

export function createCamera() {
  return {
    yaw: 0, yawTarget: 0, dragYaw: 0,
    pitch: CAMERA.elevationDeg * DEG, dragPitch: 0,
    center: 0, centerTarget: 0,
    // Where the pile stands on the full-screen stage (eased): before you join
    // it sits above the buttons; once you're in, it fills the screen.
    stage: { ...CAMERA.stageMenu }, stageTarget: CAMERA.stageMenu,
    // How much of the stage the pile may fill: wider rings get a bigger heap.
    ringScale: CAMERA.ringScale.neighborhood, ringScaleTarget: CAMERA.ringScale.neighborhood,   // 0: mound on the floor line, 1: focus point centred
    zoom: 1, zoomTarget: 1, userZoom: 1,
    // Your own zoom and pan, applied on screen so it can center on your fingers.
    view: { zoom: 1, panX: 0, panY: 0 }, w: 0, h: 0,
    focus: { x: 0, y: 0, z: 0 }, focusTarget: { x: 0, y: 0, z: 0 },
    D: 1000, f: 1000, fit: 0, cx: 0, cy: 0,
    cosY: 1, sinY: 0, cosP: 1, sinP: 0,
  };
}

// Recompute where things land on screen for this frame.
// Keep a drag-pitch offset inside the allowed range (so it never feels stuck).
export function clampPitch(cam) {
  const lo = (CAMERA.minElevationDeg - CAMERA.elevationDeg) * DEG;
  const hi = (CAMERA.maxElevationDeg - CAMERA.elevationDeg) * DEG;
  cam.dragPitch = Math.max(lo, Math.min(hi, cam.dragPitch));
}

export function updateCamera(cam, { w, h }, world, tilt, t) {
  const drift = Math.sin((t / CAMERA.driftMs) * Math.PI * 2) * CAMERA.driftYawDeg * DEG;
  cam.yawTarget = tilt * CAMERA.tiltYawDeg * DEG + drift + cam.dragYaw;
  cam.yaw += (cam.yawTarget - cam.yaw) * CAMERA.ease;
  const pitchTarget = Math.max(CAMERA.minElevationDeg * DEG,
    Math.min(CAMERA.maxElevationDeg * DEG, CAMERA.elevationDeg * DEG + cam.dragPitch));
  cam.pitch += (pitchTarget - cam.pitch) * CAMERA.ease;
  cam.center += (cam.centerTarget - cam.center) * 0.05;
  cam.zoom += (cam.zoomTarget - cam.zoom) * 0.08;
  cam.w = w; cam.h = h;
  // Zoomed all the way out: drift back to centre.
  if (cam.view.zoom <= 1.001) { cam.view.panX *= 0.9; cam.view.panY *= 0.9; }
  for (const k of ["x", "y", "z"]) cam.focus[k] += (cam.focusTarget[k] - cam.focus[k]) * 0.03;

  cam.cosY = Math.cos(cam.yaw); cam.sinY = Math.sin(cam.yaw);
  cam.cosP = Math.cos(cam.pitch); cam.sinP = Math.sin(cam.pitch);
  // The framing is measured while a ring settles in, then held: people coming
  // and going never move the camera. Only a ring change (or you) does.
  if (cam.framing || !cam.R) cam.R = Math.max(world.radius, 60);
  const R = cam.R;
  cam.D = R * CAMERA.distanceK;
  // Frame the whole mound, centred, whatever the crowd size.
  for (const k of ["floor", "height", "width"]) cam.stage[k] += (cam.stageTarget[k] - cam.stage[k]) * 0.04;
  // On the menu the heap sits in the middle of the screen: lift it until its
  // top and its front edge are even about the middle line.
  const middle = cam.stageTarget.middle;
  const liftTarget = middle != null && cam.screenTop != null
    ? (cam.lift || 0) + (h * middle - (cam.screenTop + h * cam.stage.floor + (cam.lift || 0)) / 2) : 0;
  cam.lift = (cam.lift || 0) + (liftTarget - (cam.lift || 0)) * 0.05;
  cam.ringScale += (cam.ringScaleTarget - cam.ringScale) * 0.025;
  // Measured from last frame: if the top of the heap reaches above the space
  // it's allowed (the title, say), gently shrink until it fits.
  const roof = h * (cam.stage.floor - cam.stage.height);
  if (!cam.framing) { /* held */ } else if (cam.screenTop != null && cam.screenTop < roof) cam.squeeze = Math.max(0.5, (cam.squeeze || 1) * 0.985);
  else if (cam.screenTop != null && cam.screenTop > roof + h * 0.04) cam.squeeze = Math.min(1, (cam.squeeze || 1) * 1.004);
  const grow = cam.ringScale * (cam.squeeze || 1);
  if (cam.framing || !cam.top) cam.top = Math.max(world.top, 1);
  const fit = Math.min((w * cam.stage.width * grow) / R, (h * cam.stage.height * grow) / cam.top);
  cam.fit = cam.fit ? cam.fit + (fit - cam.fit) * 0.05 : fit;
  cam.f = cam.D * cam.fit * cam.zoom;
  cam.cx = w / 2;
  cam.cy = 0;
  // Put the front edge of the mound's footprint on the floor line.
  // (Measured with the focus at the origin, so a close-up doesn't move the floor line.)
  // (and before your own zoom and pan, which are applied on top).
  const focus = { ...cam.focus };
  const view = cam.view;
  cam.focus = { x: 0, y: 0, z: 0 };
  cam.view = { zoom: 1, panX: 0, panY: 0 };
  const front = project(cam, 0, 0, R * 0.55);
  cam.focus = focus;
  cam.view = view;
  const onFloor = h * cam.stage.floor + cam.lift - front.y;
  // For a close-up, the focus point (which lands at cy) moves to the middle.
  cam.cy = onFloor + (h * 0.48 - onFloor) * cam.center;
}

// World point -> screen point, plus scale (k) and distance from the camera.
export function project(cam, x, y, z) {
  const X = x - cam.focus.x, Y = y - cam.focus.y, Z = z - cam.focus.z;
  const x1 = X * cam.cosY - Z * cam.sinY;
  const z1 = X * cam.sinY + Z * cam.cosY;
  const y2 = Y * cam.cosP - z1 * cam.sinP;
  const z2 = Y * cam.sinP + z1 * cam.cosP;
  const depth = Math.max(cam.D - z2, cam.D * 0.05);   // never behind the camera
  const k = cam.f / depth;
  const v = cam.view;
  return {
    x: (cam.cx + x1 * k - cam.w / 2) * v.zoom + cam.w / 2 + v.panX,
    y: (cam.cy - y2 * k - cam.h / 2) * v.zoom + cam.h / 2 + v.panY,
    k: k * v.zoom,
    depth,
  };
}

// The horizontal direction toward the camera, in world space.
export function towardCamera(cam) {
  return { x: cam.sinY, z: cam.cosY };
}

// Screen point -> world point at a given camera-space depth (the inverse of
// project). Used to carry your person under your finger.
export function unproject(cam, sx, sy, z2) {
  const v = cam.view;
  sx = (sx - v.panX - cam.w / 2) / v.zoom + cam.w / 2;
  sy = (sy - v.panY - cam.h / 2) / v.zoom + cam.h / 2;
  const depth = cam.D - z2;
  const x1 = ((sx - cam.cx) * depth) / cam.f;
  const y2 = ((cam.cy - sy) * depth) / cam.f;
  const Y = y2 * cam.cosP + z2 * cam.sinP;
  const z1 = -y2 * cam.sinP + z2 * cam.cosP;
  return {
    x: x1 * cam.cosY + z1 * cam.sinY + cam.focus.x,
    y: Y + cam.focus.y,
    z: -x1 * cam.sinY + z1 * cam.cosY + cam.focus.z,
  };
}

// How far toward the camera a world point sits (camera-space z).
export function cameraDepth(cam, x, y, z) {
  const X = x - cam.focus.x, Y = y - cam.focus.y, Z = z - cam.focus.z;
  const z1 = X * cam.sinY + Z * cam.cosY;
  return Y * cam.sinP + z1 * cam.cosP;
}

// Zoom by factor k around a screen point, keeping that point under your fingers.
export function zoomAt(cam, k, x, y, min, max) {
  const v = cam.view;
  const next = Math.max(min, Math.min(max, v.zoom * k));
  const r = next / v.zoom;
  v.panX = x - cam.w / 2 - (x - cam.w / 2 - v.panX) * r;
  v.panY = y - cam.h / 2 - (y - cam.h / 2 - v.panY) * r;
  if (k !== 1) cam.userZoomedAt = performance.now();
  v.zoom = next;
  // Room to wander around the pile (above the top, out to the sides), but never
  // so far that you lose it.
  const limX = (cam.w * Math.max(0, v.zoom - 1)) / 2 + cam.w * 0.35;
  const limY = (cam.h * Math.max(0, v.zoom - 1)) / 2 + cam.h * 0.35;
  v.panX = Math.max(-limX, Math.min(limX, v.panX));
  v.panY = Math.max(-limY, Math.min(limY, v.panY));
}
