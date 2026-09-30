import * as THREE from 'three/webgpu';
import { createEmitter } from '../../engine/events.js';
import { createInput } from '../../engine/input.js';
import { createPost } from '../../engine/post.js';
import { makeConfig } from './config.js';
import { createShip } from './ship.js';
import { createCameraRig } from './cameraRig.js';
import { createCockpit } from './cockpit.js';
import { createSky } from './sky.js';
import { createPlanets } from './planets.js';
import { createDust } from './dust.js';
import { createDebris } from './debris.js';
import { createTraffic } from './traffic.js';
import { createRocks } from './rocks.js';
import { createShards } from './shards.js';
import { createLane } from './lane.js';
import { createSettlement } from './settlement.js';
import { createBlasters } from './blasters.js';
import { createDroid } from './droid.js';
import { createSfx } from './sfx.js';
import { createHud } from './hud.js';
import musicUrl from './assets/audio/sidewinding.mp3';

// ---------------------------------------------------------------------------
// Belt Run: a self-contained game mode. The cockpit, the belt, the beacon
// lane. A host game creates it, drives it once per frame, listens to its
// events, and disposes of it when the player moves on.
//
//   const run = createBeltRun({ engine, audio, hudParent, overrides });
//   run.on('death', (stats) => ...);          // also: 'gate', 'nearMiss', 'hit', 'rockDestroyed', 'request'
//   run.attract();                             // autopilot, for behind a menu
//   run.start(trip);                          // trip: { origin, dest, distance, density }, or random                               // a fresh flight
//   loop: run.frame(realDt, nowSeconds);       // simulates and renders
//   run.pause(true / false);
//   run.dispose();
//
// 'request' events carry host-level asks from the pilot's controls:
// 'pause', 'mute', 'tuning', 'lockLost' (the mouse was released). The mode
// never touches the host's UI. run.setCapture(bool) lets the host allow or
// release mouse capture (pointer lock) around its menus.
// ---------------------------------------------------------------------------

