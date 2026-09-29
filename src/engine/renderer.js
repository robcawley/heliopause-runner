import * as THREE from 'three/webgpu';

// The engine owns one renderer for the whole game. Modes bring their own scene
// and camera. WebGPU where the browser has it, WebGL2 otherwise; add ?webgl to
// the URL to force the fallback.
export async function createEngine(container, { resolutionScale = () => 1 } = {}) {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL, powerPreference: 'high-performance' });
  await renderer.init();

  // If the GPU device is lost (driver reset, or an early WebGPU implementation
  // falling over) reload on the WebGL2 path rather than leaving a frozen frame.
  renderer.onDeviceLost = () => {
    if (!forceWebGL) location.replace(`${location.pathname}?webgl`);
  };

  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.setClearColor(0x02040a, 1);
  container.appendChild(renderer.domElement);

  const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  const cameras = new Set();

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * resolutionScale());
    renderer.setSize(w, h, false);
    cameras.forEach((c) => { c.aspect = w / h; c.updateProjectionMatrix(); });
  }
  addEventListener('resize', resize);
  resize();

  return {
    renderer,
    backend,
    canvas: renderer.domElement,
    resize,
    // Modes register their camera so it follows the window size
    trackCamera(camera) { cameras.add(camera); resize(); return () => cameras.delete(camera); },
  };
}
