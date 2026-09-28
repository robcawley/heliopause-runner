import * as THREE from 'three/webgpu';
import {
  pass, uniform, vec2, vec3, vec4, float, mix, smoothstep, length, screenUV,
  luminance, hash, time, Fn, screenSize, floor,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { CONFIG } from '../config.js';

// Scene -> chromatic aberration -> + bloom -> grade -> vignette -> grain.
// Game events drive three uniforms:
//   aberrationKick  spikes on near misses and hits
//   phase           0..1, the phase drive's ghost world (desaturated, cold)
//   hit             0..1, a hull-hit flash, warm and brief
//   radiation       0..1, exposure outside the beacon lane
export function createPost(renderer, scene, camera) {
  const pipeline = new THREE.RenderPipeline(renderer);

  const u = {
    aberration: uniform(CONFIG.fx.aberration),
    phase: uniform(0),
    hit: uniform(0),
    radiation: uniform(0),
    vignette: uniform(CONFIG.fx.vignette),
    grain: uniform(CONFIG.fx.grain),
  };

  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');

  const bloomNode = bloom(color, CONFIG.fx.bloomStrength, CONFIG.fx.bloomRadius, CONFIG.fx.bloomThreshold);
  const aberrated = chromaticAberration(color, u.aberration, vec2(0.5, 0.5), float(1.1));

  pipeline.outputNode = Fn(() => {
    const c = aberrated.rgb.add(bloomNode.rgb).toVar();

    // Phase: the world drains to a cold ghost
    const lum = luminance(c);
    const ghost = vec3(lum).mul(vec3(0.55, 0.95, 1.15)).add(vec3(0.0, 0.015, 0.03));
    c.assign(mix(c, ghost, u.phase));

    // Hull hit: a warm bloom from the edges inward
    const d = length(screenUV.sub(0.5));
    const edge = smoothstep(0.15, 0.75, d);
    c.addAssign(vec3(1.0, 0.22, 0.12).mul(u.hit).mul(edge.mul(0.7).add(0.04)));

    // Radiation: amber-green bleed from the edges, a nervous flicker, heavier grain
    const flicker = hash(floor(time.mul(30.0))).mul(0.35).add(0.65);
    const radEdge = smoothstep(0.2, 0.8, d);
    c.assign(mix(c, c.mul(vec3(1.25, 1.1, 0.55)), u.radiation.mul(0.7)));
    c.addAssign(vec3(0.5, 0.42, 0.05).mul(u.radiation).mul(radEdge).mul(flicker).mul(0.35));

    // Vignette
    c.mulAssign(mix(float(1), smoothstep(0.95, 0.28, d.mul(u.vignette)), 0.85));

    // Grain, locked to pixels so it reads as film, not noise crawl
    const px = floor(screenUV.mul(screenSize));
    const g = hash(px.x.add(px.y.mul(1931.0)).add(floor(time.mul(24.0)).mul(7919.0))).sub(0.5);
    c.addAssign(g.mul(u.grain.add(u.radiation.mul(0.22))).mul(lum.mul(0.6).add(0.4)));

    return vec4(c, 1.0);
  })();

  return {
    pipeline,
    uniforms: u,
    bloomNode,
    render() { pipeline.render(); },
    sync() {
      bloomNode.strength.value = CONFIG.fx.bloomStrength;
      bloomNode.radius.value = CONFIG.fx.bloomRadius;
      bloomNode.threshold.value = CONFIG.fx.bloomThreshold;
      u.vignette.value = CONFIG.fx.vignette;
      u.grain.value = CONFIG.fx.grain;
      renderer.toneMappingExposure = CONFIG.fx.exposure;
    },
  };
}
