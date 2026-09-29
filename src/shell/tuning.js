import GUI from 'lil-gui';

// Press T (or `) to open. Every slider edits the mode's live config. When
// something feels right, "Copy values" puts the whole config on the clipboard
// to paste into modes/belt-run/config.js or docs/FEEL-LOG.md.
export function createTuning(config, { onResize } = {}) {
  const gui = new GUI({ title: 'Feel tuning' });
  gui.hide();
  const folder = (name, obj, rows) => {
    const f = gui.addFolder(name);
    rows.forEach(([key, ...args]) => {
      const last = args[args.length - 1];
      const label = typeof last === 'string' && (args.length > 1 || typeof obj[key] === 'boolean') ? args.pop() : null;
      const c = f.add(obj, key, ...args);
      if (label) c.name(label);
    });
    f.close();
    return f;
  };

  const flight = folder('Flight', config.flight, [
    ['yawRate', 0.5, 5, 0.05, 'turn rate'],
    ['pitchRate', 0.5, 5, 0.05, 'pitch rate'],
    ['rollRate', 0.5, 6, 0.05, 'roll rate'],
    ['autoLevel', 0, 6, 0.1, 'auto-level (0 = off)'],
    ['turnResponse', 2, 40, 0.5, 'turn snap'],
    ['grip', 0.5, 20, 0.1, 'grip (low = drift)'],
    ['invertY', 'invert pitch'],
    ['cruiseSpeed', 10, 200, 1],
    ['boostSpeed', 20, 300, 1],
    ['brakeSpeed', 5, 100, 1],
    ['bankPerTurn', 0, 1.2, 0.01],
    ['maxBank', 0, 1.6, 0.01],
  ]);
  folder('Stick', config.input, [
    ['steering', ['auto', 'mouse', 'follow', 'drag']],
    ['mouseRange', 80, 600, 5, 'mouse travel for full turn'],
    ['mouseRecentre', 0, 5, 0.05, 'mouse self-centring (0 = off)'],
    ['stickRadius', 0.1, 0.6, 0.01, 'mouse reach'],
    ['stickCurve', 0.5, 3, 0.05, 'centre precision'],
    ['deadzone', 0, 0.3, 0.01],
    ['touchStickRadius', 30, 200, 1, 'touch reach (px)'],
    ['touchDeadzone', 0, 0.3, 0.01, 'touch deadzone'],
    ['touchCurve', 0.5, 3, 0.05, 'touch centre precision'],
    ['touchSmoothing', 0, 0.3, 0.01, 'touch smoothing (s)'],
    ['touchThrottleLatch', 'touch boost/brake latch'],
    ['doubleTapSteerKeys', 'dodge on A / D double-tap'],
  ]);
  folder('Blasters', config.blasters, [
    ['fireRate', 1, 30, 0.5],
    ['boltSpeed', 100, 2000, 10],
    ['convergence', 30, 500, 5],
    ['damage', 0.2, 10, 0.1],
    ['heatPerShot', 0, 20, 0.5],
    ['coolRate', 0, 100, 1],
    ['spread', 0, 0.05, 0.001],
  ]);
  folder('PIP', config.droid, [
    ['popUpAt', 0.3, 1.5, 0.01, 'pops up at (share of lane)'],
    ['returnTo', 0.1, 0.9, 0.01, 'flies you to (share of lane)'],
    ['steerGain', 0.3, 5, 0.1],
    ['overrideStick', 0.2, 1, 0.05, 'stick to take over'],
  ]);
  folder('Rolls', config.roll, [
    ['auto', 'automatic dodge rolls'],
    ['autoLookahead', 0.1, 0.8, 0.01, 'auto-roll warning (s)'],
    ['charges', 1, 6, 1],
    ['recharge', 0.2, 8, 0.1],
    ['duration', 0.2, 1, 0.01],
    ['impulse', 0, 80, 1],
    ['cameraFollow', 0, 1, 0.05, 'camera rolls too'],
  ]);
  folder('Camera', config.camera, [
    ['fov', 45, 110, 1],
    ['boostFovKick', 0, 40, 1],
    ['headLag', 0, 0.02, 0.0005],
    ['headLagMax', 0, 0.5, 0.01],
    ['lookIntoTurn', 0, 0.3, 0.005],
    ['shakeAngle', 0, 0.2, 0.005],
    ['shakeOffset', 0, 0.4, 0.005],
    ['traumaDecay', 0.2, 5, 0.1],
  ]);
  folder('Belt', config.world, [
    ['pathRocks', 0, 150, 1, 'path rocks (restart)'],
    ['pathSpread', 5, 80, 1],
    ['rockMinSize', 0.2, 3, 0.1],
    ['rockMaxSize', 0.5, 8, 0.1],
    ['dustStreak', 0, 0.1, 0.001],
  ]);
  folder('Near miss', config.nearMiss, [
    ['radius', 0.5, 8, 0.1],
    ['hitRadius', 0, 3, 0.05],
    ['chainWindow', 0.5, 6, 0.1],
    ['hitStop', 0, 0.2, 0.005],
    ['slowmo', 0, 1, 0.01],
    ['slowmoScale', 0.05, 1, 0.01],
  ]);
  folder('Lane', config.lane, [
    ['safeRadius', 10, 500, 1],
    ['warnRadius', 5, 500, 1],
    ['gateRepair', 0, 60, 1],
    ['coreRepair', 0, 10, 0.1],
  ]);
  folder('Settlements', config.settlement, [
    ['firstAt', 300, 20000, 100, 'first one at (m)'],
    ['spacing', 2000, 40000, 500, 'then every (m)'],
    ['jitter', 0, 8000, 100],
    ['jamBlasters', 'blasters jammed inside'],
    ['wallDamage', 0, 30, 1, 'wall scrape damage'],
  ]);
  folder('Radiation & hull', config.radiation, [
    ['riseRate', 0.5, 40, 0.5, 'exposure rise'],
    ['fallRate', 1, 60, 1, 'exposure fall'],
    ['damageFrom', 0, 95, 1, 'harmless below'],
    ['hullDamage', 0, 40, 0.5, 'damage at full'],
  ]);
  folder('Phase drive', config.phase, [['duration', 0.1, 1.5, 0.01], ['cooldown', 0, 8, 0.1], ['fovKick', 0, 30, 0.5]]);
  const fx = folder('Post FX', config.fx, [
    ['bloomStrength', 0, 3, 0.01], ['bloomRadius', 0, 1, 0.01], ['bloomThreshold', 0, 1, 0.01],
    ['aberration', 0, 1.5, 0.01], ['grain', 0, 0.3, 0.005], ['vignette', 0, 2, 0.01], ['exposure', 0.2, 3, 0.01],
  ]);
  fx.add(config.fx, 'resolutionScale', 0.5, 1, 0.05).onFinishChange(() => onResize?.());
  folder('Audio', config.audio, [['music', 0, 1, 0.01], ['sfx', 0, 1.5, 0.01], ['engine', 0, 1, 0.01]]);

  gui.add({ copy: () => navigator.clipboard?.writeText(JSON.stringify(config, null, 2)) }, 'copy').name('Copy values');
  flight.open();

  return {
    toggle() { gui._hidden ? gui.show() : gui.hide(); },
    get open() { return !gui._hidden; },
  };
}
