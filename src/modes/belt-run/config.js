// Every number that affects the belt run's feel lives here. The tuning panel
// (press T) edits the live copy; "Copy values" puts it on the clipboard.
//
// A host game can override any of it when it creates the mode:
//   createBeltRun(engine, { overrides: { lane: { safeRadius: 40 } } })
//
// Units: world units are roughly metres. The beacon lane runs along -z.

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?town in the URL brings the first settlement up after 600 m, for testing
const quickTown = typeof location !== 'undefined' && new URLSearchParams(location.search).has('town');
// ?deadzone in the URL brings the first Dead Zone up about 1 km after take-off, for testing
const quickZone = typeof location !== 'undefined' && new URLSearchParams(location.search).has('deadzone');

export const DEFAULTS = {
  input: {
    steering: 'auto',        // 'auto' | 'mouse' | 'follow' | 'drag'  (auto: mouse once captured, drag on touch)
    mouseRange: 260,         // captured mouse: pixels of movement for full stick deflection
    mouseRecentre: 1.1,      // captured mouse: how fast the stick eases back to centre (0 = never)
    stickRadius: 0.3,        // mouse: pointer distance from centre (share of the short screen side) for full deflection
    touchStickRadius: 90,    // touch: drag distance in px for full deflection (was 70: too twitchy)
    touchDeadzone: 0.06,     // touch: thumb wobble near the centre is ignored
    touchCurve: 1.6,         // touch: centre precision (>1 = gentler small moves, full turn still at the edge)
    touchSmoothing: 0.06,    // touch: seconds of smoothing on the drag (0 = raw)
    touchThrottleLatch: true, // touch: Boost and Brake are taps that stay on (tap again, or tap the other, to stop),
                              // so the right thumb never has to hold one down while it holds Fire
    deadzone: 0.04,
    stickCurve: 1.35,        // >1 gives finer control near the centre
    doubleTap: 0.24,
    doubleTapSteerKeys: false, // also barrel roll on a double-tap of A / D / arrows (easy to trigger by accident)
  },

  flight: {
    // A nimble arcade fighter with full freedom: the stick sets pitch and yaw
    // *rates*, Q / E roll, and the ship flies where it points. Loop, turn
    // right round, fly inverted. Auto-level eases the wings back to the lane's
    // horizon when you let go of roll.
    invertY: false,          // true: stick up = nose down, like a flight sim
    yawRate: 2.3,            // rad/s at full deflection (~130 degrees a second)
    pitchRate: 2.1,
    rollRate: 2.8,
    turnResponse: 13,        // how quickly turn rates reach the stick's demand (higher = snappier)
    autoLevel: 2.0,          // how firmly the wings return to level when not rolling (0 = off)
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
    auto: true,              // dodge rolls happen by themselves just before a rock would hit: no roll
                             // buttons, no roll meter, no double-tap (holding Q / E still banks)
    autoLookahead: 0.35,     // seconds of warning the auto-roll acts on
    charges: 3,
    recharge: 2.0,           // seconds per charge
    duration: 0.4,
    impulse: 34,             // sideways burst, units/s
    cameraFollow: 1.0,       // 1 = the pilot rolls with the ship; lower it if rolls feel queasy
  },

  blasters: {
    // Twin cannons under the canopy, converging ahead of the nose
    fireRate: 9,             // shots per second (alternating barrels)
    boltSpeed: 700,          // units/s on top of the ship's own velocity
    boltLife: 0.9,           // seconds
    convergence: 160,       // where the streams meet when nothing is under the reticle
    aimRange: 400,           // otherwise they converge on the first rock under the reticle within this range        // metres ahead where the two streams meet
    damage: 1.25,            // per bolt; future weapon upgrades can raise this value
    heatPerShot: 4.5,
    coolRate: 32,            // heat lost per second
    overheatRecover: 35,     // after overheating, guns are locked until heat falls to this
    spread: 0.004,           // radians of random scatter
  },

  droid: {
    // PIP, the pilot-intervention probe: pops up from the dash when you stray
    // and, on request (R / gamepad Y), flies you back into the lane.
    popUpAt: 0.85,           // share of the lane's safe radius at which PIP appears
    returnTo: 0.45,          // share of the safe radius PIP aims for when bringing you home
    handBackAt: 0.6,         // PIP hands control back once you are inside this share, heading down the lane
    steerGain: 1.8,
    overrideStick: 0.7,      // stick input stronger than this takes control back from PIP
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
  cargo: {
    shudderRange: 90,        // metres from a giant rock's surface where heavy cargo starts to shudder
    shudder: reducedMotion ? 0.25 : 0.7,   // 0..1 at the rock's surface
    shudderFrequency: 9,     // slower and heavier than hit shake
  },

  world: {
    dustCount: 3200,
    dustRange: 48,           // dust fills a box this far around the pilot
    dustStreak: 0.03,        // streak length per unit of speed
    dustCalm: 0,             // 0..1 comfort setting: calms the streaks everywhere (Dead Zones calm them anyway)
    fieldRadius: 420,        // the belt is simulated in a sphere this big around the ship
    ambientRocks: 650,       // scattered through the whole sphere: scenery, parallax, stray hazards
    pathRocks: 44,           // placed along where you are heading: the dodging
    trafficCount: 4,         // civilian craft crossing the lane
    debrisCount: 110,        // non-colliding wreckage fragments
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
    // Wide enough to be an arena: room to turn, loop and, later, fight
    // attack ships without ever leaving shelter.
    safeRadius: 160,         // shielded inside this distance from the lane's centre line
    warnRadius: 135,         // guidance appears past this
    ringSpacing: 260,
    gateSpacing: 450,
    gateRadius: 6,
    gateOffset: 0.4,         // gates sit within this share of the safe radius
    gateRepair: 20,
    coreRepair: 1.5,         // hull per second in the lane's core
    coreRadius: 80,
  },

  run: {
    // Every run is a trip: take off from one settlement's pad, fly the belt, land on
    // another's. About 10.5 km pad to pad is 2 to 3 minutes, depending on boosting.
    distance: 10500,         // metres, pad to pad
    distanceJitter: 1500,    // +/- random spread per run
    takeoffTime: 7,          // seconds on rails before the pilot has the stick
    landingBonus: 1000,      // points for setting down
    hullBonus: 1000,         // up to this many more for hull left
    density: 1,              // rocks on your line, x the belt's pathRocks (a contract's difficulty sets this per trip)
  },
  settlement: {
    // Towns cut into giant asteroids that straddle the lane: a neon canyon you fly through.
    // Rare on purpose: the first comes up a few km in, then roughly every `spacing` metres
    // (at cruise, a couple of minutes apart).
    firstAt: quickTown ? 600 : 3000,   // metres down the lane to the first settlement
    spacing: 11000,          // metres between settlements
    jitter: 2500,            // +/- random spread on that spacing
    canyonWidth: 90,         // wall to wall, metres (restart to rebuild)
    jamBlasters: true,       // no-fire zone: guns lock inside the dock limits (an upgrade can lift this later)
    wallDamage: 5,           // hull lost scraping a canyon wall or a building
  },
  deadZone: {
    // Dead Zones: stretches of an old battlefield where the lane's beacons are dark. Inside one,
    // radiation is off and you can fly anywhere; raiders nest in the wrecks. A trip alternates
    // the lane (rings and radiation) with these self-contained fights. See deadzone/index.js.
    enabled: true,
    firstAt: quickZone ? 1100 : 4200,   // metres down the lane to the first zone's centre
    quickZone,               // ?deadzone: a zone on every trip, even a contract's clear lane
    spacing: 9000,           // then another every this many metres, while the trip is long enough
    minToDest: 2600,         // never closer than this to the destination pad
    radius: 520,             // the wreck field: belt rocks are cleared inside this sphere
    approach: 700,           // metres before the field's edge that the beacons start failing
    exploreTime: 8,          // seconds of eerie quiet after the rules change
    warningTime: 3.2,        // the klaxon before the first wave
    breather: 3,             // seconds between waves
    clearedHold: 4.5,        // the victory beat before the beacons relight
    waveRepair: 12,          // hull patched from salvage after each wave
    clearBonus: 2500,
    flight: { cruiseSpeed: 36, boostSpeed: 85, brakeSpeed: 8, speedResponse: 3.5 },   // replaces the lane's speeds inside
    dustCalm: 0.85,          // how much the speed streaks calm down inside
    wrecks: 11,              // broken hulls (solid)
    machinery: 16,           // drifting engines, turrets and containers (solid)
    scrapClouds: 4,          // clouds of loose plating: rattle the hull, hide you from raider guns
    magCoils: 3,             // derelict mag coils: charge, then a magnetic pulse throws ships away
    arcs: 3,                 // live cables between hulls: arc on and off
    collideSoft: 14,         // bumping a wreck slower than this (m/s into it) only scrapes
    collideDamage: 0.3,      // hull per m/s above that
    collideMax: 14,          // the most one collision can take
    bounce: 0.35,            // share of the impact speed that bounces back
    scrapDamage: 1.2,        // hull per second inside a scrap cloud
    coilDamage: 4,           // a mag pulse close up; raiders caught in it take the same
    arcDamage: 8,
  },
  raiders: {
    // Small readable swarms that burst out of the wrecks. Every attack is telegraphed.
    waves: [
      { groups: [['skirmisher', 3]] },
      { groups: [['skirmisher', 2], ['gunner', 1]] },
      { groups: [['bulwark', 1], ['grappler', 1], ['skirmisher', 1]] },
      { final: true, groups: [['boss', 1]], reinforce: [['skirmisher', 1]] },   // reinforcements at half health
    ],
    maxAttackers: 2,         // raiders allowed to telegraph or fire at the same time
    attackGap: 0.9,          // seconds between one attack starting and the next
    firstAttack: 1.8,        // a new raider waits this long before its first attack
    aggression: 1,           // higher = shorter cooldowns (a contract's difficulty scales it)
    telegraphScale: 1,       // longer telegraphs are fairer
    bossPartScale: 2,      // Carrion's pods and core are this much easier to hit than they look
    offscreenExtra: 0.45,    // extra warning for an attacker outside the view
    aimAssist: 0.08,        // radians: bolts bend onto a raider this close to your line (x2.2 on touch and gamepad)
    hitRadiusScale: 1.7,    // your bolts count a little outside a raider's hull
    boltSpeed: 170, boltDamage: 4,
    lanceSpeed: 290, lanceDamage: 4,
    orbSpeed: 48, orbDamage: 10, orbKnock: 26,
    clawSpeed: 88,
    ramDamage: 7,
    grappleHold: 2.2,        // a tether snaps by itself after this many seconds, whatever you do
    grappleShake: 2.4,       // stick travel that shakes you free
    grappleDrain: 3,         // hull per second while tethered
    grapplePull: 120,        // how hard the tether drags you
    autoRollOrbs: true,      // automatic dodge rolls also dodge heavy orbs (never bolts or claws)
    types: {
      skirmisher: { hp: 2.5, speed: 55, accel: 50, radius: 2.4, range: 130, cooldown: 3.4, telegraph: 0.75, score: 250, knock: 7 },
      gunner: { hp: 4.5, speed: 40, accel: 35, radius: 2.8, range: 190, cooldown: 4.6, telegraph: 1.05, lock: 0.32, score: 400, knock: 3.5 },
      grappler: { hp: 5, speed: 48, accel: 40, radius: 3, range: 105, cooldown: 6.5, telegraph: 1.2, score: 500, knock: 3 },
      bulwark: { hp: 6, shield: 5, shieldRegen: 7, speed: 30, accel: 24, radius: 3.6, range: 170, cooldown: 4.2, telegraph: 1.1, score: 650, knock: 1.2 },
      boss: { hp: 14, pods: 3, speed: 24, accel: 16, radius: 10, range: 230, cooldown: 4.4, telegraph: 1.6, score: 3000, knock: 0.15 },
    },
  },
  wing: {
    clearance: 4.5,         // metres around an escort; avoids wings clipping a rock
    lookAhead: 0.7,         // seconds of velocity to check ahead
    attrition: 0.12,        // chances per second of taking incidental fire while engaged
    coverAttrition: 0.28,   // loyal hands draw more fire when covering a failing pilot
  },
  hull: {
    max: 100,
    rockDamageBase: 8,
    rockDamagePerSize: 5,
    rockDamageMax: 45,       // no single rock takes more than this (giants used to one-shot the hull)
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
