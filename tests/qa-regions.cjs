// Regions smoke test: fly a contract into each power's region and check the look and weather
// apply with no frame errors. Needs the dev server running. Usage: node tests/qa-regions.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/tmp/pwt/node_modules/playwright');
const DESTS = { meridian: 'Haumea Reach', halcyon: 'Orcus Ward', sable: 'Quaoar Landing', free: 'Sedna Lanterns' };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
  for (const [region, dest] of Object.entries(DESTS).filter(([k]) => !process.env.ONLY || k === process.env.ONLY)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(process.env.QA_URL || 'http://localhost:5173');
    await page.waitForSelector('body.ready');
    await page.click('#launch');
    await page.evaluate((to) => {
      const c = __career();
      c.town = 'Salacia Cut';
      Object.assign(c.offers[0], { to, tons: 1, heavy: false, deadline: null, distance: 9000, density: 0.7, level: 3 });
      c.offers[0].raid.threat = 0;
    }, dest);
    await page.click('.board-card[data-i="0"]');
    await page.click('.board-launch');
    await page.waitForTimeout(40000);
    const s = await page.evaluate(() => { const r = __game.run; return { mode: r.state.mode, fog: [Math.round(r.scene.fog.near), Math.round(r.scene.fog.far)], col: r.scene.fog.color.getHexString() }; });
    console.log(region, dest, JSON.stringify(s), errors.length ? errors.slice(0, 3).join(' / ') : 'no errors');
    assert.equal(errors.length, 0);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
