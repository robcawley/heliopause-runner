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
    // Free flight: input is a stick. The ship accelerates sideways toward
    // stick x maxLateral, and its nose follows its velocity, so dodging hard
    // really does point you across the belt.
    steering: 'auto',        // 'auto' | 'drag' | 'follow'  (auto: follow for a mouse, virtual stick for touch)
    maxLateral: 34,          // top sideways/vertical speed, units/s
    agility: 5.5,            // how fast lateral velocity reaches the stick's demand
    stickRadius: 0.32,       // mouse-follow: pointer distance from centre (share of screen) for full deflection
    touchStickRadius: 70,    // touch: drag distance in px for full deflection
    deadzone: 0.06,
    headingFollow: 0.85,     // how fully the nose turns toward the velocity vector (1 = exactly)
    bankPerSpeed: 0.022,     // roll from sideways speed
    bankPerAccel: 0.006,     // extra roll while accelerating into a turn
    maxBank: 0.85,
    cruiseSpeed: 62,         // forward speed, units/s
    boostSpeed: 120,
    speedResponse: 2.2,
  },

  roll: {
    // Evasive barrel roll: a sideways burst plus a full 360.
    charges: 3,
    recharge: 2.4,           // seconds per charge
    duration: 0.42,
    impulse: 38,             // extra sideways speed at the start of a roll
    doubleTap: 0.24,         // seconds: double-tap a direction key to roll
    cameraFollow: 1.0,       // 1 = the pilot rolls with the ship; lower it if rolls feel queasy
  },

  lane: {
    // The beacon lane runs along the belt. Inside it you are shielded; outside,
    // radiation builds and eats the hull.
    safeRadius: 18,
    warnRadius: 14,          // guidance arrow appears past this
    ringSpacing: 150,        // faint lane rings, visual only
    gateSpacing: 380,        // repair gates
    gateRadius: 3.4,
    gateOffset: 0.55,        // gates sit within this share of the safe radius
    gateRepair: 18,
    coreRepair: 1.2,         // hull per second while near the lane centre
    coreRadius: 9,
  },

  hull: {
    max: 100,
    rockDamageBase: 8,
    rockDamagePerSize: 6,
  },

  radiation: {
    riseRate: 26,            // exposure per second per 10 units outside the lane
    fallRate: 22,            // exposure lost per second inside it
    hullDamage: 14,          // hull per second at full exposure
    damageFrom: 35,          // exposure at which the hull starts taking damage
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
    rockCount: 60,
    rockSpawnDepth: 460,
    rockSpread: 42,          // rocks spawn this far around the ship, so free flight never empties the belt
    rockAimBias: 0.18,   // share of rocks placed on the ship's predicted path
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
