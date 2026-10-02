import * as THREE from 'three/webgpu';
import { glowMaterial } from './deadzone/geo.js';
import { createWingVoice } from './wingVoice.js';

// The ending (docs/PACKAGE.md): the crossing. A final contract (trip.final) flies out of the
// belt toward Arrokoth. Past the last beacon the rock thins to nothing, the escorts turn back,
// the music and the engine fall away, and in open space something waits: a slowly turning
// geometry of light with an eye at its centre. It speaks once. However you fly, it turns you
// back. Then the fade, and the epilogue (main.js).
//
//   out      the last stretch of belt (MICA, the crew uneasy)
//   thin     past the last beacon: rock cleared, radiation off, the escorts peel away, quiet
//   open     open space; the entity resolves out of the dark ahead
//   speech   it speaks; the pilot is turned gently back
//   fade     white, then black; emit 'ending'
//
// host: { config, scene, ship, hud, rig, audio, wing, fogBase, progress(), fade(k), flash(k), emit(name) }

const V3 = THREE.Vector3;
const VOID = new THREE.Color(0x05030a);   // the colour of open space
const clamp = THREE.MathUtils.clamp;

// The words (Rob chose draft 3, 2 Oct 2026). One line at a time, long pauses.
const WORDS = [
  'Before your sun was lit, the borders were drawn.',
  'Yours ends here.',
  'What waits past it does not hate you. It will never notice you.',
  'That is worse. Return.',
];
const THIN_AT = 2600;          // metres flown before the belt gives out
const OPEN_AFTER = 22;         // seconds of thinning before the entity shows
const ENTITY_RANGE = 2600;     // how far ahead it resolves
const KEEP_OFF = 1100;         // nearer than this and you are turned away

function buildEntity() {
  const root = new THREE.Group();
  const lineMat = (hex, opacity) => new THREE.LineBasicNodeMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const shell = (geo, hex, opacity) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(hex, opacity));
  const shells = [
    shell(new THREE.IcosahedronGeometry(1, 0), 0xfff1d6, 0.9),
    shell(new THREE.DodecahedronGeometry(1.45, 0), 0xffd59a, 0.7),
    shell(new THREE.OctahedronGeometry(2.1, 0), 0xc9b8ff, 0.55),
    shell(new THREE.IcosahedronGeometry(2.9, 1), 0xa898e0, 0.22),
  ];
  shells.forEach((s) => root.add(s));
  const rings = [3.4, 4.1].map((r, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 160), glowMaterial(i ? 0xb9acd6 : 0xffe2b0, 1.6, { additive: true }));
    root.add(m);
    return m;
  });
  // The eye: a glowing core, an iris that always faces you, a dark pupil, a soft halo
  const eye = new THREE.Group();
  eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 16), glowMaterial(0xfff6e8, 2.4)));
  const iris = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.5, 64), glowMaterial(0xe8b46a, 2, { additive: true }));
  iris.position.z = 0.43;
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.15, 48), new THREE.MeshBasicNodeMaterial({ color: 0x000000, fog: false }));
  pupil.position.z = 0.44;
  eye.add(iris, pupil);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 12), glowMaterial(0xffe8c8, 0.35, { additive: true }));
  root.add(eye, halo);
  root.visible = false;
  const mats = [];
  root.traverse((o) => { if (o.material) mats.push(o.material); });
  return { root, shells, rings, eye, iris, halo, mats };
}

