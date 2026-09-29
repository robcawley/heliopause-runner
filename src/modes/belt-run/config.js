// Every number that affects the belt run's feel lives here. The tuning panel
// (press T) edits the live copy; "Copy values" puts it on the clipboard.
//
// A host game can override any of it when it creates the mode:
//   createBeltRun(engine, { overrides: { lane: { safeRadius: 40 } } })
//
// Units: world units are roughly metres. The beacon lane runs along -z.

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const DEFAULTS = {
  input: {
    steering: 'auto',        // 'auto' | 'drag' | 'follow'
    stickRadius: 0.3,        // mouse: pointer distance from centre (share of the short screen side) for full deflection
    touchStickRadius: 70,    // touch: drag distance in px for full deflection
    deadzone: 0.04,
    stickCurve: 1.35,        // >1 gives finer control near the centre
    doubleTap: 0.24,
  },

  flight: {
    // A nimble arcade fighter. The stick sets turn *rates*; the ship flies
    // where it points. Pitch is limited short of straight up or down so the
    // horizon never flips, and yaw is free: you can turn right round.
    invertY: false,          // true: stick up = nose down, like a flight sim
    yawRate: 2.3,            // rad/s at full deflection (~130 degrees a second)
    pitchRate: 2.1,
    turnResponse: 13,        // how quickly turn rate reaches the stick's demand (higher = snappier)
    maxPitch: 1.4,           // radians
    grip: 7,                 // how quickly velocity swings round to the nose (lower = more drift)
    cruiseSpeed: 70,
    boostSpeed: 150,
    brakeSpeed: 28,
    speedResponse: 2.6,
    bankPerTurn: 0.42,       // visual bank per rad/s of yaw
    maxBank: 1.0,
    dodgeDecay: 5,           // how fast a roll's sideways burst dies away
  },

  roll: {
    charges: 3,
    recharge: 2.0,           // seconds per charge
    duration: 0.4,
    impulse: 34,             // sideways burst, units/s
    cameraFollow: 1.0,       // 1 = the pilot rolls with the ship; lower it if rolls feel queasy
  },

  camera: {
    fov: 74,
    boostFovKick: 16,
    brakeFovKick: -6,
    fovResponse: 6,
    headLag: 0.006,          // how far the pilot's head is thrown by g-force
    headLagMax: 0.16,
    headStiffness: 90,
    headDamping: 14,
    lookIntoTurn: 0.06,      // the pilot glances into the turn, radians per rad/s of yaw
    traumaDecay: 1.5,
    shakeAngle: reducedMotion ? 0.02 : 0.055,
    shakeOffset: reducedMotion ? 0.03 : 0.09,
    shakeFrequency: 24,
  },

  world: {
    dustCount: 3200,
    dustRange: 48,           // dust fills a box this far around the pilot
    dustStreak: 0.03,        // streak length per unit of speed
    fieldRadius: 420,        // the belt is simulated in a sphere this big around the ship
    ambientRocks: 650,       // scattered through the whole sphere: scenery, parallax, stray hazards
    pathRocks: 44,           // placed along where you are heading: the dodging
    pathSpread: 24,          // how far off your line path rocks sit
    rockMinSize: 0.7,
    rockMaxSize: 3.6,
    fogNear: 150,
    fogFar: 480,
  },

  nearMiss: {
    radius: 3.6,             // clearance (surface to hull) that counts as a near miss
    hitRadius: 1.5,          // clearance below this is a hit (the cockpit reaches ~1.5 ahead of the eye)
    chainWindow: 2.6,
    daredevilChain: 3,
    score: 50,
    daredevilBonus: 200,
    whooshLead: 0.42,
    hitStop: 0.05,
    slowmo: 0.2,
    slowmoScale: 0.4,
    daredevilSlowmo: 0.5,
  },

  phase: {
    duration: 0.4,
    cooldown: 3,
    fovKick: 10,
  },

  lane: {
    safeRadius: 30,          // shielded inside this distance from the lane's centre line
    warnRadius: 24,          // guidance appears past this
    ringSpacing: 160,
    gateSpacing: 400,
    gateRadius: 4,
    gateOffset: 0.5,
    gateRepair: 20,
    coreRepair: 1.5,         // hull per second near the centre line
    coreRadius: 14,
  },

  hull: {
    max: 100,
    rockDamageBase: 8,
    rockDamagePerSize: 5,
  },

  radiation: {
    // Tuned so a short excursion is free, a long one is a decision:
    //   ~10 m outside the lane: damage starts after ~20 s, death at ~45 s
    //   ~60 m outside: damage after ~5 s, death at ~25 s
    riseRate: 5,             // exposure per second, scaled up the further out you are
    fallRate: 16,
    damageFrom: 60,          // exposure at which the hull starts taking damage
    hullDamage: 5,           // hull per second at full exposure
  },

  fx: {
    bloomStrength: 0.85,
    bloomRadius: 0.45,
    bloomThreshold: 0.18,
    aberration: 0.12,
    grain: 0.05,
    vignette: 1.0,
    exposure: 1.0,
    resolutionScale: 1.0,
  },

  audio: {
    music: 0.55,
    sfx: 0.85,
    engine: 0.22,
  },
};

// Deep-merge overrides into a fresh copy of the defaults
export function makeConfig(overrides = {}) {
  const merge = (base, over) => {
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [k, v] of Object.entries(over || {})) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' ? merge(base[k], v) : v;
    }
    return out;
  };
  return merge(DEFAULTS, overrides);
}
