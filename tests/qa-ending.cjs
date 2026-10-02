// The ending end to end: open the crossing, fly it, watch the phases, check the epilogue.
// Needs the dev server. Takes about three minutes. Usage: node tests/qa-ending.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/tmp/pwt/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.QA_URL || 'http://localhost:5173');
  await page.waitForSelector('body.ready');
  await page.click('#launch');
  const n = await page.evaluate(async () => {
    const { makeOffers, crossingProgress } = await import('/src/tycoon/career.js');
    const c = __career();
    c.ended = false; c.town = 'Salacia Cut'; c.crew = ['krug', 'sparks']; c.fallen = ['teo'];
    for (const t of ['Salacia Cut', 'Orcus Ward', 'Quaoar Landing', 'Sedna Lanterns']) c.standing[t] = 2;
    c.offers = makeOffers(c);
    return [crossingProgress(c), c.offers.findIndex((k) => k.final)];
  });
  console.log('progress, crossing offer index', n);
  assert.equal(n[0], 4); assert.ok(n[1] >= 0);
  await page.click('.board-nav[data-go=chart]');
  await page.click('.board-nav[data-go=board]').catch(() => {});
  await page.evaluate((i) => document.querySelector(`.board-card[data-i="${i}"]`)?.click(), n[1]);
  await page.click('.board-launch');
  const seen = new Set();
  for (let s = 0; s < 220; s += 2) {
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => ({ mode: __game.run.state.mode, epi: document.getElementById('epilogue')?.classList.contains('on'), comms: document.querySelector('.hud-comms')?.textContent?.trim().slice(0, 70) }));
    const key = `${st.mode}|${st.comms}`;
    if (!seen.has(key)) { seen.add(key); console.log(s + 's', JSON.stringify(st)); }
    if (st.epi) break;
  }
  const epi = await page.evaluate(() => document.getElementById('epilogue')?.innerText);
  console.log('EPILOGUE:', epi?.replace(/\s+/g, ' ').slice(0, 300));
  const after = await page.evaluate(() => [__career().ended, __career().offers.some((k) => k.final)]);
  console.log('ended, crossing still offered', after, 'errors', errors.slice(0, 4).join(' / ') || 'none');
  assert.ok(epi); assert.deepEqual(after, [true, false]); assert.equal(errors.length, 0);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
