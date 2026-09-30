import * as THREE from 'three/webgpu';
import { part, merge, scrapMaterial, glowMaterial, shieldMaterial } from './geo.js';

// Raider silhouettes: ragtag scrap-built craft, each type with its own shape and colour so a
// swarm reads at a glance. Every model points along -z. Accent colours are also used by the
// HUD brackets, so a type is the same colour on screen and in the world:
//   Needle    skirmisher  orange   a spike with twitching mandibles, fast
//   Lancer    gunner      sulphur  lopsided gun platform, one huge cannon
//   Hook      grappler    violet   a bulb trailing mechanical tentacles
//   Bulwark   shielded    amber    a slab behind a blue shield
//   Carrion   the boss    red      a skull prow, a ribcage, two shield pods, a core
// build(type) returns { root, mats, plates, hit spheres, muzzle, animate(t, pose) }.
export const LOOK = {
  skirmisher: { name: 'Needle', accent: 0xff6a2a, css: '#ff7a3a' },
  gunner: { name: 'Lancer', accent: 0xffd23a, css: '#ffd84a' },
  grappler: { name: 'Hook', accent: 0xd24cff, css: '#d860ff' },
  bulwark: { name: 'Bulwark', accent: 0xffa040, css: '#ffae55' },
  boss: { name: 'Carrion', accent: 0xff2a3a, css: '#ff4050' },
};
const PI = Math.PI;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylZ = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n).rotateX(PI / 2);
const coneZ = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n).rotateX(-PI / 2);   // tip toward -z

function kit(accent) {
  return {
    hull: scrapMaterial({ paint: 0x46352b, burnt: 0x0d0907, rim: accent, rimStrength: 0.9, scale: 0.6, metalness: 0.5 }),
    dark: scrapMaterial({ paint: 0x221d1a, burnt: 0x080605, rim: accent, rimStrength: 0.45, scale: 0.9 }),
    glow: glowMaterial(accent, 2.2),
  };
}
function add(root, geos, material) {
  const m = new THREE.Mesh(merge(geos), material);
  root.add(m);
  return m;
}
// A chain of segments: a mechanical tentacle. Returns the joints (animate their rotation).
function tentacle(parent, mats, segments, len, thick, tipScale = 1) {
  const joints = [];
  let at = parent;
  for (let i = 0; i < segments; i++) {
    const j = new THREE.Group();
    j.position.z = i === 0 ? 0 : -len;
    const k = 1 - i / (segments + 2);
    const seg = new THREE.Mesh(merge([part(box(thick * k, thick * k, len * 0.92), 0, 0, -len / 2), part(new THREE.IcosahedronGeometry(thick * 0.7 * k, 0))]), i % 2 ? mats.dark : mats.hull);
    j.add(seg);
    at.add(j);
    joints.push(j);
    at = j;
  }
  const claw = new THREE.Group();
  claw.position.z = -len;
  for (const s of [-1, 1]) claw.add(new THREE.Mesh(merge([part(coneZ(0.18 * tipScale, 0.9 * tipScale, 4), s * 0.22 * tipScale, 0, -0.4 * tipScale, 0, s * 0.5, 0)]), mats.glow));
  at.add(claw);
  return { joints, claw };
}

function needle() {
  const mats = kit(LOOK.skirmisher.accent);
  const root = new THREE.Group();
  add(root, [
    part(coneZ(0.95, 5.6, 6), 0, 0, -0.6, 0, 0, PI / 6, 1, 0.7, 1),
    part(box(0.3, 0.8, 3.8), 0, 0.5, 0.4),
    part(box(3.2, 0.12, 1.3), 1.7, -0.1, 0.8, 0, -0.3, -0.15),
    part(box(1.1, 0.12, 0.9), -1.1, 0.1, 1.0, 0, 0.4, 0.3),
  ], mats.hull);
  add(root, [part(cylZ(0.55, 0.7, 1.5, 7), 0, 0, 2.8), part(box(1.8, 0.2, 0.2), 0, -0.4, 2.2)], mats.dark);
  add(root, [part(box(0.9, 0.14, 0.3), 0, 0.42, -1.3), part(cylZ(0.45, 0.45, 0.2, 7), 0, 0, 3.6)], mats.glow);
  const mandibles = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.6, -0.15, -2.2);
    g.add(new THREE.Mesh(merge([part(box(0.22, 0.22, 3), 0, 0, -1.4), part(coneZ(0.2, 0.7, 4), 0, 0, -3.1)]), mats.hull));
    root.add(g);
    return g;
  });
  const plates = [
    add(root, [part(box(0.9, 0.6, 1.4), 0.75, 0.15, 0.2, 0, 0, 0.3)], mats.dark),
    add(root, [part(box(0.8, 0.5, 1.2), -0.7, 0.1, 0.5, 0, 0, -0.3)], mats.hull),
  ];
  return {
    root, mats, plates, muzzle: new THREE.Vector3(0, 0, -3.6),
    spheres: [{ c: new THREE.Vector3(0, 0, 0), r: 2.4, part: 'body' }],
    animate(t, pose) {
      const open = 0.08 + Math.sin(t * 9 + pose.seed) * 0.05 * (1 - pose.tele) + pose.tele * 0.45;
      mandibles[0].rotation.y = open; mandibles[1].rotation.y = -open;
      mats.glow.userData.level.value = 2 + pose.tele * 4 * (0.6 + 0.4 * Math.sin(t * 40));
    },
  };
}

