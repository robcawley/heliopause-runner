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
  flight.add(f, 'maxLateral', 5, 80, 1);
  flight.add(f, 'agility', 0.5, 20, 0.1);
  flight.add(f, 'stickRadius', 0.1, 0.6, 0.01);
  flight.add(f, 'touchStickRadius', 30, 160, 1);
  flight.add(f, 'deadzone', 0, 0.3, 0.01);
  flight.add(f, 'headingFollow', 0, 1.2, 0.01);
  flight.add(f, 'bankPerSpeed', 0, 0.06, 0.001);
  flight.add(f, 'bankPerAccel', 0, 0.02, 0.0005);
  flight.add(f, 'maxBank', 0, 1.5, 0.01);
  flight.add(f, 'cruiseSpeed', 10, 200, 1);
  flight.add(f, 'boostSpeed', 20, 300, 1);

  const roll = gui.addFolder('Rolls');
  const ro = CONFIG.roll;
  roll.add(ro, 'charges', 1, 6, 1);
  roll.add(ro, 'recharge', 0.2, 8, 0.1);
  roll.add(ro, 'duration', 0.2, 1, 0.01);
  roll.add(ro, 'impulse', 0, 80, 1);
  roll.add(ro, 'cameraFollow', 0, 1, 0.05).name('camera rolls too');

  const lane = gui.addFolder('Lane & hull');
  const L = CONFIG.lane, R = CONFIG.radiation, H = CONFIG.hull;
  lane.add(L, 'safeRadius', 5, 50, 0.5);
  lane.add(L, 'warnRadius', 2, 50, 0.5);
  lane.add(L, 'gateRepair', 0, 60, 1);
  lane.add(L, 'coreRepair', 0, 10, 0.1);
  lane.add(R, 'riseRate', 1, 100, 1).name('radiation rise');
  lane.add(R, 'fallRate', 1, 100, 1).name('radiation fall');
  lane.add(R, 'hullDamage', 0, 60, 1).name('radiation damage');
  lane.add(R, 'damageFrom', 0, 95, 1).name('damage from exposure');
  lane.add(H, 'rockDamageBase', 0, 50, 1);
  lane.add(H, 'rockDamagePerSize', 0, 20, 0.5);

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
  world.add(w, 'rockSpread', 10, 100, 1);
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
