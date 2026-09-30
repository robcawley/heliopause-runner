import './deadzone.css';

// The Dead Zone's HTML layer, on top of the belt run's HUD:
//   banner   the rule change and the beats of the fight (DEAD ZONE, RAIDERS, CARRION, CLEARED)
//   wave     which wave, and a pip per raider still flying
//   boss     Carrion's shield pods and hull
//   marks    a bracket on every raider in view, in its type's colour, with its name the first
//            few seconds and a red ! while it is winding up an attack at you
//   edges    arrows at the screen edge for raiders out of view (red and pulsing if attacking)
//   tether   the grapple prompt and its escape meter
export function createDeadZoneHud(parent) {
  const root = document.createElement('div');
  root.className = 'dz-hud hidden';
  root.innerHTML = `
    <div class='dz-glitch'></div>
    <div class='dz-banner'><b class='dz-title'></b><span class='dz-sub'></span></div>
    <div class='dz-wave'><span class='dz-wave-label'></span><span class='dz-wave-pips'></span></div>
    <div class='dz-boss'>
      <div class='dz-boss-head'><b>Carrion</b><span class='dz-boss-pods'><i></i><i></i></span></div>
      <span class='dz-boss-track'><span class='dz-boss-fill'></span></span>
      <span class='dz-boss-hint'></span>
    </div>
    <div class='dz-marks'></div>
    <div class='dz-edges'></div>
    <div class='dz-tether'><b>Tethered</b><span class='dz-tether-hint'></span><span class='dz-tether-track'><span class='dz-tether-fill'></span></span></div>
  `;
  parent.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const banner = $('.dz-banner'), title = $('.dz-title'), sub = $('.dz-sub');
  const glitchEl = $('.dz-glitch');
  const wave = $('.dz-wave'), waveLabel = $('.dz-wave-label'), wavePips = $('.dz-wave-pips');
  const boss = $('.dz-boss'), bossFill = $('.dz-boss-fill'), bossPods = root.querySelectorAll('.dz-boss-pods i'), bossHint = $('.dz-boss-hint');
  const tetherEl = $('.dz-tether'), tetherHint = $('.dz-tether-hint'), tetherFill = $('.dz-tether-fill');

  const marks = Array.from({ length: 10 }, () => {
    const el = document.createElement('div');
    el.className = 'dz-mark';
    el.innerHTML = `<i></i><i></i><i></i><i></i><span class='dz-mark-name'></span><span class='dz-mark-bang'>!</span><span class='dz-mark-hp'><span></span></span>`;
    $('.dz-marks').appendChild(el);
    return { el, name: el.querySelector('.dz-mark-name'), hp: el.querySelector('.dz-mark-hp span'), shown: false };
  });
  const edges = Array.from({ length: 8 }, () => {
    const el = document.createElement('div');
    el.className = 'dz-edge';
    el.innerHTML = `<svg viewBox='-20 -20 40 40' aria-hidden='true'><path d='M-8 -11 L12 0 L-8 11 L-3 0 Z'/></svg>`;
    $('.dz-edges').appendChild(el);
    return { el, shown: false };
  });

  let bannerTimer = 0, waveText = null, pipCount = -1;
  return {
    root,
    setVisible(v) { root.classList.toggle('hidden', !v); },
    banner(t, s, kind = 'dead', seconds = 4) {
      title.textContent = t;
      sub.textContent = s;
      banner.className = `dz-banner on ${kind}`;
      bannerTimer = seconds;
    },
    glitch() { glitchEl.classList.remove('on'); void glitchEl.offsetWidth; glitchEl.classList.add('on'); },
    setWave(text, left = 0) {
      wave.classList.toggle('on', !!text);
      if (text !== waveText) { waveText = text; waveLabel.textContent = text || ''; }
      if (left !== pipCount) { pipCount = left; wavePips.innerHTML = '<i></i>'.repeat(Math.max(0, left)); }
    },
    setBoss(show, podsLeft = 2, frac = 1, hint = '') {
      boss.classList.toggle('on', show);
      if (!show) return;
      bossPods.forEach((p, i) => p.classList.toggle('on', i < podsLeft));
      bossFill.style.transform = `scaleX(${Math.max(0, frac)})`;
      boss.classList.toggle('shielded', podsLeft > 0);
      bossHint.textContent = hint;
    },
    // list: [{ x, y, size, color, name, hp (0..1 or null), danger, locked }]
    setMarks(list) {
      marks.forEach((m, i) => {
        const d = list[i];
        if (!d) { if (m.shown) { m.el.classList.remove('on'); m.shown = false; } return; }
        m.shown = true;
        m.el.classList.add('on');
        m.el.classList.toggle('danger', !!d.danger);
        m.el.classList.toggle('locked', !!d.locked);
        m.el.style.setProperty('--c', d.color);
        m.el.style.transform = `translate(${d.x - d.size / 2}px, ${d.y - d.size / 2}px)`;
        m.el.style.width = m.el.style.height = `${d.size}px`;
        m.name.textContent = d.name || '';
        m.hp.parentElement.style.display = d.hp == null ? 'none' : '';
        if (d.hp != null) m.hp.style.transform = `scaleX(${Math.max(0, d.hp)})`;
      });
    },
    // list: [{ x, y, angle, color, danger }]
    setEdges(list) {
      edges.forEach((e, i) => {
        const d = list[i];
        if (!d) { if (e.shown) { e.el.classList.remove('on'); e.shown = false; } return; }
        e.shown = true;
        e.el.classList.add('on');
        e.el.classList.toggle('danger', !!d.danger);
        e.el.style.setProperty('--c', d.color);
        e.el.style.transform = `translate(${d.x}px, ${d.y}px) rotate(${d.angle}rad)`;
      });
    },
    setTether(show, frac = 0, hint = '') {
      tetherEl.classList.toggle('on', show);
      if (!show) return;
      tetherHint.textContent = hint;
      tetherFill.style.transform = `scaleX(${Math.min(1, Math.max(0, frac))})`;
    },
    update(dt) { if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) banner.classList.remove('on'); },
    clear() {
      banner.classList.remove('on'); bannerTimer = 0;
      this.setWave(''); this.setBoss(false); this.setMarks([]); this.setEdges([]); this.setTether(false);
    },
    dispose() { root.remove(); },
  };
}
