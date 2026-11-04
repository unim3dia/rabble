// Tunables for the pile. Everything that "feels" a certain way lives here.

export const RINGS = ["neighborhood", "city", "state", "world"];

export const HOME = {
  neighborhood: "Park Slope, Brooklyn",
  city: "New York City",
  state: "New York",
  world: "the world",
};

// How many people are in the pile for each ring (reusing the cast as needed).
export const CROWD = {
  neighborhood: 44,
  city: 72,
  state: 100,
  world: 140,
};

// The pile is a real 3D mound of soft balls. World units are pixels at the
// mound's centre; y is up, z points toward the camera.
export const PHYS = {
  gravity: 1500,            // px/s²
  maxSpeed: 9,              // px/step: the fastest anyone moves (falling included)
  damping: 0.9,             // velocity kept per step: heavy, calm, no jitter
  iterations: 5,
  friction: 0.7,            // how much sliding between touching people is cancelled
  staticSlip: 0.35,         // px/step: slips smaller than this are cancelled completely
  restingWeight: 0.06,      // resting people barely give way, like ground
  groundFriction: 0.85,
  radiusK: 0.3,             // collision ball radius × person size: drawings overlap
  axisPullX: 11,            // pull toward the centre line, per px (left/right)
  axisPullZ: 20,            // …and front/back: the mound is wider than it is deep
  magnet: 420,              // pull between close neighbours, px/s² at contact
  magnetRange: 2.6,         // × collision radius
  magnetLift: 0.25,         // how much of that pull is vertical
  sleepSpeed: 0.22,         // px/step: held up and slower than this, someone settles in place
  sleepFrames: 30,
  wakeOverlap: 6,           // px of push that wakes someone (a real push, not snug squeeze)
  touchMargin: 3,           // px: this close counts as touching (for being held up)
  unheldFrames: 30,         // frames without support before a resting person falls
  presettleSteps: 520,
  packSpacing: 2.05,        // × radius between people in the packed mound (soft bodies squeeze)
  shapeSlack: 0.85,         // the outline the pile is held inside, × its packed size
  quietSteps: 600,          // 10 s with no newcomer: everyone drifting slowly settles
  quietSpeed: 1.5,          // px/step: "slowly"
  quietEvery: 120,          // …and again every 2 s after that
  restlessFrames: 360,      // never still for this long (6 s): settle anyway
  wallCalm: 4,              // at the tower's edge, this × sleepSpeed still counts as resting
  shapeHold: 0.3,           // how much of the way back inside the outline people go, per step
  baseFrac: 0.45,
  perchSlide: 0.35,         // px/step: how fast someone balanced on one person slides off
  perchGrip: 0.15,          // their (low) friction while they do
  perchFrames: 90,          // after this long sliding, they settle where they are            // the bottom 30% of the pile is set still, like a foundation
  youBuoyancy: 0.45,        // you weigh less than everyone, so you stay near the top
  youDrift: 0.05,           // px/step²: you lean toward the camera side of the pile
};

// Person size from crowd size: bigger crowds look further away.
export const SIZE = {
  world: 100,               // everyone's size in world units (the camera does the zooming)
  k: 1.75,                  // size = k × stage width ÷ √crowd
  min: 30,
  max: 140,
  sprite: 1.18,             // drawn size × person size
};

export const CAMERA = {
  elevationDeg: 24,         // looking down on the mound from a little above
  minElevationDeg: 10,      // drag up and down to look from lower…
  maxElevationDeg: 46,      // …or from higher above
  dragPitchPerPx: 0.004,
  distanceK: 12,            // camera distance × mound radius: far and narrow, so front and back people look the same size
  // The stage is the whole screen. floor: where the front of the pile stands
  // (× screen height); height/width: how much of the screen the mound may fill.
  stageMenu: { floor: 0.7, height: 0.4, width: 0.38, middle: 0.5 },   // further away, centred on screen
  stagePile: { floor: 0.9, height: 0.66, width: 0.37 },   // open air above it for words
  // Share of that stage each ring's pile fills: the heap visibly grows.
  ringScale: { neighborhood: 0.8, city: 0.88, state: 0.95, world: 1 },
  tiltYawDeg: 9,            // phone tilt / mouse turns the camera this far around
  driftYawDeg: 1.5,         // slow idle drift so the pile always feels round
  driftMs: 24000,
  dragYawPerPx: 0.006,      // drag to turn the pile
  ease: 0.06,
  joinZoom: 1.16,           // the camera leans in once you're held
  joinMs: 2600,
};

