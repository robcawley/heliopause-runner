import GUI from 'lil-gui';
import { CONFIG } from '../config.js';

// Press T (or `) to open. Every slider edits CONFIG live. When something feels
// right, press "Copy values" and paste the JSON into config.js or FEEL-LOG.md.
export function createTuning({ onResize }) {
  const gui = new GUI({ title: 'Feel tuning' });
  gui.hide();

  const flight = gui.addFolder('Flight');
  const f = CONFIG.flight;
  flight.add(f, 'steering', ['auto', 'drag', 'follow']);
  flight.add(f, 'dragSensitivity', 0.005, 0.08, 0.001);
  flight.add(f, 'stiffness', 5, 200, 1);
  flight.add(f, 'damping', 1, 40, 0.5);
  flight.add(f, 'bankPerSpeed', 0, 0.12, 0.001);
  flight.add(f, 'maxBank', 0, 1.2, 0.01);
  flight.add(f, 'pitchPerSpeed', 0, 0.08, 0.001);
  flight.add(f, 'yawIntoTurn', 0, 0.05, 0.001);
  flight.add(f, 'cruiseSpeed', 10, 200, 1);
  flight.add(f, 'boostSpeed', 20, 300, 1);
  flight.add(f, 'boundsX', 2, 20, 0.5);
  flight.add(f, 'boundsY', 1, 12, 0.5);

  const cam = gui.addFolder('Camera');
  const c = CONFIG.camera;
  cam.add(c, 'fov', 45, 110, 1);
  cam.add(c, 'boostFovKick', 0, 40, 1);
  cam.add(c, 'headLag', 0, 0.02, 0.0005);
  cam.add(c, 'headLagMax', 0, 0.5, 0.01);
  cam.add(c, 'headStiffness', 10, 300, 1);
  cam.add(c, 'headDamping', 1, 40, 0.5);
  cam.add(c, 'shakeAngle', 0, 0.2, 0.005);
  cam.add(c, 'shakeOffset', 0, 0.4, 0.005);
  cam.add(c, 'shakeFrequency', 2, 60, 1);
  cam.add(c, 'traumaDecay', 0.2, 5, 0.1);

  const world = gui.addFolder('Belt');
  const w = CONFIG.world;
  world.add(w, 'rockCount', 0, 150, 1);
  world.add(w, 'rockAimBias', 0, 1, 0.01);
  world.add(w, 'rockMinSize', 0.2, 3, 0.1);
  world.add(w, 'rockMaxSize', 0.5, 8, 0.1);
  world.add(w, 'dustStreak', 0, 0.1, 0.001);

  const nm = gui.addFolder('Near miss');
  const n = CONFIG.nearMiss;
  nm.add(n, 'radius', 0.5, 8, 0.1);
  nm.add(n, 'hitRadius', 0, 3, 0.05);
  nm.add(n, 'chainWindow', 0.5, 6, 0.1);
  nm.add(n, 'whooshLead', 0.1, 1, 0.01);
  nm.add(n, 'hitStop', 0, 0.2, 0.005);
  nm.add(n, 'slowmo', 0, 1, 0.01);
  nm.add(n, 'slowmoScale', 0.05, 1, 0.01);
  nm.add(n, 'daredevilSlowmo', 0, 2, 0.05);

  const ph = gui.addFolder('Phase drive');
  ph.add(CONFIG.phase, 'duration', 0.1, 1.5, 0.01);
  ph.add(CONFIG.phase, 'cooldown', 0, 8, 0.1);
  ph.add(CONFIG.phase, 'fovKick', 0, 30, 0.5);

  const fx = gui.addFolder('Post FX');
  const x = CONFIG.fx;
  fx.add(x, 'bloomStrength', 0, 3, 0.01);
  fx.add(x, 'bloomRadius', 0, 1, 0.01);
  fx.add(x, 'bloomThreshold', 0, 1, 0.01);
  fx.add(x, 'aberration', 0, 1.5, 0.01);
  fx.add(x, 'grain', 0, 0.3, 0.005);
  fx.add(x, 'vignette', 0, 2, 0.01);
  fx.add(x, 'exposure', 0.2, 3, 0.01);
  fx.add(x, 'resolutionScale', 0.5, 1, 0.05).onFinishChange(onResize);

  const au = gui.addFolder('Audio');
  au.add(CONFIG.audio, 'music', 0, 1, 0.01);
  au.add(CONFIG.audio, 'sfx', 0, 1.5, 0.01);
  au.add(CONFIG.audio, 'engine', 0, 1, 0.01);

  gui.add({
    copy() {
      navigator.clipboard?.writeText(JSON.stringify(CONFIG, null, 2));
    },
  }, 'copy').name('Copy values');

  gui.folders.forEach((fo) => fo.close());
  flight.open();

  return {
    toggle() { gui._hidden ? gui.show() : gui.hide(); },
    get open() { return !gui._hidden; },
  };
}
