// Every number that affects feel lives here, so tuning never means hunting
// through systems. The tuning panel (press T) edits this object live, and its
// "Copy values" button puts the whole thing on the clipboard to paste back in.
//
// Units: world units are roughly metres. The ship sits at z = 0 and the belt
// streams toward it along +z.

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const CONFIG = {
  flight: {
    boundsX: 9,              // lateral half-width of the flyable frame
    boundsY: 5,              // vertical half-height
    steering: 'auto',        // 'auto' | 'drag' | 'follow'  (auto: follow for mouse, drag for touch)
    dragSensitivity: 0.03,   // world units per pixel of drag
    keySpeed: 16,            // how fast keys/stick move the aim point
    stiffness: 55,           // spring pulling the ship to its aim point
    damping: 12,             //   higher = less overshoot
    bankPerSpeed: 0.042,     // roll per unit of lateral velocity
    maxBank: 0.6,            // radians
    pitchPerSpeed: 0.022,
    yawIntoTurn: 0.012,      // nose leans into the turn
    cruiseSpeed: 62,         // forward speed, units/s
    boostSpeed: 120,
    speedResponse: 2.2,      // how quickly speed chases its target
  },

  camera: {
    fov: 74,
    boostFovKick: 14,
    fovResponse: 6,
    headLag: 0.0065,         // how far the pilot's head is thrown by acceleration
    headLagMax: 0.18,
    headStiffness: 90,
    headDamping: 14,
    traumaDecay: 1.5,        // trauma units lost per second
    shakeAngle: reducedMotion ? 0.02 : 0.055,
    shakeOffset: reducedMotion ? 0.03 : 0.09,
    shakeFrequency: 24,
  },

  world: {
    dustCount: 2600,
    dustDepth: 280,
    dustSpread: 55,
    dustStreak: 0.035,       // streak length per unit of speed
    rockCount: 48,
    rockSpawnDepth: 460,
    rockAimBias: 0.28,        // share of rocks placed on the ship's predicted path
    rockMinSize: 0.7,
    rockMaxSize: 3.4,
    giantRocks: 6,           // big off-lane rocks for scale and parallax
    fogNear: 140,
    fogFar: 470,
  },

  nearMiss: {
    radius: 3.4,             // clearance (surface to ship) that counts as a near miss
    hitRadius: 0.85,         // clearance below this is a hit
    chainWindow: 2.6,        // seconds to land the next near miss in a chain
    daredevilChain: 3,
    score: 50,
    daredevilBonus: 200,
    whooshLead: 0.42,        // seconds before a pass that the whoosh starts
    hitStop: 0.06,           // world freeze on a near miss, seconds
    slowmo: 0.22,            // slow-motion duration after a near miss
    slowmoScale: 0.35,
    daredevilSlowmo: 0.55,
  },

  phase: {
    duration: 0.38,          // i-frames
    cooldown: 3,
    fovKick: 10,
  },

  fx: {
    bloomStrength: 0.85,
    bloomRadius: 0.45,
    bloomThreshold: 0.18,
    aberration: 0.12,        // resting chromatic aberration
    grain: 0.05,
    vignette: 1.0,
    exposure: 1.0,
    resolutionScale: 1.0,    // drop to 0.75 on weak GPUs
  },

  audio: {
    music: 0.55,
    sfx: 0.85,
    engine: 0.22,
  },
};