export const LOOK = {
  figureMass: 0.67,         // √(figure area) × person size: everyone covers the same area on screen
  hazeBands: 4,             // far people are drawn through this many layers of air
  haze: "rgba(52, 33, 26, 0.17)",
  keyLight: "rgba(255, 214, 160, 0.20)",
  underShadow: "rgba(34, 18, 12, 0.32)",
  contactShadow: 0.32,
  floorFrac: 0.3,           // floor band below the pile, × stage width
  floorMaxFrac: 0.2,        // …but at most this much of the stage height
  swayPx: 8,
  orderHysteresis: 0.18,    // × size: depth difference needed before two people swap order
};

export const BREATH = {
  periodMs: 5200,           // the pile breathes together, slowly
  amp: 0.004,
  spread: 0.35,             // how out of step people are (radians)
  syncRate: 0.0025,         // how fast you fall into step once you're in
};

export const POSE = {
  shiftEveryMs: [25000, 45000], // now and then someone in the pile shifts, quietly
  fadeMs: 900,
  sleepyShare: 0.42,          // share of the pile dozing with eyes closed
  nodDeg: 1.5,                // how far heads lean and nuzzle
};

export const SQUISH = {
  decay: 0.9,
  max: 0.45,
};

export const TILT = {
  degreesForMax: 40,
  smoothing: 0.035,
  deadZone: 0.18,           // ignore small hand movements
  parallaxPx: 26,
};

export const DROP = {
  fallMs: 2800,
  reachRadius: 3.2,         // × collision radius: who reaches up to catch you
  hugMs: 1800,
  rippleSpeed: 180,         // px/s: the squeeze travels through the pile
};

// People coming and going.
export const FLOW = {
  rollSpeed: 6,              // px/step along the floor when rolling out
  followAfterMs: 7000,      // after you land, someone else drops in after you
  resizeEase: 0.035,        // how quickly everyone resizes when the ring changes
  spawnEveryMs: 90,         // newcomers tumbling in when the ring grows
  landSpread: 1,            // × the base's reach: newcomers land anywhere on it, so it widens as it grows
  expressEveryMs: [25000, 50000],  // someone smiles, chuckles, sighs… now and then         // newcomers land anywhere within this × the mound's radius
  leaveEveryMs: 70,         // people rolling out when the ring shrinks
  menuFirstArrivalsMs: [4500, 6000], // on the opening screen: the first one lands within 5 s, the next 6 s later…
  menuArriveEveryMs: [9000, 16000],  // …then someone new drops in this often
  menuExtraMax: 12,         // …until the pile is this many over its ring's crowd
  ambientEveryMs: [45000, 90000],  // now and then someone leaves and someone arrives
  arriveAfterMs: 2600,
};

export const ZOOM = {
  min: 0.55,                // pinch out to see the whole room…
  max: 3.2,                 // …or in toward anyone to see faces
  wheel: 0.0015,
};

export const CLOSEUP = {
  zoom: 4,                  // tap yourself: the camera flies in this close…
  holdMs: 5000,             // …stays a while (zoom out yourself to leave early)…
  ease: 0.05,               // …and flies back out
};

// The room's light shifts to a new mood every minute or two.
export const MOOD = {
  firstAfterMs: 45000,
  everyMs: [60000, 120000],
  fadeMs: 9000,             // a slow crossfade between moods
  shiftFadeMs: 1800,        // the ring button: a quick (but never sudden) change of light
  keyScale: 0.55,           // how strong the lamp's shine on people is
  underScale: 0.5,          // how deep the shadow under the pile is (the foundation stays clear)
  hazeScale: 0.55,          // how much far people sink into the room's air
};

export const MURMUR = {
  idleEveryMs: [14000, 26000],
  tiltThreshold: 0.6,
  maxBubbles: 3,
};

// Dust drifting in the room's light.
export const DUST = {
  back: 160,                // small motes far behind the pile
  front: 9,                 // big soft ones drifting past close to the camera
  drift: 0.000012,          // screen widths per ms: very slow
};