function lancer() {
  const mats = kit(LOOK.gunner.accent);
  const root = new THREE.Group();
  add(root, [
    part(box(2.6, 1.8, 3.6)),
    part(box(1.4, 1, 1.7), -0.6, 1.2, 0.2, 0, 0.2, 0),
    part(cylZ(0.48, 0.55, 6.6, 8), 1.9, -0.2, -2.3),
    part(box(1.2, 1.2, 1.4), 1.9, -0.2, 0.4),
  ], mats.hull);
  add(root, [
    part(cylZ(0.26, 0.26, 3.2, 6), -1.6, -0.4, -1.4),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => part(box(0.14, 0.14, 2.2), sx * 0.9, sy * 0.7, 2.9))),
    part(new THREE.TorusGeometry(0.62, 0.14, 4, 10), 1.9, -0.2, -5.5),
  ], mats.dark);
  add(root, [
    part(new THREE.IcosahedronGeometry(0.28, 0), -0.5, 0.2, -1.85),
    part(new THREE.IcosahedronGeometry(0.22, 0), -0.05, 0.5, -1.85),
    part(new THREE.IcosahedronGeometry(0.18, 0), -0.9, 0.55, -1.85),
    part(new THREE.IcosahedronGeometry(0.55, 1), 0, 0, 3.1),
  ], mats.glow);
  const barrelGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 8).rotateX(PI / 2), glowMaterial(0xff3020, 0));
  barrelGlow.position.set(1.9, -0.2, -5.55);
  root.add(barrelGlow);
  const plates = [
    add(root, [part(box(0.3, 1.4, 2.2), -1.45, 0, 0.2)], mats.dark),
    add(root, [part(box(2, 0.3, 1.6), 0.2, 1.02, 1)], mats.hull),
  ];
  return {
    root, mats, plates, muzzle: new THREE.Vector3(1.9, -0.2, -5.8),
    spheres: [{ c: new THREE.Vector3(0.6, 0, -0.4), r: 2.8, part: 'body' }],
    animate(t, pose) {
      mats.glow.userData.level.value = 2 + pose.tele * 3;
      barrelGlow.material.userData.level.value = pose.tele * pose.tele * 6 + pose.lock * 4 * (Math.sin(t * 50) > 0 ? 1 : 0.3);
    },
  };
}

function hook() {
  const mats = kit(LOOK.grappler.accent);
  const root = new THREE.Group();
  add(root, [part(new THREE.IcosahedronGeometry(2, 1), 0, 0, 0.4, 0, 0, 0, 1.2, 0.95, 1.45)], mats.hull);
  add(root, [part(new THREE.TorusGeometry(1.8, 0.3, 5, 14), 0, 0, -1.4), part(cylZ(0.7, 0.9, 1.6, 7), 0, 0, 2.8)], mats.dark);
  add(root, [
    part(box(2.9, 0.16, 0.4), 0, 0.4, 0.3), part(box(2.6, 0.16, 0.4), 0, -0.5, 1.2),
    part(new THREE.IcosahedronGeometry(0.5, 1), 0, 0, -1.45),
  ], mats.glow);
  const arms = [0, 1, 2, 3].map((k) => {
    const a = PI / 4 + k * PI / 2;
    const base = new THREE.Group();
    base.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.3, -1.2);
    root.add(base);
    return { a, base, ...tentacle(base, mats, 5, 1.25, 0.42) };
  });
  const plates = [
    add(root, [part(box(1.6, 0.4, 1.6), 0.9, 1.6, 0.6, 0.3, 0, -0.4)], mats.dark),
    add(root, [part(box(1.4, 0.4, 1.4), -1.2, -1.4, 0.9, -0.3, 0, 0.5)], mats.dark),
  ];
  return {
    root, mats, plates, muzzle: new THREE.Vector3(0, 0, -2.4), arms,
    spheres: [{ c: new THREE.Vector3(0, 0, 0.2), r: 3, part: 'body' }],
    animate(t, pose) {
      const splay = pose.tele * 0.9 + pose.reel * 0.5;
      for (const arm of arms) {
        arm.joints.forEach((j, i) => {
          const w = Math.sin(t * 2.4 + arm.a * 3 + i * 0.8 + pose.seed) * (0.28 - pose.tele * 0.15);
          j.rotation.x = w + (i === 0 ? -Math.sin(arm.a) * splay : 0);
          j.rotation.y = Math.cos(t * 1.9 + arm.a * 2 + i) * 0.2 + (i === 0 ? Math.cos(arm.a) * splay : 0);
        });
      }
      mats.glow.userData.level.value = 1.8 + pose.tele * 4 * (0.5 + 0.5 * Math.sin(t * 30)) + pose.reel * 2;
    },
  };
}

