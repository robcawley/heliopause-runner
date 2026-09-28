// The HTML layer: score, hull and radiation, roll charges, callouts, MICA's
// comms line, the lane guidance arrow, the touch stick and the dev readout.
// Anything that belongs inside the ship (phase, chain, beacon) lives on the
// cockpit dash instead.
export function createHud(root) {
  root.innerHTML = `
    <div class="hud-status">
      <div class="hud-score"><span class="hud-score-value">0</span><span class="hud-score-label">clearance points</span></div>
      <div class="hud-meter hull"><span class="hud-meter-label">Hull</span><span class="hud-meter-track"><span class="hud-meter-fill"></span></span></div>
      <div class="hud-meter rad"><span class="hud-meter-label">Radiation</span><span class="hud-meter-track"><span class="hud-meter-fill"></span></span></div>
      <div class="hud-rolls"><span class="hud-meter-label">Rolls</span><span class="hud-roll-pips"></span></div>
    </div>
    <div class="hud-warning"></div>
    <div class="hud-guide">
      <svg class="hud-guide-arrow" viewBox="-20 -20 40 40" aria-hidden="true"><path d="M-9 -12 L11 0 L-9 12 L-4 0 Z"/></svg>
      <svg class="hud-guide-marker" viewBox="-20 -20 40 40" aria-hidden="true"><path d="M0 -14 L14 0 L0 14 L-14 0 Z"/></svg>
      <span class="hud-guide-label"></span>
    </div>
    <div class="hud-callouts"></div>
    <div class="hud-comms" aria-live="polite"><span class="hud-comms-who"></span><span class="hud-comms-text"></span></div>
    <div class="hud-dev"></div>
    <div class="hud-stick"><span class="hud-stick-knob"></span></div>
    <div class="hud-touch-buttons">
      <button class="hud-btn roll-left" type="button" aria-label="Roll left">Roll</button>
      <button class="hud-btn phase" type="button" aria-label="Phase drive">Phase</button>
      <button class="hud-btn roll-right" type="button" aria-label="Roll right">Roll</button>
    </div>
  `;
  const $ = (s) => root.querySelector(s);
  const scoreEl = $('.hud-score-value');
  const hullMeter = $('.hud-meter.hull'), hullFill = $('.hull .hud-meter-fill');
  const radMeter = $('.hud-meter.rad'), radFill = $('.rad .hud-meter-fill');
  const pipsEl = $('.hud-roll-pips');
  const warning = $('.hud-warning');
  const guide = $('.hud-guide'), arrow = $('.hud-guide-arrow'), marker = $('.hud-guide-marker'), guideLabel = $('.hud-guide-label');
  const callouts = $('.hud-callouts');
  const comms = $('.hud-comms'), commsWho = $('.hud-comms-who'), commsText = $('.hud-comms-text');
  const dev = $('.hud-dev');
  const stick = $('.hud-stick'), knob = $('.hud-stick-knob');

  let shownScore = 0, targetScore = 0, commsTimer = 0, pipCount = -1;

  return {
    buttons: { phase: $('.hud-btn.phase'), rollLeft: $('.hud-btn.roll-left'), rollRight: $('.hud-btn.roll-right') },
    setScore(v) { targetScore = v; },
    setHull(frac) {
      hullFill.style.transform = `scaleX(${Math.max(0, frac)})`;
      hullMeter.classList.toggle('low', frac < 0.3);
    },
    setRadiation(frac) {
      radFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
      radMeter.classList.toggle('on', frac > 0.01);
      radMeter.classList.toggle('high', frac > 0.6);
    },
    setRolls(charges, max) {
      const full = Math.floor(charges);
      if (full !== pipCount || pipsEl.children.length !== max) {
        pipCount = full;
        pipsEl.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < full ? 'on' : ''}"></i>`).join('');
      }
      const partial = pipsEl.children[full];
      if (partial) partial.style.setProperty('--fill', (charges - full).toFixed(2));
    },
    setWarning(text, level = 0) {
      warning.textContent = text || '';
      warning.className = `hud-warning${text ? ' on' : ''}${level > 1 ? ' urgent' : ''}`;
    },
    // g: { show, x, y (px), angle (rad), onScreen, label, danger }
    setGuide(g) {
      guide.classList.toggle('on', !!g.show);
      guide.classList.toggle('danger', !!g.danger);
      if (!g.show) return;
      guide.style.transform = `translate(${g.x}px, ${g.y}px)`;
      arrow.style.display = g.onScreen ? 'none' : 'block';
      marker.style.display = g.onScreen ? 'block' : 'none';
      arrow.style.transform = `rotate(${g.angle}rad)`;
      guideLabel.textContent = g.label;
    },
    setStick(s) {
      stick.classList.toggle('on', !!s);
      if (!s) return;
      const r = 70, len = Math.hypot(s.dx, s.dy), k = len > r ? r / len : 1;
      stick.style.transform = `translate(${s.x}px, ${s.y}px)`;
      knob.style.transform = `translate(${s.dx * k}px, ${s.dy * k}px)`;
    },
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
