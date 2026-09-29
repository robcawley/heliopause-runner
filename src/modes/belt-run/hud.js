// The HTML layer: score, hull and radiation, roll charges, callouts, MICA's
// comms line, the lane guidance arrow, the touch stick and the dev readout.
// Anything that belongs inside the ship (phase, chain, beacon) lives on the
// cockpit dash instead.
import './hud.css';

export function createHud(parent) {
  const root = document.createElement('div');
  root.className = 'belt-hud';
  parent.appendChild(root);
  root.innerHTML = `
    <div class="hud-status">
      <div class="hud-score"><span class="hud-score-value">0</span><span class="hud-score-label">clearance points</span></div>
      <div class="hud-route" style="display:none"></div>
      <div class="hud-meter hull"><span class="hud-meter-label">Hull</span><span class="hud-meter-track"><span class="hud-meter-fill"></span></span></div>
      <div class="hud-meter rad"><span class="hud-meter-label">Radiation</span><span class="hud-meter-track"><span class="hud-meter-fill"></span></span></div>
      <div class="hud-rolls"><span class="hud-meter-label">Rolls</span><span class="hud-roll-pips"></span></div>
      <div class="hud-meter heat"><span class="hud-meter-label">Blasters</span><span class="hud-meter-track"><span class="hud-meter-fill"></span></span></div>
    </div>
    <div class="hud-warning"></div>
    <div class="hud-hitmarker" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="hud-zone"><b class="hud-zone-name"></b><span class="hud-zone-rule"></span></div>
    <div class="hud-dock"><svg viewBox="-20 -20 40 40" aria-hidden="true"><path d="M0 -14 L14 0 L0 14 L-14 0 Z"/></svg><span class="hud-dock-label"></span></div>
    <div class="hud-traffic"><span class="hud-traffic-bracket">⌜　⌝</span><span class="hud-traffic-label">COURIER</span></div>
    <div class="hud-mission">
      <div class="hud-mission-title"><span>Field test</span><b class="hud-mission-bonus">+1,000</b></div>
      <div class="hud-mission-item distance"><i></i><span>Fly the lane</span><b>0 / 2.0 km</b></div>
      <div class="hud-mission-item misses"><i></i><span>Close calls</span><b>0 / 3</b></div>
      <div class="hud-mission-item rocks"><i></i><span>Break rocks</span><b>0 / 5</b></div>
    </div>
    <div class="hud-guide">
      <svg class="hud-guide-arrow" viewBox="-20 -20 40 40" aria-hidden="true"><path d="M-9 -12 L11 0 L-9 12 L-4 0 Z"/></svg>
      <svg class="hud-guide-marker" viewBox="-20 -20 40 40" aria-hidden="true"><path d="M0 -14 L14 0 L0 14 L-14 0 Z"/></svg>
      <span class="hud-guide-label"></span>
    </div>
    <div class="hud-callouts"></div>
    <div class="hud-comms" aria-live="polite"><span class="hud-comms-who"></span><span class="hud-comms-text"></span></div>
    <div class="hud-dev"></div>
    <div class="hud-stick"><span class="hud-stick-knob"></span></div>
    <div class="hud-mstick"><span class="hud-mstick-dot"></span></div>
    <div class="hud-pip"><span class="hud-pip-key">R</span><span class="hud-pip-text"></span></div>
    <div class="hud-hint"></div>
    <div class="hud-touch-buttons">
      <button class="hud-btn roll-left" type="button" aria-label="Barrel roll left"><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg><span class="lbl">Roll</span></button>
      <button class="hud-btn phase" type="button" aria-label="Phase drive">Phase</button>
      <button class="hud-btn roll-right" type="button" aria-label="Barrel roll right"><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg><span class="lbl">Roll</span></button>
      <button class="hud-btn fire" type="button" aria-label="Fire blasters">Fire</button>
      <button class="hud-btn pip" type="button" aria-label="Call PIP">PIP</button>
      <button class="hud-btn boost" type="button" aria-label="Hold to boost">Boost</button>
      <button class="hud-btn brake" type="button" aria-label="Hold to brake">Brake</button>
    </div>
    <button class="hud-touch-pause" type="button" aria-label="Pause game">Ⅱ</button>
  `;
  const $ = (s) => root.querySelector(s);
  // Touch buttons light up while held, so a thumb can feel where it landed
  for (const b of root.querySelectorAll('.hud-btn, .hud-touch-pause')) {
    b.addEventListener('pointerdown', () => b.classList.add('down'));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) b.addEventListener(ev, () => b.classList.remove('down'));
  }
  const scoreEl = $('.hud-score-value');
  const hullMeter = $('.hud-meter.hull'), hullFill = $('.hull .hud-meter-fill');
  const radMeter = $('.hud-meter.rad'), radFill = $('.rad .hud-meter-fill');
  const pipsEl = $('.hud-roll-pips');
  const warning = $('.hud-warning');
  const hitmarker = $('.hud-hitmarker');
  const guide = $('.hud-guide'), arrow = $('.hud-guide-arrow'), marker = $('.hud-guide-marker'), guideLabel = $('.hud-guide-label');
  const callouts = $('.hud-callouts');
  const comms = $('.hud-comms'), commsWho = $('.hud-comms-who'), commsText = $('.hud-comms-text');
  const dev = $('.hud-dev');
  const stick = $('.hud-stick'), knob = $('.hud-stick-knob');
  const heatMeter = $('.hud-meter.heat'), heatFill = $('.heat .hud-meter-fill');
  const mstick = $('.hud-mstick'), mdot = $('.hud-mstick-dot');
  const pipEl = $('.hud-pip'), pipText = $('.hud-pip-text');
  const hint = $('.hud-hint');
  const mission = $('.hud-mission');
  const zone = $('.hud-zone'), zoneName = $('.hud-zone-name'), zoneRule = $('.hud-zone-rule');
  const dock = $('.hud-dock'), dockLabel = $('.hud-dock-label');
  const trafficEl = $('.hud-traffic');
  const heatLabel = $('.heat .hud-meter-label');
  const routeEl = $('.hud-route');
  let routeText = null;
  let zoneTimer = 0, heatJammed = false, hitTimer = 0;

  let shownScore = 0, targetScore = 0, commsTimer = 0, pipCount = -1;

  return {
    buttons: { phase: $('.hud-btn.phase'), rollLeft: $('.hud-btn.roll-left'), rollRight: $('.hud-btn.roll-right'), fire: $('.hud-btn.fire'), pip: $('.hud-btn.pip'), boost: $('.hud-btn.boost'), brake: $('.hud-btn.brake'), pause: $('.hud-touch-pause') },
    setHeat(frac, overheated, jammed = false) {
      heatFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
      heatMeter.classList.toggle('over', !!overheated);
      if (jammed !== heatJammed) {
        heatJammed = jammed;
        heatMeter.classList.toggle('jammed', jammed);
        heatLabel.textContent = jammed ? 'Jammed' : 'Blasters';
      }
    },
    // A settlement's name and house rule, across the top of the view
    showZone(name, rule, seconds = 5) {
      zoneName.textContent = name;
      zoneRule.textContent = rule;
      zone.classList.add('on');
      zoneTimer = seconds;
    },
    // The run's trip: where you are going and how far
    setRoute(text) {
      if (text === routeText) return;
      routeText = text;
      routeEl.textContent = text;
      routeEl.style.display = text ? '' : 'none';
    },
    // Latched touch throttle: Boost or Brake stays lit while it is on
    setThrottle(boost, brake) {
      $('.hud-btn.boost').classList.toggle('on', boost);
      $('.hud-btn.brake').classList.toggle('on', brake);
    },
    // The canyon-mouth marker: { show, x, y (px), label }
    setDock(d) {
      dock.classList.toggle('on', !!d.show);
      if (!d.show) return;
      dock.style.transform = `translate(${d.x}px, ${d.y}px)`;
      dockLabel.textContent = d.label;
    },
    setTraffic(t) {
      trafficEl.classList.toggle('on', !!t.show);
      if (t.show) trafficEl.style.transform = `translate(${t.x}px, ${t.y}px)`;
    },
    // Captured-mouse stick: a ring at screen centre and a dot for the deflection
    setMouseStick(s) {
      mstick.classList.toggle('on', !!s);
      if (s) mdot.style.transform = `translate(${s.x * 46}px, ${-s.y * 46}px)`;
    },
    // PIP's prompt: text, or null to hide. state: 'offer' | 'driving'
    setPip(text, state) {
      pipEl.classList.toggle('on', !!text);
      pipEl.classList.toggle('driving', state === 'driving');
      if (text) pipText.textContent = text;
    },
    setHint(text) { hint.textContent = text || ''; hint.classList.toggle('on', !!text); },
    hitConfirm(destroyed) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('break', !!destroyed);
      hitTimer = destroyed ? 0.32 : 0.15;
    },
    setMission(progress, complete = false) {
      const values = {
        distance: `${Math.min(2, progress.distance / 1000).toFixed(1)} / 2.0 km`,
        misses: `${Math.min(3, progress.misses)} / 3`,
        rocks: `${Math.min(5, progress.rocks)} / 5`,
      };
      for (const [key, value] of Object.entries(values)) {
        const row = mission.querySelector(`.${key}`);
        row.querySelector('b').textContent = value;
        row.classList.toggle('done', progress[key] >= ({ distance: 2000, misses: 3, rocks: 5 })[key]);
      }
      mission.classList.toggle('complete', complete);
    },
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
    setRolls(charges, max, show = true) {
      // Automatic rolls need no meter and no buttons
      pipsEl.parentElement.style.display = show ? '' : 'none';
      $('.hud-btn.roll-left').style.display = show ? '' : 'none';
      $('.hud-btn.roll-right').style.display = show ? '' : 'none';
      $('.hud-touch-buttons').classList.toggle('no-rolls', !show);
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
      comms.dataset.who = who.toLowerCase();
      commsText.textContent = text;
      comms.classList.add('on');
      commsTimer = seconds;
    },
    dev(text) { dev.textContent = text; },
    setVisible(v) { root.classList.toggle('hidden', !v); },
    dispose() { root.remove(); },
    update(dt) {
      shownScore += (targetScore - shownScore) * Math.min(1, dt * 10);
      scoreEl.textContent = Math.round(shownScore).toLocaleString();
      if (commsTimer > 0 && (commsTimer -= dt) <= 0) comms.classList.remove('on');
      if (zoneTimer > 0 && (zoneTimer -= dt) <= 0) zone.classList.remove('on');
      if (hitTimer > 0 && (hitTimer -= dt) <= 0) hitmarker.classList.remove('on', 'break');
    },
  };
}