function bulwark() {
  const mats = kit(LOOK.bulwark.accent);
  const root = new THREE.Group();
  add(root, [
    part(box(6, 2.2, 4.4)),
    part(box(5, 1.6, 1.6), 0, 0.1, -2.6, -0.35, 0, 0),
    part(box(1.4, 1.8, 3), -3.4, -0.2, 0.6), part(box(1.4, 1.6, 2.6), 3.3, 0.2, 0.9),
  ], mats.hull);
  add(root, [
    part(cylZ(0.8, 0.95, 1.8, 8), 0, -0.2, -3.2),
    part(cylZ(0.12, 0.12, 3, 5), -2.6, 0.6, -3), part(cylZ(0.12, 0.12, 3, 5), 2.6, 0.6, -3),
    part(box(4, 0.6, 1.2), 0, 0, 2.7),
  ], mats.dark);
  add(root, [
    part(new THREE.IcosahedronGeometry(0.3, 0), -2.6, 0.6, -4.6), part(new THREE.IcosahedronGeometry(0.3, 0), 2.6, 0.6, -4.6),
    part(box(3.4, 0.2, 0.2), 0, 0.9, 3.35), part(box(0.9, 0.2, 0.2), 0, 1.15, -1.5),
  ], mats.glow);
  const shieldMat = shieldMaterial(0x4aa8ff);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(5.4, 24, 12, 0, PI * 2, 0, PI * 0.42).rotateX(-PI / 2), shieldMat);
  shield.position.z = 0.4;
  root.add(shield);
  const plates = [
    add(root, [part(box(2, 1.6, 0.4), -1.6, 0.2, -3.25, -0.35, 0, 0)], mats.dark),
    add(root, [part(box(2, 1.6, 0.4), 1.6, 0.2, -3.25, -0.35, 0, 0)], mats.dark),
    add(root, [part(box(3, 0.4, 2.2), 0, 1.25, 0.4)], mats.dark),
  ];
  return {
    root, mats, plates, shield, shieldMat, muzzle: new THREE.Vector3(0, -0.2, -4.4),
    spheres: [{ c: new THREE.Vector3(0, 0, 0), r: 3.6, part: 'body' }],
    shieldCenter: new THREE.Vector3(0, 0, 0.4), shieldRadius: 5.4,
    animate(t, pose) {
      mats.glow.userData.level.value = 1.8 + pose.tele * 3;
      shieldMat.userData.level.value = pose.shieldUp ? 0.85 + Math.sin(t * 3) * 0.08 : 0;
    },
  };
}