const MICA = {
  start: ['Beacon bearing locked. Hold this line, or don\'t. I will keep the light on.'],
  idle: [
    'Belt density rising. Fly close, it keeps our wake small.',
    'The ice sings when you pass that near. I like it.',
    'Forty years, and the signal has not drifted once.',
    'Phase drive recharged. It will carry us through anything, briefly.',
    'Roll hard when the ice closes in. The frame can take it.',
    'Something is growing out there. Not rocks.',
  ],
  leftLane: ['Off the lane. Shielding will hold a while. Not forever.', 'Out in the open again. I have the arrows up when you want them.'],
  radHigh: ['Hull is starting to cook. Head for the lane.', 'Shielding is failing. Lane, now.'],
  back: ['Back on the line. Good.', 'Shielded. Breathe.'],
  gate: ['Repair beacon. Fly through them when you can.', 'Patched. Keep them coming.'],
  hullLow: ['Hull critical. Find a repair beacon in the lane.'],
  wrongWay: ['The beacon is the other way. Scenic, though.'],
  restart: ['New flight plotted. The lane is where we left it.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// MICA, as a settlement comes up (% is the town's name)
const TOWN_LINES = [
  '% ahead. A town in the rock. They jam weapons inside the dock limits.',
  'Settlement ahead: %. No-fire zone, so the guns will lock. Take the canyon.',
  '%, dead ahead. Keep it clean in the canyon; they do not forgive scratches.',
];
// MICA, as the trip's destination comes up, and docking control taking over
const ARRIVE_LINES = [
  '% ahead. That is our stop. Line up on the canyon; docking control takes it from the mouth.',
  'There she is: %. Bring us to the canyon mouth and docking control will set us down.',
];
const DOCK_LINES = [
  '% docking control. We have you, pilot. Hands off the stick.',
  'Docking control, %. Guidance locked. The home pad is yours.',
];
const clamp = THREE.MathUtils.clamp;

export function createBeltRun({ engine, audio, hudParent = document.body, overrides } = {}) {
  const config = makeConfig(overrides);
  const events = createEmitter();
  const { renderer } = engine;

  // ---- Scene ----------------------------------------------------------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050a16, config.world.fogNear, config.world.fogFar);
  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.03, 1500);
  const untrack = engine.trackCamera(camera);

  const sunDir = new THREE.Vector3(0.55, 0.38, -0.74).normalize();
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0x324a70, 0x07090f, 0.55));

  const input = createInput(engine.canvas, config.input);
  const ship = createShip(config);
  scene.add(ship.group);
  const rig = createCameraRig(camera, ship, config);
  const cockpit = createCockpit();
  ship.group.add(cockpit.group);

  const sky = createSky(sunDir);
  const planets = createPlanets(sunDir);
  const dust = createDust(config);
  const debris = createDebris(config);
  const traffic = createTraffic(config);
  const rocks = createRocks(config);
  const shards = createShards();
  const lane = createLane(config);
  const settlement = createSettlement(config);
  const blasters = createBlasters(config);
  const pip = createDroid(config);
  scene.add(sky.mesh, planets.group, dust.mesh, debris.group, traffic.group, rocks.mesh, shards.mesh, lane.group, blasters.group, settlement.group);
  // A settlement clears its own airspace: no belt rocks or repair gates inside, and bolts stop at its rock
  rocks.setExclusion((p, r) => settlement.clears(p, r));
  lane.handlers.blocked = (p) => settlement.blocksGate(p);
  blasters.handlers.blocked = (p) => settlement.solid(p);
  traffic.handlers.blocked = (p) => settlement.clears(p, 10);
  ship.group.add(blasters.muzzleGroup, pip.group);

  // Keep the lane's sunward side lit: the light follows the ship
  const sunFollow = () => { sun.position.copy(ship.pos).addScaledVector(sunDir, 100); sun.target.position.copy(ship.pos); };

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.7, 64),
    new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.5, 1.4, 1.3), transparent: true, opacity: 0.55, depthTest: false, fog: false }),
  );
  reticle.position.set(0, 0, -40);
  reticle.renderOrder = 20;
  ship.group.add(reticle);

  const post = createPost(renderer, scene, camera, config.fx);
  const sfx = createSfx(audio, config);
  const hud = createHud(hudParent);

  // ---- State ----------------------------------------------------------
  const fresh = (mode) => ({
    mode,                     // 'attract' | 'flying' | 'dead'
    paused: false,
    score: 0, chain: 0, chainTimer: 0,
    nearMisses: 0, hits: 0, bestChain: 0, gates: 0, rolls: 0, rocksDestroyed: 0, pipRescues: 0,
    hull: config.hull.max, exposure: 0, deathCause: '', flightTime: 0, tripTime: 0,
    wasOutside: false, alarmTimer: 0, micaCooldown: 0, micaTimer: 18, micaIdle: 0, wrongWayTime: 0,
    radFx: 0,
    phaseTime: 0, phaseCooldown: 0,
    missionComplete: false, giantWarned: false, autoRollWait: 0,
    settlements: 0, inSettlement: false, jamWarned: false, jamClick: 0, wallCooldown: 0, townAnnounced: -1,
    hitStop: 0, slowmo: 0, slowmoScale: 1, timeScale: 1,
    aberrationKick: 0, hitFlash: 0, phaseFx: 0, fade: 0,
  });
  let g = fresh('attract');

  const say = (key, force = false) => {
    if (g.mode !== 'flying' || (!force && g.micaCooldown > 0)) return;
    hud.say('MICA', pick(MICA[key]), 5);
    g.micaCooldown = 6;
    g.micaTimer = Math.max(g.micaTimer, 18);
  };

  const stats = () => ({
    score: g.score, distance: ship.distance, laneProgress: ship.laneProgress, time: g.tripTime,
    hull: Math.round((g.hull / config.hull.max) * 100),
    nearMisses: g.nearMisses, bestChain: g.bestChain, gates: g.gates, hits: g.hits, rolls: g.rolls,
    rocksDestroyed: g.rocksDestroyed, shots: blasters.state.shots, shotsHit: blasters.state.hits, pipRescues: g.pipRescues, settlements: g.settlements,
    cause: g.deathCause, laneOffset: Math.max(0, Math.hypot(ship.pos.x, ship.pos.y) - config.lane.safeRadius),
  });

  function damage(amount, cause) {
    const before = g.hull;
    g.hull = Math.max(0, g.hull - amount);
    if (before >= 30 && g.hull < 30 && g.hull > 0) say('hullLow', true);
    if (g.hull <= 0 && g.mode === 'flying') die(cause);
  }

  function die(cause) {
    g.mode = 'dead';
    g.deathCause = cause;
    rig.addTrauma(cause === 'rock' ? 1 : 0.6);
    g.hitFlash = cause === 'rock' ? 1.2 : 0.6;
    g.hitStop = 0.12;
    sfx.death();
    // A rock breach throws a spray of hull fragments that travel with the ship,
    // so they tumble away from the canopy instead of filling the view. A
    // radiation death has no debris: the systems just fail and the view fades.
    if (cause === 'rock') {
      shards.burst(ship.pos.clone().addScaledVector(ship.fwd, 8), ship.vel, 0.8, 24);
    }
    hud.setWarning('');
    events.emit('death', stats());
  }

  // ---- Feel rules -----------------------------------------------------
  rocks.handlers.onApproach = (r, miss, pan) => {
    if (g.mode !== 'flying') return;
    sfx.whoosh(pan, clamp(1 - miss / (config.nearMiss.radius * 1.6), 0, 1), config.nearMiss.whooshLead);
  };

  rocks.handlers.onHit = (r) => {
    if (g.mode !== 'flying') return 'destroy';      // behind a menu or after death: rocks just vanish
    // A rock you phased into stays harmless until you are out the other side, even if the
    // phase ends first (in slow motion you cross a big rock more slowly than the phase lasts)
    if (g.phaseTime > 0 || r.phased) {
      if (!r.phased) {
        r.phased = true;
        g.score += 300;
        hud.callout('Phased through +300', 1, true);
        rig.addTrauma(0.25);
        g.aberrationKick += 1.2;
        sfx.tick(6);
      }
      return;
    }
    g.hits++;
    g.chain = 0; g.chainTimer = 0;
    rig.addTrauma(0.9);
    rig.punch(-6);
    g.hitFlash = 1;
    g.aberrationKick += 1.6;
    g.hitStop = 0.09;
    sfx.hit();
    const toRock = r.pos.clone().sub(ship.pos).normalize();
    shards.burst(ship.pos.clone().addScaledVector(toRock, 3), r.vel, r.size);
    hud.callout('Hull hit', 1);
    damage(Math.min(config.hull.rockDamageMax ?? Infinity, config.hull.rockDamageBase + r.size * config.hull.rockDamagePerSize), 'rock');
    events.emit('hit', { hull: g.hull });
    return 'destroy';
  };

  rocks.handlers.onNearMiss = (r, clearance, side) => {
    if (g.mode !== 'flying') return;
    const nm = config.nearMiss;
    const intensity = 1 - clearance / nm.radius;
    g.chain = g.chainTimer > 0 ? g.chain + 1 : 1;
    g.chainTimer = nm.chainWindow;
    g.nearMisses++;
    g.bestChain = Math.max(g.bestChain, g.chain);
    const pts = nm.score * g.chain;
    g.score += pts;

    rig.addTrauma(0.12 + intensity * 0.28);
    rig.punch(1.5 + intensity * 3);
    g.aberrationKick += 0.35 + intensity * 0.9;
    g.hitStop = Math.max(g.hitStop, nm.hitStop * intensity);
    g.slowmo = Math.max(g.slowmo, nm.slowmo * intensity);
    g.slowmoScale = nm.slowmoScale;
    sfx.tick(g.chain);
    hud.callout(`Near miss +${pts}`, side, intensity > 0.75);

    if (g.chain % nm.daredevilChain === 0) {
      g.score += nm.daredevilBonus;
      g.slowmo = Math.max(g.slowmo, nm.daredevilSlowmo);
      g.slowmoScale = nm.slowmoScale * 0.7;
      rig.punch(6);
      sfx.daredevil();
      cockpit.flashChain();
      hud.callout(`Daredevil +${nm.daredevilBonus}`, -side, true);
    }
    events.emit('nearMiss', { chain: g.chain, score: g.score });
  };

  lane.handlers.onGate = (i) => {
    if (g.mode !== 'flying') return;
    const before = g.hull;
    g.hull = Math.min(config.hull.max, g.hull + config.lane.gateRepair);
    g.gates++;
    g.score += 150;
    sfx.repair();
    rig.punch(3);
    hud.callout(`Repaired +${Math.round(g.hull - before)}`, 1, true);
    if (g.gates === 1 || Math.random() < 0.3) say('gate');
    events.emit('gate', { index: i, hull: g.hull });
  };

  // ---- Blasters --------------------------------------------------------
  blasters.handlers.onFire = (barrel) => {
    sfx.laser(barrel);
    rig.punch(-0.12);
    g.aberrationKick += 0.02;
  };
  traffic.handlers.onPass = (side, distance) => {
    sfx.flyby(side, distance);
    rig.addTrauma(0.06);
    hud.callout('Traffic passing', side);
  };
  blasters.handlers.onImpact = (hit, destroyed) => {
    hud.hitConfirm(!!destroyed);
    if (destroyed) {
      g.rocksDestroyed++;
      const pts = Math.round(10 * destroyed.size) * 5;
      if (g.mode === 'flying') g.score += pts;
      shards.burst(destroyed.pos, destroyed.vel, destroyed.size * 0.75, Math.min(64, Math.round(18 + destroyed.size * 10)));
      sfx.rockBreak(destroyed.size);
      const d = destroyed.pos.distanceTo(ship.pos);
      if (d < 60) rig.addTrauma(0.25 * (1 - d / 60) * Math.min(1, destroyed.size / 2));
      events.emit('rockDestroyed', { size: destroyed.size, score: g.score });
    } else if (hit.rock.giant) {
      // Giants cannot be broken: a dull clank, no chips, and a word the first time
      sfx.impact(true);
      if (!g.giantWarned && g.mode === 'flying') { g.giantWarned = true; hud.callout('Too big to break', 1); }
    } else {
      shards.chip(hit.point, hit.normal, hit.rock.vel, hit.rock.size);
      sfx.impact();
    }
  };
  blasters.handlers.onOverheat = () => {
    sfx.overheat();
    hud.callout('Guns overheated', 1);
  };

  // ---- PIP ------------------------------------------------------------
  pip.handlers.onSay = (text) => { hud.say('PIP', text, 4.5); g.micaCooldown = 6; };
  pip.handlers.onChirp = (mood) => sfx.chirp(mood);

  function callPip() {
    if (g.mode !== 'flying') return;
    const wasDriving = pip.driving;
    pip.request();
    if (!wasDriving && pip.driving) g.pipRescues++;
  }

  function tryPhase() {
    if (g.phaseCooldown > 0 || g.mode !== 'flying') return;
    g.phaseTime = config.phase.duration;
    g.phaseCooldown = config.phase.cooldown + config.phase.duration;
    rig.punch(config.phase.fovKick);
    g.aberrationKick += 0.8;
    sfx.phase(config.phase.duration);
  }

  function tryRoll(dir) {
    if (g.mode !== 'flying' || !ship.tryRoll(dir)) return false;
    g.rolls++;
    sfx.roll(dir, config.roll.duration);
    rig.addTrauma(0.12);
    g.aberrationKick += 0.25;
    return true;
  }

  const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
  tap(hud.buttons.phase, tryPhase);
  tap(hud.buttons.rollLeft, () => tryRoll(-1));
  tap(hud.buttons.rollRight, () => tryRoll(1));
  tap(hud.buttons.pip, callPip);
  tap(hud.buttons.pause, () => events.emit('request', 'pause'));
  // Fire holds while the thumb stays down, even if it drifts off the button
  hud.buttons.fire.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); hud.buttons.fire.setPointerCapture(e.pointerId); input.setTouchFire(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) hud.buttons.fire.addEventListener(ev, () => input.setTouchFire(false));
  // Boost and brake: latching taps by default (config.input.touchThrottleLatch), so the right
  // thumb never has to hold one while it is holding Fire. Held buttons when the latch is off.
  let latchBoost = false, latchBrake = false;
  function setThrottle(boost, brake) {
    latchBoost = boost;
    latchBrake = brake;
    input.setTouchBoost(boost);
    input.setTouchBrake(brake);
    hud.setThrottle(boost, brake);
  }
  for (const [button, which] of [[hud.buttons.boost, 'boost'], [hud.buttons.brake, 'brake']]) {
    button.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (config.input.touchThrottleLatch) {
        if (which === 'boost') setThrottle(!latchBoost, false); else setThrottle(false, !latchBrake);
      } else {
        button.setPointerCapture(e.pointerId);
        setThrottle(which === 'boost', which === 'brake');
      }
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(ev, () => { if (!config.input.touchThrottleLatch) setThrottle(false, false); });
    }
  }

  // ---- Take-off and landing ------------------------------------------
  // Every run is a trip from one settlement's home pad to another's. Both ends fly the
  // ship on rails (modes 'takeoff', 'landing', then 'landed'); the pilot flies between.
  const seq = {
    t: 0, side: 1, T1: 0, T2: 0, vG: 60, lift: 0, cue: false, touched: false,
    P0: new THREE.Vector3(), V0: new THREE.Vector3(), Q0: new THREE.Quaternion(), level: new THREE.Quaternion(),
    G: new THREE.Vector3(), H: new THREE.Vector3(), R: new THREE.Vector3(), D: new THREE.Vector3(), U: new THREE.Vector3(),
  };
  const sPos = new THREE.Vector3(), sVel = new THREE.Vector3(), sDir = new THREE.Vector3();
  const sM0 = new THREE.Vector3(), sM1 = new THREE.Vector3(), ZERO = new THREE.Vector3();
  const sQ = new THREE.Quaternion(), sQ2 = new THREE.Quaternion(), sMat = new THREE.Matrix4();
  const onRails = () => g.mode === 'takeoff' || g.mode === 'landing' || g.mode === 'landed';
  const smooth01 = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  // Cubic Hermite: from p0 (tangent m0) to p1 (tangent m1); tangents are velocity × duration
  function hermite(out, p0, m0, p1, m1, s) {
    const s2 = s * s, s3 = s2 * s;
    return out.copy(p0).multiplyScalar(2 * s3 - 3 * s2 + 1).addScaledVector(m0, s3 - 2 * s2 + s)
      .addScaledVector(p1, -2 * s3 + 3 * s2).addScaledVector(m1, s3 - s2);
  }
  function lookAlong(out, dir, up) {
    if (dir.lengthSq() < 1e-8) return out;
    sMat.lookAt(ZERO, dir, up);
    return out.setFromRotationMatrix(sMat);
  }
  function placeShip(pos, quat, dt) {
    sVel.copy(pos).sub(ship.pos).divideScalar(Math.max(dt, 1e-4));
    ship.setPose(pos, quat, sVel, dt);
  }
  // A trip: from the host's contract (origin, dest, distance), or a random one without
  function newRoute(trip) {
    const R = config.run, names = settlement.names;
    const distance = trip?.distance ?? Math.max(1500, R.distance + (Math.random() * 2 - 1) * R.distanceJitter);
    let originName = trip?.origin, destName = trip?.dest;
    if (!originName || !destName) {
      const a = Math.floor(Math.random() * names.length);
      let b = Math.floor(Math.random() * (names.length - 1));
      if (b >= a) b++;
      originName = names[a];
      destName = names[b];
    }
    return {
      originZ: -settlement.HOME_Z,                 // puts the take-off pad at z = 0
      destZ: -distance - settlement.HOME_Z,        // and the landing pad `distance` down the lane
      originName, destName, tilt: (Math.random() - 0.5) * 1.6,
    };
  }

  function beginTakeoff() {
    g.mode = 'takeoff';
    seq.t = 0;
    seq.cue = false;
    settlement.padPose(seq.P0, seq.Q0, 1);
    settlement.townUp(seq.U);
    seq.D.set(0, 0, -1).applyQuaternion(seq.Q0);
    seq.lift = clamp(-settlement.padRestY, 20, 80);   // up to the lane's centre line
    ship.setPose(seq.P0, seq.Q0, ZERO, 0);
    g.inSettlement = true;
    hud.showZone(settlement.name, 'Departure \u00b7 clamps on', 4);
  }
  // Spool on the clamps, lift off the pad, then accelerate down the canyon to cruise
  function runTakeoff(dt) {
    const T = config.run.takeoffTime;
    seq.t += dt;
    const t = seq.t, accelTime = 3.6, a = config.flight.cruiseSpeed / accelTime;
    const tau = Math.max(0, t - (T - accelTime));
    sPos.copy(seq.P0).addScaledVector(seq.U, seq.lift * smooth01((t - 1.4) / 2.4)).addScaledVector(seq.D, 0.5 * a * tau * tau);
    if (t < 1.4) sPos.addScaledVector(seq.U, Math.sin(t * 60) * 0.04 * t);   // straining at the clamps
    placeShip(sPos, seq.Q0, dt);
    if (!seq.cue && t > 1.4) { seq.cue = true; hud.callout('Clamps released', 1); sfx.impact(false); rig.addTrauma(0.15); }
    if (t >= T) {
      g.mode = 'flying';
      hud.callout('You have the stick', 1, true);
    }
  }

  function beginLanding(side) {
    g.mode = 'landing';
    seq.t = 0;
    seq.side = side;
    seq.touched = false;
    setThrottle(false, false);
    pip.reset();
    seq.P0.copy(ship.pos);
    seq.V0.copy(ship.vel);
    seq.Q0.copy(ship.quat);
    settlement.townUp(seq.U);
    settlement.padPose(seq.R, seq.level, side);                 // sat on the pad, facing along the approach
    seq.D.set(0, 0, -1).applyQuaternion(seq.level);
    settlement.toWorld(seq.G.set(0, 0, side * (settlement.MOUTH + 80)));   // on the canyon line, clear of the rock
    seq.H.copy(seq.R).addScaledVector(seq.U, 12);              // hover over the pad
    const distB = seq.G.distanceTo(seq.H);
    seq.vG = clamp(distB / 3, 45, 100);
    seq.T2 = (2 * distB) / seq.vG;
    seq.T1 = clamp((2 * seq.P0.distanceTo(seq.G)) / (seq.V0.length() + seq.vG), 2, 9);
    hud.showZone(settlement.name, 'Docking control has you', 5);
    hud.say('Dock', pick(DOCK_LINES).replace('%', settlement.name), 5);
    g.micaCooldown = 8;
  }
  // Curve onto the canyon line, slow through the town, hover over the pad, set down
  function runLanding(dt) {
    seq.t += dt;
    const t = seq.t, T1 = seq.T1, T2 = seq.T2, T3 = 2.8;
    if (t < T1) {
      hermite(sPos, seq.P0, sM0.copy(seq.V0).multiplyScalar(T1), seq.G, sM1.copy(seq.D).multiplyScalar(seq.vG * T1), t / T1);
      lookAlong(sQ2, sDir.copy(sPos).sub(ship.pos), seq.U);
      sQ.slerpQuaternions(seq.Q0, sQ2, smooth01(t / 0.8));
    } else if (t < T1 + T2) {
      const s = (t - T1) / T2;
      hermite(sPos, seq.G, sM0.copy(seq.D).multiplyScalar(seq.vG * T2), seq.H, ZERO, s);
      lookAlong(sQ2, sDir.copy(sPos).sub(ship.pos), seq.U);
      sQ.copy(sQ2).slerp(seq.level, smooth01(s * 1.3));
    } else if (t < T1 + T2 + T3) {
      sPos.lerpVectors(seq.H, seq.R, smooth01((t - T1 - T2) / T3));
      sQ.copy(seq.level);
    } else {
      sPos.copy(seq.R);
      sQ.copy(seq.level);
      if (!seq.touched) {
        seq.touched = true;
        sfx.impact(false);
        rig.addTrauma(0.3);
        hud.callout('Touchdown', 1, true);
      }
    }
    placeShip(sPos, sQ, dt);
    if (seq.touched && g.mode === 'landing' && t > T1 + T2 + T3 + 1.4) finishLanding();
  }
  function finishLanding() {
    g.mode = 'landed';
    const landingBonus = config.run.landingBonus;
    const hullBonus = Math.round((g.hull / config.hull.max) * config.run.hullBonus);
    g.score += landingBonus + hullBonus;
    hud.callout(`Landed +${(landingBonus + hullBonus).toLocaleString()}`, -1, true);
    events.emit('landed', { ...stats(), landed: true, destination: settlement.name, landingBonus, hullBonus });
  }

  // ---- Lifecycle ------------------------------------------------------
  function resetWorld(mode, trip) {
    g = fresh(mode);
    setThrottle(false, false);
    ship.reset();
    rig.reset();
    shards.clear();
    blasters.reset();
    pip.reset();
    config.run.density = trip?.density ?? 1;       // a contract's difficulty: rocks on your line
    settlement.setRoute(mode === 'flying' ? newRoute(trip) : null);
    settlement.reset(ship);
    if (mode === 'flying') beginTakeoff();
    rocks.init(ship);
    debris.reset(ship);
    traffic.reset(ship);
    lane.reset();
  }

  const attractStick = { stickX: 0, stickY: 0, roll: 0, boost: false, brake: false };
  const autoTarget = new THREE.Vector3();
  const autoInv = new THREE.Quaternion();
  const deadStick = { stickX: 0.08, stickY: -0.1, roll: 0.3, boost: false, brake: true };
  const guideV = new THREE.Vector3();
  const dockV = new THREE.Vector3();
  const trafficV = new THREE.Vector3();
  const laneFwd = new THREE.Vector3(0, 0, -1);
  let lastDevice = '';

  function frame(realDt, now) {
    input.update(realDt);
    const modeAtInput = g.mode;
    if (input.state.device !== lastDevice) { lastDevice = input.state.device; events.emit('device', lastDevice); }
    for (const a of ['pause', 'escape', 'mute', 'tuning', 'lockLost']) if (input.consume(a)) events.emit('request', a);
    if (input.consume('confirm')) events.emit('request', 'confirm');
    if (g.paused) { input.clearActions(); post.render(); return; }
    if (input.consume('phase') && modeAtInput === 'flying') tryPhase();
    if (input.consume('rollLeft') && !config.roll.auto) tryRoll(-1);
    if (input.consume('rollRight') && !config.roll.auto) tryRoll(1);
    if (input.consume('droid')) callPip();

    // Time: hit-stop freezes the world, slow-mo eases back
    if (g.hitStop > 0) { g.hitStop -= realDt; g.timeScale = 0.02; }
    else if (g.slowmo > 0) { g.slowmo -= realDt; g.timeScale = g.slowmoScale; }
    else g.timeScale += (1 - g.timeScale) * (1 - Math.exp(-8 * realDt));
    const dt = realDt * g.timeScale;

    let steer = input.state;
    if (g.mode === 'attract') {
      // Autopilot: a lazy weave, steering for a point on the lane ahead
      autoTarget.set(0, 0, ship.pos.z - 300).sub(ship.pos).applyQuaternion(autoInv.copy(ship.quat).invert());
      attractStick.stickX = clamp(autoTarget.x / 120, -0.5, 0.5) + Math.sin(now * 0.31) * 0.3;
      attractStick.stickY = clamp(autoTarget.y / 120, -0.5, 0.5) + Math.sin(now * 0.47) * 0.2;
      steer = attractStick;
    } else if (g.mode === 'dead') steer = deadStick;
    else if (pip.driving) steer = pip.stick;

    if (g.mode === 'takeoff') runTakeoff(dt);
    else if (g.mode === 'landing' || g.mode === 'landed') runLanding(dt);
    else ship.update(realDt, dt, steer);


    // Settlements: the canyon is solid rock, and inside the dock limits the guns are jammed
    settlement.update(ship, now);
    const contact = onRails() ? null : settlement.collide(ship);
    g.wallCooldown = Math.max(0, g.wallCooldown - realDt);
    if (contact && g.mode === 'flying' && g.wallCooldown <= 0) {
      g.wallCooldown = 0.6;
      g.chain = 0; g.chainTimer = 0;
      rig.addTrauma(0.55);
      rig.punch(-3);
      g.hitFlash = Math.max(g.hitFlash, 0.6);
      sfx.scrape();
      hud.callout('Scraped the wall', contact.side);
      damage(config.settlement.wallDamage, 'wall');
    }
    const inTown = settlement.inZone(ship.pos);
    const jammed = inTown && config.settlement.jamBlasters;
    blasters.update(realDt, dt, ship, g.mode === 'flying' && input.state.fire && !jammed, rocks);
    if (g.mode === 'flying') {
      if (inTown !== g.inSettlement) {
        g.inSettlement = inTown;
        if (inTown) {
          g.settlements++;
          g.jamWarned = false;
          hud.showZone(settlement.name, config.settlement.jamBlasters ? 'No-fire zone \u00b7 blasters jammed' : 'No-fire zone', 5);
          sfx.chime();
          events.emit('settlement', { name: settlement.name, inside: true });
        } else {
          if (config.settlement.jamBlasters) { hud.say('MICA', 'Clear of the dock limits. The guns are yours again.', 4); g.micaCooldown = 6; }
          events.emit('settlement', { name: settlement.name, inside: false });
        }
      }
      if (jammed && input.state.fire) {
        if ((g.jamClick -= realDt) <= 0) {
          sfx.jammed();
          g.jamClick = 0.32;
          if (!g.jamWarned) { g.jamWarned = true; hud.callout('Blasters jammed', 1); }
        }
      } else g.jamClick = 0;
      // Docking control takes over in front of the destination's canyon
      const dockSide = settlement.captureSide(ship);
      if (dockSide) beginLanding(dockSide);
      const ahead = settlement.distanceAhead(ship);
      if (ahead > 0 && ahead < 1600 && g.townAnnounced !== settlement.index) {
        g.townAnnounced = settlement.index;
        hud.say('MICA', pick(settlement.hasRoute() && settlement.index === 1 ? ARRIVE_LINES : TOWN_LINES).replace('%', settlement.name), 6);
        g.micaCooldown = 6;
        g.micaTimer = Math.max(g.micaTimer, 18);
      }
    }
    rocks.update(realDt, dt, ship);
    debris.update(dt, ship);
    traffic.update(dt, ship, g.mode === 'flying');
    shards.update(dt);
    lane.update(ship, now);
    sunFollow();
    if (g.mode === 'flying') g.flightTime += dt;
    if (g.mode === 'flying' || g.mode === 'takeoff' || g.mode === 'landing') g.tripTime += dt;

    // ---- The beacon lane: radiation outside, repair near the centre ----
    const L = config.lane, R = config.radiation;
    const laneDist = Math.hypot(ship.pos.x, ship.pos.y);
    const outside = laneDist - L.safeRadius;
    pip.update(realDt, ship, laneDist, g.mode === 'flying', input.state);

    // Dodging: on a predicted hit the ship barrel-rolls away by itself (config.roll.auto), as long
    // as it has a roll charge. PIP, when it is flying, phases through first if the drive is ready.
    g.autoRollWait = Math.max(0, g.autoRollWait - realDt);
    if (g.mode === 'flying' && g.phaseTime <= 0 && g.autoRollWait <= 0 && (pip.driving || config.roll.auto)) {
      const threat = rocks.predictHit(ship, pip.driving ? 0.35 : config.roll.autoLookahead);
      if (threat) {
        if (pip.driving && g.phaseCooldown <= 0) { tryPhase(); sfx.chirp('drive'); }
        else if (tryRoll(threat.side > 0 ? -1 : 1)) g.autoRollWait = config.roll.duration + 0.1;   // one roll per threat
      }
    }
    g.micaCooldown = Math.max(0, g.micaCooldown - realDt);
    if (g.mode === 'flying') {
      if (outside > 0) {
        const before = g.exposure;
        g.exposure = Math.min(100, g.exposure + R.riseRate * (0.3 + outside / 30) * dt);
        if (!g.wasOutside) { say('leftLane'); g.alarmTimer = 0; }
        if (before < R.damageFrom && g.exposure >= R.damageFrom) say('radHigh', true);
      } else {
        g.exposure = Math.max(0, g.exposure - R.fallRate * dt);
        if (g.wasOutside && g.exposure > 25) say('back');
        if (laneDist < L.coreRadius && g.exposure === 0) g.hull = Math.min(config.hull.max, g.hull + L.coreRepair * dt);
      }
      g.wasOutside = outside > 0;
      if (g.exposure > R.damageFrom) damage(R.hullDamage * ((g.exposure - R.damageFrom) / (100 - R.damageFrom)) * dt, 'radiation');

      // Alarms: a slow chirp while exposure is harmless, faster once it bites
      g.alarmTimer -= realDt;
      const hurting = g.exposure > R.damageFrom;
      if (g.alarmTimer <= 0 && ((outside > 0 && g.exposure > R.damageFrom * 0.5) || g.hull < 25)) {
        sfx.alarm(hurting || g.hull < 25);
        g.alarmTimer = hurting ? THREE.MathUtils.lerp(0.9, 0.3, (g.exposure - R.damageFrom) / (100 - R.damageFrom)) : 2.2;
      }
      sfx.geiger(outside > 0 ? Math.min(1, 0.08 + g.exposure / 110) : (g.exposure / 100) * 0.3, realDt);

      if (hurting) hud.setWarning('Hull burning. Return to the lane', 2);
      else if (outside > 0 && g.exposure > R.damageFrom * 0.5) hud.setWarning('Radiation rising', 1);
      else if (g.hull < 25) hud.setWarning('Hull critical', 2);
      else hud.setWarning('');

      // Heading away from the beacon for a while gets a dry word from MICA
      const along = ship.vel.dot(laneFwd) / Math.max(1, ship.vel.length());
      g.wrongWayTime = along < -0.5 ? g.wrongWayTime + realDt : 0;
      if (g.wrongWayTime > 5) { say('wrongWay'); g.wrongWayTime = -20; }
    }
    g.radFx += ((outside > 0 ? 0.15 : 0) + (g.exposure / 100) * 0.85 - g.radFx) * (1 - Math.exp(-3 * realDt));
    dust.setRadiation(Math.min(1, g.radFx));

    // Phase drive
    g.phaseTime = Math.max(0, g.phaseTime - realDt);
    g.phaseCooldown = Math.max(0, g.phaseCooldown - realDt);
    const phasing = g.phaseTime > 0;
    g.phaseFx += ((phasing ? 1 : 0) - g.phaseFx) * (1 - Math.exp(-(phasing ? 30 : 6) * realDt));
    cockpit.setPhase(1 - g.phaseCooldown / (config.phase.cooldown + config.phase.duration), phasing);

    if (g.chainTimer > 0 && (g.chainTimer -= realDt) <= 0) g.chain = 0;
    cockpit.setChain(Math.min(3, g.chain % config.nearMiss.daredevilChain || (g.chain ? 3 : 0)));

    rig.update(realDt, g.phaseFx * config.phase.fovKick * 0.5);
    sky.update(ship);
    planets.update(ship);
    dust.update(ship);
    reticle.material.opacity = g.mode === 'flying' ? 0.55 * (1 - g.phaseFx * 0.7) : 0;

    if (g.mode === 'dead') g.fade = Math.min(0.88, g.fade + realDt / 1.6);
    g.aberrationKick *= Math.exp(-5 * realDt);
    g.hitFlash *= Math.exp(-4 * realDt);
    post.sync();
    post.uniforms.aberration.value = config.fx.aberration + g.aberrationKick + g.phaseFx * 0.6;
    post.uniforms.phase.value = g.phaseFx;
    post.uniforms.hit.value = g.hitFlash;
    post.uniforms.radiation.value = Math.min(1, g.radFx);
    post.uniforms.fade.value = g.fade;
    renderer.toneMappingExposure = config.fx.exposure;

    if (g.mode === 'flying' || g.mode === 'takeoff' || g.mode === 'landing') sfx.update(ship.speed, ship.yawRate / config.flight.yawRate);
    else sfx.silence();
    sfx.ambience(g.mode === 'flying' || onRails() ? settlement.proximity(ship.pos) : 0);
    audio.update();

    // MICA, occasionally, when nothing else is going on
    if (g.mode === 'flying' && outside <= 0 && (g.micaTimer -= realDt) <= 0) {
      hud.say('MICA', MICA.idle[g.micaIdle++ % MICA.idle.length], 5);
      g.micaTimer = 24 + Math.random() * 14;
    }

    // ---- HUD ----
    ship.group.updateMatrixWorld(true);
    const showGuide = g.mode === 'flying' && laneDist > L.warnRadius;
    if (showGuide) {
      // Aim at the nearest point on the lane's edge, a little ahead
      const k = config.lane.safeRadius * 0.7 / Math.max(1, laneDist);
      guideV.set(ship.pos.x * k, ship.pos.y * k, ship.pos.z - 120).project(camera);
      const behind = guideV.z > 1;
      let nx = behind ? -guideV.x : guideV.x, ny = behind ? -guideV.y : guideV.y;
      const w = innerWidth, h = innerHeight;
      const onScreen = !behind && Math.abs(nx) < 0.82 && Math.abs(ny) < 0.78;
      if (!onScreen) {
        if (behind && Math.hypot(nx, ny) < 0.05) ny = -1;       // dead astern: point down, "come about"
        const a = Math.atan2(ny * h, nx * w);
        nx = Math.cos(a) * 0.8; ny = Math.sin(a) * 0.72;
      }
      const px = (nx + 1) * 0.5 * w, py = (1 - ny) * 0.5 * h;
      hud.setGuide({
        show: true, x: px, y: py, onScreen,
        angle: Math.atan2(py - h / 2, px - w / 2),
        danger: g.exposure > R.damageFrom * 0.5,
        label: outside > 0 ? `${Math.ceil(outside)} m to the lane` : 'Lane edge',
      });
    } else hud.setGuide({ show: false });

    // A marker on the settlement's canyon mouth as you come in, until you are inside
    const mouth = settlement.mouth(ship, dockV);
    let dockShown = false;
    if (g.mode === 'flying' && mouth.distance < 1800 && !mouth.inside) {
      dockV.project(camera);
      if (dockV.z < 1 && Math.abs(dockV.x) < 1.1 && Math.abs(dockV.y) < 1.1) {
        hud.setDock({ show: true, x: (dockV.x + 1) * 0.5 * innerWidth, y: (1 - dockV.y) * 0.5 * innerHeight, label: `${settlement.name} \u00b7 ${Math.round(mouth.distance)} m` });
        dockShown = true;
      }
    }
    if (!dockShown) hud.setDock({ show: false });

    // The trip, under the score
    let routeText = '';
    if (settlement.hasRoute()) {
      if (g.mode === 'takeoff') routeText = `Departing ${settlement.name}`;
      else if (g.mode === 'landing' || g.mode === 'landed') routeText = `Docking at ${settlement.name}`;
      else if (g.mode === 'flying') routeText = `To ${settlement.destName()} \u00b7 ${(settlement.routeRemaining(ship) / 1000).toFixed(1)} km`;
    }
    hud.setRoute(routeText);

    let trafficShown = false, trafficDistance = 300;
    if (g.mode === 'flying') for (const courier of traffic.ships) {
      if (!courier.active) continue;
      const d = courier.craft.position.distanceTo(ship.pos);
      if (d < 35 || d >= trafficDistance) continue;
      trafficV.copy(courier.craft.position).project(camera);
      if (trafficV.z < -1 || trafficV.z > 1 || Math.abs(trafficV.x) > 0.92 || Math.abs(trafficV.y) > 0.82) continue;
      hud.setTraffic({ show: true, x: (trafficV.x + 1) * 0.5 * innerWidth, y: (1 - trafficV.y) * 0.5 * innerHeight });
      trafficDistance = d;
      trafficShown = true;
    }
    if (!trafficShown) hud.setTraffic({ show: false });

    hud.setHull(g.hull / config.hull.max);
    hud.setRadiation(g.exposure / 100);
    hud.setRolls(ship.rollCharges, config.roll.charges, !config.roll.auto);
    hud.setStick(g.mode === 'flying' && input.state.device === 'touch' ? input.state.touchStick : null);
    hud.setMouseStick(g.mode === 'flying' && !pip.driving ? input.state.mouseStick : null);
    hud.setHeat(blasters.state.heat / 100, blasters.state.overheated, jammed && g.mode === 'flying');
    const touch = input.state.device === 'touch';
    hud.setPip(
      g.mode !== 'flying' || pip.state === 'hidden' ? null
        : pip.driving ? (touch ? 'PIP is flying. Tap PIP or steer to take over' : 'PIP is flying. R or a hard push on the stick to take over')
        : (touch ? 'Tap PIP to fly back to the lane' : 'PIP: fly back to the lane'),
      pip.driving ? 'driving' : 'offer',
    );
    const wantsCapture = g.mode === 'flying' && !input.state.locked && input.state.device === 'keyboard' && config.input.steering === 'auto';
    let tutorial = '';
    if (!wantsCapture && g.mode === 'flying') {
      if (g.flightTime < 6) tutorial = touch ? 'Drag on the left to steer. Hold FIRE to shoot.' : input.state.device === 'gamepad' ? 'Left stick steers. Right trigger fires.' : 'Steer with the mouse or WASD. Hold click or F to fire.';
      else if (g.flightTime < 12) tutorial = touch ? 'Hold BOOST for speed; use PHASE to pass through rocks.' : input.state.device === 'gamepad' ? 'A phases through rocks. B or X boosts; left trigger brakes.' : 'Space phases through danger. Shift boosts; X brakes.';
      else if (g.flightTime < 18) tutorial = config.roll.auto ? 'Your ship rolls clear of rocks by itself. Close calls still score.' : touch ? 'Tap ↶ or ↷ to dodge sideways.' : input.state.device === 'gamepad' ? 'Hold bumpers to roll; double-tap to dodge.' : 'Double-tap Q or E for a barrel roll.';
    }
    hud.setHint(wantsCapture ? 'Click the view to take the controls. Esc releases the mouse.' : tutorial);

    const missionProgress = { distance: Math.max(0, ship.laneProgress), misses: g.nearMisses, rocks: g.rocksDestroyed };
    const missionDone = missionProgress.distance >= 2000 && missionProgress.misses >= 3 && missionProgress.rocks >= 5;
    if (missionDone && !g.missionComplete) {
      g.missionComplete = true;
      g.score += 1000;
      hud.callout('Field test complete +1,000', 1, true);
      hud.say('MICA', 'Clean run. The ship is ready for whatever waits beyond the lane.', 6);
      sfx.daredevil();
    }
    hud.setMission(missionProgress, g.missionComplete);
    hud.setScore(g.score);
    hud.update(realDt);

    post.render();
  }

  return {
    config,
    scene, camera, ship,
    on: events.on,
    get state() { return g; },
    stats,
    get backend() { return engine.backend; },

    attract() { resetWorld('attract'); hud.setVisible(false); },
    start(trip) {
      resetWorld('flying', trip);
      hud.setVisible(true);
      audio.playMusic(musicUrl);
      sfx.start();
      sfx.revive();
      hud.say('MICA', pick(MICA.start), 5);
      engine.canvas.focus?.();
    },
    restart(trip) {
      resetWorld('flying', trip);
      sfx.revive();
      hud.say('MICA', pick(MICA.restart), 4);
    },
    setCapture(enabled) { input.setCapture(enabled); },
    pause(p) {
      if (g.mode === 'dead') return;
      input.clearActions();          // presses made on the pause screen never fire on resume
      setThrottle(false, false);
      g.paused = p;
      if (p) hud.setHint('');
      p ? audio.suspend() : audio.resume();
    },
    frame,
    hud,
    dispose() {
      input.dispose();
      hud.dispose();
      untrack();
      events.clear();
      rocks.dispose();
      post.dispose();
      scene.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); o.material?.dispose?.(); } });
    },
  };
}
