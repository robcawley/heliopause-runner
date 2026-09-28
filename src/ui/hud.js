// The HTML layer: score, callouts, MICA's comms line and the dev readout.
// Anything that belongs inside the ship (phase, chain, beacon) lives on the
// cockpit dash instead, so this layer stays thin.
export function createHud(root) {
  root.innerHTML = `
    <div class="hud-score"><span class="hud-score-value">0</span><span class="hud-score-label">clearance points</span></div>
    <div class="hud-callouts"></div>
    <div class="hud-comms" aria-live="polite"><span class="hud-comms-who"></span><span class="hud-comms-text"></span></div>
    <div class="hud-dev"></div>
    <button class="hud-phase-btn" type="button" aria-label="Phase drive">Phase</button>
  `;
  const scoreEl = root.querySelector('.hud-score-value');
  const callouts = root.querySelector('.hud-callouts');
  const comms = root.querySelector('.hud-comms');
  const commsWho = root.querySelector('.hud-comms-who');
  const commsText = root.querySelector('.hud-comms-text');
  const dev = root.querySelector('.hud-dev');
  const phaseBtn = root.querySelector('.hud-phase-btn');

  let shownScore = 0, targetScore = 0, commsTimer = 0;

  return {
    phaseBtn,
    setScore(v) { targetScore = v; },
    callout(text, side, strong = false) {
      const el = document.createElement('div');
      el.className = `callout ${side < 0 ? 'left' : 'right'}${strong ? ' strong' : ''}`;
      el.textContent = text;
      callouts.appendChild(el);
      setTimeout(() => el.remove(), 1300);
    },
    say(who, text, seconds = 5) {
      commsWho.textContent = who;
      commsText.textContent = text;
      comms.classList.add('on');
      commsTimer = seconds;
    },
    dev(text) { dev.textContent = text; },
    update(dt) {
      shownScore += (targetScore - shownScore) * Math.min(1, dt * 10);
      scoreEl.textContent = Math.round(shownScore).toLocaleString();
      if (commsTimer > 0 && (commsTimer -= dt) <= 0) comms.classList.remove('on');
    },
  };
}
