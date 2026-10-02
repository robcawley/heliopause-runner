const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/tmp/pwt/node_modules/playwright');
(async() => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let errors = [];
  page.on('console', m => {
    if (m.type() === 'error')errors.push(m.text());
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.QA_URL || 'http://localhost:5173');
  await page.waitForSelector('body.ready');
  await page.click('#launch');
  await page.evaluate(async() => {
    const { hire } = await import('/src/tycoon/crew.js');
    const c = __career();
    c.credits = 100000;
    c.owned.quarters = true;
    c.owned.pip = true;
    for (const id of ['teo', 'sparks', 'krug', 'tanaka'])hire(c, id);
    c.offers[0].tons = 1;
    c.offers[0].heavy = false;
    c.offers[0].deadline = null;
    c.offers[0].distance = 9000;
    c.offers[0].density = 0.7;
    c.offers[0].raid.threat = 2;
  });
  await page.click('.board-card[data-i="0"]');
  await page.click('.board-launch');
  await page.evaluate(async() => {
    const T = await import('/node_modules/three/build/three.webgpu.js');
    const d = __game.run.debug();
    window.qa = { dt: [], states: new Set(), damaged: false, dead: false, landed: false };
    __game.run.on('landed', s => {
      qa.landed = s;
    });
    let last = performance.now();
    const aim = new T.Vector3();
    const matrix = new T.Matrix4();
    const up = new T.Vector3(0, 1, 0);
    const zero = new T.Vector3();
    function assist(now) {
      qa.dt.push(now - last);
      last = now;
      const { g, ship, dz, wing } = d;
      wing.members.forEach(w => {
        qa.states.add(w.state);
        if (w.hull < 99)qa.damaged = true;
      });
      if (g.mode === 'flying') {
        g.phaseTime = 1;
        const r = dz.raiders.all.find(r => r.alive && !r.dying);
        const fight = dz.rulesOff && r;
        document.dispatchEvent(new KeyboardEvent(fight ? 'keydown' : 'keyup', { code: 'KeyF', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent(fight ? 'keydown' : 'keyup', { code: 'KeyX', bubbles: true }));
        document.dispatchEvent(new KeyboardEvent(fight ? 'keyup' : 'keydown', { code: 'ShiftLeft', bubbles: true }));
        if (fight) {
          const part = r.type === 'boss' ? (r.pods[0] > 0 ? 'podL' : r.pods[1] > 0 ? 'podR' : 'core') : null;
          const point = part ? r.root.localToWorld(aim.copy(r.model.spheres.find(s => s.part === part).c)) : r.pos;
          aim.subVectors(point, ship.pos).normalize();
          matrix.lookAt(zero, aim, up);
          ship.quat.setFromRotationMatrix(matrix);
        } else {
          ship.quat.identity();
          ship.pos.x *= 0.97;
          ship.pos.y *= 0.97;
        }
      }
      if (g.mode === 'landed' || g.mode === 'dead') return;
      requestAnimationFrame(assist);
    }
    requestAnimationFrame(assist);
  });
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(10000);
    const state = await page.evaluate(() => {
      const { g, dz, wing, ship } = __game.run.debug();
      const sorted = qa.dt.slice(-600).sort((a, b) => a - b);
      return { mode: g.mode, time: g.time, z: ship.pos.z, phase: dz.phase, kills: dz.kills, wing: wing.members.map(w => ({ id: w.id, state: w.state, hull: w.hull, pos: w.pos.toArray() })), states: [...qa.states], median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * .95)], damage: qa.damaged, landed: qa.landed };
    });
    console.log(JSON.stringify(state));
    if (i === 1 || state.phase === 'fight' && i === 4) await page.screenshot({ path: '/tmp/heliopause-flight-' + i + '.png' });
    if (state.mode === 'landed' || state.mode === 'dead') break;
  }
  await page.waitForTimeout(2000);
  assert.deepEqual(errors, []);
  assert(await page.evaluate(() => !!qa.landed), 'trip must land');
  console.log('ERRORS', errors);
  await page.screenshot({ path: '/tmp/heliopause-trip-end.png' });
  await browser.close();
}
)();
