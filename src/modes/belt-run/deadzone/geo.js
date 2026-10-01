import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, positionLocal, normalView, positionViewDirection, dot, pow,
  saturate, mix, mx_noise_float, oneMinus, uniform, color,
} from 'three/tsl';

// Helpers for building scrap-built models out of primitives. Parts are merged per material,
// so a whole raider or a broken capital ship is only a few draw calls.

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

// A matrix from position, Euler rotation and scale
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// A primitive, transformed, ready to merge (the source geometry is disposed)
export function partM(geo, m) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  g.applyMatrix4(m);
  return g;
}
export function part(geo, x, y, z, rx, ry, rz, sx, sy, sz) {
  return partM(geo, mat(x, y, z, rx, ry, rz, sx, sy, sz));
}

// Positions and normals only: the materials colour by position
export function merge(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

// Battered metal: paint worn down to burnt streaks, and a coloured rim so the silhouette
// reads against black space. userData.flash (0..) is a hot white-orange hit flash.
export function scrapMaterial({ paint, burnt, rim, rimStrength = 0.5, scale = 0.3, metalness = 0.55, roughness = 0.62 }) {
  const flash = uniform(0);
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness, flatShading: true });
  const paintC = color(new THREE.Color(paint)), burntC = color(new THREE.Color(burnt)), rimC = color(new THREE.Color(rim));
  m.colorNode = Fn(() => {
    const n = mx_noise_float(positionLocal.mul(scale)).mul(0.5).add(0.5);
    const streak = mx_noise_float(positionLocal.mul(vec3(scale * 3, scale * 0.35, scale * 3))).mul(0.5).add(0.5);
    return mix(burntC, paintC, saturate(n.mul(1.5).sub(streak.mul(0.55))));
  })();
  m.emissiveNode = Fn(() => {
    const facing = saturate(dot(normalView, positionViewDirection));
    return rimC.mul(pow(oneMinus(facing), float(2.4))).mul(rimStrength).add(vec3(1.4, 0.8, 0.45).mul(flash));
  })();
  m.userData.flash = flash;
  return m;
}

// Unlit glow for eyes, engines and warning lights. userData.level scales it (telegraphs).
export function glowMaterial(hex, level = 1, { fog = false, additive = false } = {}) {
  const lv = uniform(level);
  const m = new THREE.MeshBasicNodeMaterial({ fog, transparent: additive, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  m.colorNode = color(new THREE.Color(hex)).mul(lv);
  m.userData.level = lv;
  return m;
}

// An energy shield: a fresnel shell, faint face-on and bright at the rim; userData.flash lights
// the whole shell on a hit, userData.level fades it in and out.
export function shieldMaterial(hex) {
  const flash = uniform(0), lv = uniform(1);
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const c = color(new THREE.Color(hex));
  m.colorNode = Fn(() => {
    const facing = saturate(dot(normalView, positionViewDirection).abs());
    const rim = pow(oneMinus(facing), float(2.2));
    return c.mul(rim.mul(0.9).add(0.05).add(flash.mul(0.8))).mul(lv);
  })();
  m.userData.flash = flash;
  m.userData.level = lv;
  return m;
}
