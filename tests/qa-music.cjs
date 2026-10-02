const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/tmp/pwt/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.QA_URL || 'http://localhost:5173') + '/audio/music/manifest.json');
    const result = await page.evaluate(async () => {
      const { createAudio } = await import('/src/engine/audio.js');
      const { MUSIC } = await import('/src/modes/belt-run/music.js');
      const audio = createAudio({ music: 0.55, sfx: 0.85 });
      await audio.start();
      const played = [];
      for (let i = 0; i < 8; i++) {
        audio.playMusic(MUSIC);
        await new Promise(resolve => setTimeout(resolve, 800));
        if (audio.music.paused) throw new Error('Music failed to play');
        played.push(audio.music.url);
      }
      audio.duckMusic(0.65, 0.8);
      audio.toggleMute(); audio.update();
      audio.suspend();
      const paused = audio.music.paused;
      await audio.resume();
      await new Promise(resolve => setTimeout(resolve, 100));
      const resumed = !audio.music.paused;
      await audio.dispose();
      return { played, paused, resumed, closed: audio.ctx.state === 'closed' };
    });
    assert.equal(new Set(result.played.slice(0, 4)).size, 4);
    assert.equal(new Set(result.played.slice(4)).size, 4);
    for (let i = 1; i < result.played.length; i++) assert.notEqual(result.played[i], result.played[i - 1]);
    assert(result.paused && result.resumed && result.closed);
    assert.deepEqual(errors, []);
    console.log('Native playback: two complete shuffles, no repeats, pause/resume and cleanup passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