export function createEnding(host) {
  const { config, scene, ship } = host;
  const voices = [0, 1, 2].map(() => createWingVoice(host.audio, { ...config.wing, radioLevel: 0.42 }));
  const E = buildEntity();
  scene.add(E.root);
  const dir = new V3();
  const qStep = new THREE.Quaternion(), qId = new THREE.Quaternion();
  let micaSaid = false, active = false, phase = 'idle', t = 0, start = 0, line = -1, lineT = 0, k = 0, emitted = false, saved = null, drone = null;

  function reset(trip) {
    restore();
    active = !!trip?.final;
    phase = active ? 'out' : 'idle';
    t = 0; line = -1; lineT = 0; k = 0; emitted = false; micaSaid = false;
    E.root.visible = false;
    start = host.progress();
  }

  function restore() {
    if (saved) { config.audio.music = saved.music; config.audio.engine = saved.engine; saved = null; }
    if (drone) { const now = host.audio.ctx?.currentTime ?? 0; drone.gain.gain.setTargetAtTime(0, now, 0.5); drone.stop(now + 3); drone = null; }
  }

  // A low chord that swells as the entity appears
  function startDrone() {
    const ctx = host.audio.ctx;
    if (!ctx || drone) return;
    const now = ctx.currentTime;
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(host.audio.sfx);
    const oscs = [27.5, 41.2, 55, 82.4, 110.3].map((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = (i - 2) * 3;
      const g = ctx.createGain(); g.gain.value = [0.5, 0.35, 0.3, 0.16, 0.08][i];
      o.connect(g).connect(gain); o.start();
      return o;
    });
    gain.gain.setTargetAtTime(0.32, now, 4);
    drone = { gain, stop: (at) => oscs.forEach((o) => o.stop(at)) };
  }

  function speak(text) {
    host.hud.say('', text, 7);
    // Three voices at once, an octave and a fifth apart, slowed and darkened: a chorus
    [[55, 0.62, -0.25], [82, 0.7, 0.25], [110, 0.78, 0]].forEach(([pitch, formant, pan], i) => voices[i].talk({ pitch, formant, pan }, text));
  }

  const clears = () => active && (phase === 'thin' || phase === 'open' || phase === 'speech' || phase === 'fade');

  function update(dt, flying) {
    if (!active) return;
    t += dt;
    const flown = host.progress() - start;

    if (phase === 'out') {
      if (t > 8 && !micaSaid) micaSaid = true, host.hud.say('MICA', 'Arrokoth course laid in. There is no lane past the last beacon. I will be quiet now.', 6);
      if (flown > THIN_AT) {
        phase = 'thin'; t = 0;
        saved = { music: config.audio.music, engine: config.audio.engine };
        host.wing.peelOff?.();
        host.audio.filterMusic?.(320, 14);
      }
    }
    if (phase === 'thin' || phase === 'open' || phase === 'speech') {
      // The belt's colour bleeds out to a deep violet black; music and engine fall away
      k = Math.min(1, k + dt / 18);
      host.fogBase.lerp(VOID, dt * 0.15);
      config.audio.music = saved.music * (1 - k) * (phase === 'speech' ? 0 : 1);
      config.audio.engine = saved.engine * (1 - k * 0.8);
    }
    if (phase === 'thin' && t > OPEN_AFTER) {
      phase = 'open'; t = 0;
      E.root.position.copy(ship.pos).addScaledVector(ship.fwd, ENTITY_RANGE);
      E.root.scale.setScalar(260);
      E.root.visible = true;
      startDrone();
    }
    if (phase === 'open' || phase === 'speech' || phase === 'fade') {
      // Reveal, and the slow turning
      const reveal = clamp((phase === 'open' ? t : 99) / 10, 0, 1);
      E.shells.forEach((s, i) => { s.rotation.x += dt * 0.03 * (i % 2 ? -1 : 1); s.rotation.y += dt * (0.05 - i * 0.008); const o = (s.userData.o ??= s.material.opacity); s.material.opacity = o * reveal; });
      E.rings.forEach((r, i) => { r.rotation.x = Math.PI / 2 + Math.sin(t * 0.05 + i) * 0.4; r.rotation.z += dt * (i ? -0.02 : 0.03); });
      E.eye.lookAt(ship.pos);
      const blink = 1 - Math.max(0, Math.sin(t * 0.21) ** 400);
      E.eye.scale.set(1, blink, 1);
      E.halo.scale.setScalar(1 + Math.sin(t * 0.4) * 0.06);
      E.root.scale.setScalar(260 * (0.85 + 0.15 * reveal));
      // Turned back: nearer than KEEP_OFF and the ship is eased round, away from it
      const d = E.root.position.distanceTo(ship.pos);
      if (flying && d < KEEP_OFF) {
        dir.subVectors(ship.pos, E.root.position).normalize();
        qStep.setFromUnitVectors(ship.fwd, dir);
        const s = 1 - Math.exp(-(0.5 + (KEEP_OFF - d) / 300) * dt);
        ship.quat.premultiply(qId.identity().slerp(qStep, s)).normalize();
      }
    }
    if (phase === 'open' && t > 12) { phase = 'speech'; t = 0; lineT = 1.5; }
    if (phase === 'speech') {
      lineT -= dt;
      if (lineT <= 0) {
        line++;
        if (line < WORDS.length) { speak(WORDS[line]); lineT = 4.5 + WORDS[line].length * 0.07; }
        else { phase = 'fade'; t = 0; host.flash(0.6); }
      }
    }
    if (phase === 'fade') {
      host.flash(Math.max(0, 1 - t / 4) * 0.9);
      host.fade(clamp((t - 2) / 4, 0, 1));
      if (t > 6.5 && !emitted) { emitted = true; restore(); host.emit('ending'); }
    }
  }

  return {
    reset, update, clears,
    get active() { return active; },
    get phase() { return phase; },
    dispose() { restore(); scene.remove(E.root); E.mats.forEach((m) => m.dispose()); E.root.traverse((o) => o.geometry?.dispose()); },
  };
}
