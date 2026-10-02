// Intro and onboarding: a fresh player sees the intro, the board welcome, and the first-flight
// prompts, each clearing when done. Needs the dev server. Usage: node tests/qa-onboarding.cjs
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
  await page.waitForTimeout(3000);
  const intro = await page.evaluate(() => document.querySelector('#intro .intro-line')?.textContent);
  console.log('intro line at 3s:', intro);
  assert.ok(intro);
  await page.waitForTimeout(9500);
  console.log('title revealed:', await page.evaluate(() => document.getElementById('intro')?.classList.contains('reveal')));
  await page.waitForSelector('.board-welcome', { timeout: 12000 });
  console.log('welcome:', (await page.textContent('.board-welcome h3')).trim());
  await page.click('.board-welcome button');
  assert.equal(await page.$('.board-welcome'), null);
  console.log('first trip tutorial flag:', await page.evaluate(async () => { const { tripOf } = await import('/src/tycoon/career.js'); return tripOf(__career().offers[0], __career()).tutorial; }));
  await page.evaluate(() => document.querySelector('.board-card:not(.too-heavy)')?.click());
  await page.click('.board-launch');
  const keys = { steer: 'KeyA', boost: 'ShiftLeft', brake: 'KeyX', fire: 'KeyF', phase: 'Space' };
  const seen = [];
  for (let s = 0; s < 120; s++) {
    await page.waitForTimeout(500);
    const chip = await page.evaluate(() => { const c = document.querySelector('.tutor-chip'); return c?.classList.contains('on') ? c.textContent.trim() : ''; });
    if (chip && seen[seen.length - 1] !== chip) { seen.push(chip); console.log(`${(s / 2).toFixed(1)}s chip:`, chip); }
    const want = Object.entries(keys).find(([k]) => chip.toLowerCase().includes(k === 'steer' ? 'to fly' : k));
    if (want) { await page.keyboard.down(want[1]); await page.waitForTimeout(want[0] === 'phase' ? 100 : 1500); await page.keyboard.up(want[1]); }
    if (seen.length >= 7 && !chip) break;
  }
  console.log('chips seen', seen.length, 'errors', errors.slice(0, 3).join(' / ') || 'none');
  assert.ok(seen.length >= 5); assert.equal(errors.length, 0);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
