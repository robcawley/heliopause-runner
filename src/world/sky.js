import * as THREE from 'three/webgpu';
import {
  Fn, vec3, float, positionLocal, normalize, floor, fract, hash, length,
  smoothstep, max, dot, pow, mix, mx_noise_float, uniform, time, sin,
} from 'three/tsl';

// A sky dome drawn entirely in a shader: two layers of stars, a faint nebula
// (the garden's light, far off), and the Sun as a hard point with a soft halo.
// It follows the ship's position but never its rotation, so when you bank the
// whole sky rolls: in space, that is your horizon.

const starLayer = Fn(([dir, density, threshold, size]) => {
  const p = dir.mul(density);
  const cell = floor(p);
  const seed = cell.x.add(cell.y.mul(157.0)).add(cell.z.mul(113.0));
  const h = hash(seed);
  const jitter = vec3(hash(seed.add(1.1)), hash(seed.add(2.3)), hash(seed.add(3.7))).sub(0.5).mul(0.6);
  const d = length(fract(p).sub(0.5).sub(jitter));
  const on = smoothstep(threshold, 1.0, h);
  const twinkle = sin(time.mul(hash(seed.add(9.1)).mul(3.0).add(0.5)).add(h.mul(40.0))).mul(0.25).add(0.75);
  return smoothstep(size, 0.0, d).mul(on).mul(twinkle).mul(h.mul(3.0));
});

export function createSky(sunDir) {
  const uSun = uniform(sunDir.clone());

  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  material.colorNode = Fn(() => {
    const dir = normalize(positionLocal);

    const stars = starLayer(dir, float(140), float(0.975), float(0.18))
      .add(starLayer(dir, float(320), float(0.965), float(0.14)).mul(0.6));
    const starTint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash(floor(dir.mul(140)).x));

    // Nebula: two octaves of noise, very dim, teal into violet
    const n1 = mx_noise_float(dir.mul(1.6)).mul(0.5).add(0.5);
    const n2 = mx_noise_float(dir.mul(4.2).add(7.0)).mul(0.5).add(0.5);
    const neb = pow(n1.mul(n2), 2.2).mul(0.55);
    const nebColor = mix(vec3(0.02, 0.10, 0.12), vec3(0.08, 0.03, 0.14), n2);

    // Sun: a tiny white-hot disc, a warm halo, and a wide faint glow
    const sd = max(dot(dir, uSun), 0.0);
    const sun = pow(sd, 9000.0).mul(40.0)
      .add(pow(sd, 600.0).mul(0.45))
      .add(pow(sd, 40.0).mul(0.025));
    const sunColor = vec3(1.0, 0.86, 0.66);

    const base = vec3(0.006, 0.010, 0.022);
    return base.add(nebColor.mul(neb)).add(starTint.mul(stars)).add(sunColor.mul(sun));
  })();

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  return {
    mesh,
    update(ship) { mesh.position.set(ship.x, ship.y, 0); },
  };
}
