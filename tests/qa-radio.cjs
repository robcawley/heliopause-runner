const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/tmp/pwt/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => sessionStorage.setItem('heliopause.introSeen', '1'));
    await page.goto(process.env.QA_URL || 'http://localhost:5173');
    await page.waitForSelector('body.ready');
    await page.click('#launch');
    const result = await page.evaluate(async () => {
      const { run, engine } = window.__game;
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      // Drive real gameplay callbacks deterministically, rather than depend on random combat.
      engine.renderer.setAnimationLoop(null);
      const trip = { origin: 'QA', dest: 'QA dock', distance: 9000, density: 0.7, raid: { threat: 2 } };
      run.start(trip);
      const d = run.debug();
      d.g.mode = 'flying';
      d.config.radio.chance = 1;
      d.config.radio.cooldown = 0; // Production spacing is covered by the logic regression.
      const loaded = await d.radio.prepare();
      d.ship.pos.copy(d.dz.wrecks.center);
      const stick = { stickX: 0, stickY: 0, roll: 0, brake: false, boost: false };
      d.dz.update(0, 0, stick);
      d.dz.update(0, 0, stick);
      const contact = d.radio.history.map(item => item.id);
      await wait(1100);
      const finished = !d.radio.playing;
      const raider = d.dz.raiders.spawn('skirmisher', d.ship.pos.clone().addScaledVector(d.ship.fwd, 100), d.ship.fwd.clone().negate());
      d.dz.raiders.kill(raider);
      await wait(1100);
      d.g.hull = 31;
      d.dz.fire.handlers.onHitShip({ kind: 'bolt', dmg: 5, vel: d.ship.fwd.clone(), pos: d.ship.pos.clone() });
      const hooks = d.radio.history.map(item => item.id);
      run.pause(true);
      await wait(100);
      const paused = d.audio.ctx.state === 'suspended' && !d.radio.play('zone-clear', { priority: true });
      run.pause(false);
      await wait(1100);
      d.radio.play('zone-clear', { priority: true });
      d.g.mode = 'dead';
      run.frame(0.01, 1);
      const stopped = !d.radio.playing;
      run.restart(trip);
      const fresh = run.debug();
      const reset = fresh.radio.history.length === 0 && fresh.radio.loaded === 10;
      run.restart({ ...trip, final: true });
      const final = run.debug();
      final.g.mode = 'flying';
      final.ship.distance = 3100;
      run.frame(0.01, 2);
      const endingQuiet = !final.radio.play('hull-critical', { priority: true });
      run.dispose();
      const disposed = final.radio.loaded === 0 && !final.radio.playing;
      await final.audio.dispose();
      return { loaded, contact, finished, hooks, paused, stopped, reset, endingQuiet, disposed };
    });
    assert.equal(result.loaded, 10);
    assert.deepEqual(result.contact, ['raiders-ahead']);
    assert(result.finished);
    assert.deepEqual(result.hooks, ['raiders-ahead', 'target-down', 'hull-critical']);
    for (const key of ['paused', 'stopped', 'reset', 'endingQuiet', 'disposed']) assert(result[key], key);
    assert.deepEqual(errors, []);
    console.log('WebGPU: ten MP3s decoded; contact, kill and critical hull hooks, pause, death, retry, ending hush and cleanup passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
