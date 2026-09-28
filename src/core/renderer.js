import * as THREE from 'three/webgpu';
import { CONFIG } from '../config.js';

// WebGPURenderer uses WebGPU where the browser has it (Chrome, Edge, Safari 26+)
// and quietly falls back to a WebGL2 backend everywhere else. Add ?webgl to the
// URL to force the fallback and check both paths look the same.
export async function createRenderer(container) {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL, powerPreference: 'high-performance' });
  await renderer.init();

  // If the GPU device is lost (driver reset, or an early WebGPU implementation
  // falling over) reload on the WebGL2 path rather than leaving a frozen frame.
  renderer.onDeviceLost = () => {
    if (!forceWebGL) location.replace(`${location.pathname}?webgl`);
  };

  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = CONFIG.fx.exposure;
  renderer.setClearColor(0x02040a, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050a16, CONFIG.world.fogNear, CONFIG.world.fogFar);

  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.03, 1400);

  // Light: a far, small Sun ahead and to the right, a cold fill from the belt,
  // and a dim teal lamp inside the cockpit so the dash never goes fully black.
  const sunDir = new THREE.Vector3(0.55, 0.38, -0.74).normalize();
  const sun = new THREE.DirectionalLight(0xffe2b8, 3.2);
  sun.position.copy(sunDir).multiplyScalar(100);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x324a70, 0x07090f, 0.55));

  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * CONFIG.fx.resolutionScale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  return { renderer, scene, camera, sunDir, backend, resize };
}