function carrion() {
  const mats = kit(LOOK.boss.accent);
  const root = new THREE.Group();
  add(root, [
    part(coneZ(4.2, 9.5, 7), 0, 0.6, -8.5, 0, 0, 0, 1, 0.75, 1),
    part(box(5.2, 4, 15)),
    part(box(28, 1.2, 2.4), 0, 0, 2), part(box(0.8, 3, 2), -13.5, 0, 2), part(box(0.8, 3, 2), 13.5, 0, 2),
    part(box(3, 3.4, 4), 0, 2.8, -2),
  ], mats.hull);
  add(root, [
    ...[0, 1, 2, 3, 4, 5].map((k) => part(new THREE.TorusGeometry(3.8, 0.35, 4, 10, PI * 1.25), 0, 0, -5 + k * 2.4, 0, 0, -PI * 0.12)),
    part(cylZ(1.2, 1.6, 3, 8), -2, 0, 8.6), part(cylZ(1.2, 1.6, 3, 8), 2, 0, 8.6), part(cylZ(1, 1.3, 3, 8), 0, 2.2, 8.4),
    part(new THREE.TorusGeometry(2.2, 0.4, 5, 14), -15, 0, 2, 0, PI / 2, 0), part(new THREE.TorusGeometry(2.2, 0.4, 5, 14), 15, 0, 2, 0, PI / 2, 0),
  ], mats.dark);
  add(root, [
    part(box(2.6, 0.3, 0.3), -1.6, 1.3, -10.2, 0, 0.2, -0.3), part(box(2.6, 0.3, 0.3), 1.6, 1.3, -10.2, 0, -0.2, 0.3),
    part(cylZ(1, 1, 0.3, 8), -2, 0, 10.2), part(cylZ(1, 1, 0.3, 8), 2, 0, 10.2), part(cylZ(0.8, 0.8, 0.3, 8), 0, 2.2, 9.9),
  ], mats.glow);
  const jaw = new THREE.Group();
  jaw.position.set(0, -1.6, -4);
  jaw.add(new THREE.Mesh(merge([part(box(4.6, 0.9, 7), 0, 0, -3.5), ...[-1.6, -0.5, 0.5, 1.6].map((x) => part(coneZ(0.3, 1.4, 4), x, 0.6, -6.6, -0.6, 0, 0))]), mats.hull));
  root.add(jaw);
  const coreMat = glowMaterial(0xff5a20, 1);
  const pods = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), glowMaterial(0xff40d0, 2.4));
    m.position.set(s * 15, 0, 2);
    root.add(m);
    return m;
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), coreMat);
  core.position.set(0, -3, 6);
  root.add(core);
  const shieldMat = shieldMaterial(0xff4fd8);
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 3), shieldMat);
  root.add(shield);
  const arms = [-1, 1].map((s) => {
    const base = new THREE.Group();
    base.position.set(s * 3, -2.4, -6);
    root.add(base);
    return { s, base, ...tentacle(base, mats, 7, 1.8, 0.7, 2) };
  });
  const plates = [
    add(root, [part(box(3, 2.4, 0.5), -2.2, 0.6, -11, 0, 0.5, 0)], mats.dark),
    add(root, [part(box(3, 2.4, 0.5), 2.2, 0.6, -11, 0, -0.5, 0)], mats.dark),
    add(root, [part(box(5.6, 0.5, 5), 0, 2.3, 4)], mats.dark),
    add(root, [part(box(0.5, 3, 6), -2.9, 0, 4)], mats.dark),
  ];
  return {
    root, mats, plates, shield, shieldMat, pods, core, jaw, arms,
    muzzle: new THREE.Vector3(0, -1.2, -12),
    spheres: [
      { c: new THREE.Vector3(-15, 0, 2), r: 2.9, part: 'podL' },
      { c: new THREE.Vector3(15, 0, 2), r: 2.9, part: 'podR' },
      { c: new THREE.Vector3(0, -3, 6), r: 2.6, part: 'core' },
      { c: new THREE.Vector3(0, 0, -2), r: 8.5, part: 'body' },
    ],
    shieldCenter: new THREE.Vector3(0, 0, 0), shieldRadius: 12,
    animate(t, pose) {
      jaw.rotation.x = 0.1 + pose.tele * 0.5 + Math.sin(t * 1.3) * 0.05;
      for (const arm of arms) {
        arm.joints.forEach((j, i) => {
          j.rotation.x = Math.sin(t * 1.6 + i * 0.7 + arm.s) * 0.22 + (i === 0 ? 0.4 : 0);
          j.rotation.y = Math.cos(t * 1.2 + i * 0.9) * 0.18 + (i === 0 ? arm.s * (0.2 + pose.tele * 0.6) : 0);
        });
      }
      mats.glow.userData.level.value = 2 + pose.tele * 3 + pose.rage * (Math.sin(t * 12) > 0 ? 2 : 0);
      pods.forEach((p) => { p.material.userData.level.value = 2.2 + Math.sin(t * 5) * 0.6; p.rotation.y += 0.02; });
      coreMat.userData.level.value = pose.shieldUp ? 0.6 : 2.5 + Math.sin(t * 9) * 1.2;
      shieldMat.userData.level.value = pose.shieldUp ? 0.7 + Math.sin(t * 2.2) * 0.1 : 0;
    },
  };
}

const BUILDERS = { skirmisher: needle, gunner: lancer, grappler: hook, bulwark, boss: carrion };
export function buildModel(type) {
  const m = BUILDERS[type]();
  m.root.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
  return m;
}
export function disposeModel(m) {
  m.root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } });
}
