import './board.css';
import './crew.css';
import './chart.css';
import { REGIONS } from '../modes/belt-run/regions.js';

import { renderChart } from './board-chart.js';
import { crewById, hire, dismiss } from './crew.js';
import { raidRow, slipNotes, renderCrew, renderWanted } from './board-crew.js';
import { POWERS, TOWNS, RANKS, UPGRADES, standingIn, clock, holdOf, upgradeState, buy, shipStats, trustedTowns, makeFerry } from './career.js';

// The settlement board: shown after every landing (with the pay slip) and at the start of a
// career (without). Three contracts; pick one, then launch. The art follows docs/TYCOON.md:
// dust haze, a white-hot sun, a refinery on the horizon, smoke drifting on the wind.

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const cr = (n) => n.toLocaleString('en-GB');
const signed = (n) => (n < 0 ? `\u2212${cr(-n)}` : `+${cr(n)}`);

const ART = `
<div class="board-art" aria-hidden="true">
  <div class="board-sun"></div>
  <svg class="board-skyline" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice">
    <path d="M0 150 L90 132 L170 141 L260 118 L330 129 L420 110 L520 132 L610 121 L700 135 L790 116 L880 128 L990 108 L1080 126 L1170 113 L1260 130 L1350 117 L1440 132 L1440 220 L0 220 Z" fill="#c8ad86" opacity="0.75"/>
    <g fill="#6d5846" opacity="0.9">
      <rect x="930" y="78" width="16" height="142"/><rect x="962" y="50" width="11" height="170"/><rect x="990" y="92" width="54" height="128"/>
      <rect x="1060" y="22" width="18" height="198"/><rect x="1056" y="16" width="26" height="10"/><rect x="1094" y="110" width="120" height="110"/>
      <rect x="1110" y="84" width="40" height="28"/><rect x="1168" y="66" width="12" height="46"/><rect x="1230" y="40" width="14" height="180"/>
      <rect x="1262" y="120" width="70" height="100"/><rect x="1350" y="98" width="12" height="122"/><rect x="150" y="110" width="10" height="110"/>
      <rect x="138" y="148" width="40" height="72"/>
    </g>
  </svg>
  <span class="board-smoke s1"></span><span class="board-smoke s2"></span><span class="board-smoke s3"></span>
  <span class="board-smoke s4"></span><span class="board-smoke s5"></span>
  <div class="board-dust"></div>
</div>`;

export function createBoard(parent, { onLaunch, onReset, onChange = () => {} }) {
  const el = document.createElement('section');
  el.id = 'board';
  el.className = 'board';
  el.setAttribute('aria-live', 'polite');
  parent.appendChild(el);

  let career = null, picked = null, current = null;
  let view = 'board', category = 'All', toast = '', chartSel = null;   // the market view's state

  // The header every screen shares: brand, credits, and that screen's navigation
  const NAV = '<button type="button" class="board-nav" data-go="chart">Chart</button><button type="button" class="board-nav" data-go="crew">Crew</button><button type="button" class="board-nav" data-go="wanted">Wanted</button><button type="button" class="board-nav" data-go="market">Shipwright&#39;s market</button>';
  const BACK = '<button type="button" class="board-nav" data-go="board">← Contracts</button>';
  function top(nav) {
    return `<header class="board-top">
        <div class="board-brand"><svg width="22" height="22" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 2 L24 22 L2 22 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M13 10 L13 16" stroke="currentColor" stroke-width="2.4"/></svg>Heliopause Runners Co.</div>
        <div class="board-top-right"><div class="board-credits"><span>Credits</span><b>${cr(career.credits)}</b></div>${nav}</div>
      </header>`;
  }

  function card(k, i) {
    const power = POWERS[TOWNS[k.to].power];
    const on = picked === i;
    const tooHeavy = k.tons > holdOf(career);
    const pips = [1, 2, 3].map((n) => `<span class="pip${n <= k.level ? ' on' : ''}"></span>`).join('');
    const time = k.deadline ? `Deadline ${clock(k.deadline)}` : `About ${clock(k.est)}`;
    return `
    <button type="button" class="board-card tier-${k.tier} diff-${k.difficulty}${on ? ' picked' : ''}${tooHeavy ? ' too-heavy' : ''}" data-i="${i}" aria-pressed="${on}"${tooHeavy ? ' aria-disabled="true"' : ''}>
      <span class="card-head"><span class="card-tier">${esc(k.tierLabel)}</span><span class="card-diff"><span class="pips">${pips}</span>${esc(k.difficultyLabel)}</span></span>
      <span class="card-job">${esc(k.job)}</span>
      <span class="card-dest">to ${esc(k.to)} \u00b7 ${(k.distance / 1000).toFixed(1)} km</span>
      <span class="card-rows">
        <span class="k">Held by</span><span><i class="swatch" style="background:${power.color}"></i>${esc(power.name)}</span>
        <span class="k">Cargo</span><span>${esc(k.cargo)}, ${k.tons} t${k.heavy ? '. <em>Heavy: shudders near giant rocks</em>' : ''}</span>
        <span class="k">Lane</span><span>${esc(k.lane)}</span>
        <span class="k">Region</span><span>${esc(REGIONS[TOWNS[k.to]?.power]?.name ?? '')}: ${esc((REGIONS[TOWNS[k.to]?.power]?.hazard ?? '').toLowerCase())}</span>
        ${raidRow(career, k, esc)}
        <span class="k">Time</span><span${k.deadline ? ' class="urgent"' : ''}>${time}${k.deadline ? ' or half pay' : ''}</span>
        <span class="k">Standing</span><span>+${k.standing} ${esc(k.to)}</span>
      </span>
      <span class="card-pay">${cr(k.pay)} cr</span>
      <span class="card-take">${tooHeavy ? `Needs a cargo frame (hold ${holdOf(career)} t)` : on ? 'Contract taken' : 'Take contract'}</span>
    </button>`;
  }

  function slipPanel(slip) {
    const rank = RANKS[slip.standing];
    const bar = RANKS.slice(1).map((_, i) => `<span class="${i < slip.standing ? 'on' : ''}"></span>`).join('');
    return `
    <section class="board-slip" aria-label="Pay slip">
      <div class="slip-head"><h3>Pay slip</h3><span>${esc(slip.contract.job)}</span></div>
      <dl class="slip-lines">
        ${slip.lines.map((l) => `<dt>${esc(l.label)}${l.note ? ` <span>(${esc(l.note)})</span>` : ''}</dt><dd class="${l.amount < 0 ? 'minus' : ''}">${signed(l.amount)}</dd>`).join('')}
      </dl>
      <div class="slip-rule"></div>
      <div class="slip-paid"><span>Paid</span><b>${signed(slip.total)} cr</b></div>
      <div class="slip-balance"><span>Balance</span><span>${cr(slip.before)} \u2192 <b>${cr(slip.after)}</b></span></div>
      <div class="slip-standing">
        <div class="slip-standing-row"><span>Standing in ${esc(slip.town)}</span><span>${esc(rank)} \u00b7 ${slip.standing} of 5</span></div>
        <div class="slip-bar">${bar}</div>
        ${slip.unlocked.length ? `<p class="slip-unlock">New route open: ${slip.unlocked.map(esc).join(', ')}</p>` : ''}
        ${slipNotes(slip, esc)}
      </div>
    </section>`;
  }

  function render(slip) {
    if (view === 'market') return renderMarket();
    if (view === 'crew' || view === 'wanted') return renderStrategy();
    if (view === 'chart') return renderChartView();
    const c = career, town = c.town, power = POWERS[TOWNS[town].power];
    const sub = slip
      ? `${slip.contract.ferry ? 'Flew in empty' : `${esc(slip.contract.cargo)} delivered`} \u00b7  ${(slip.contract.distance / 1000).toFixed(1)} km in ${clock(slip.time)} \u00b7 hull ${slip.hull}%${slip.late ? ' \u00b7 late' : ''}`
      : `${esc(power.name)} ground. ${esc(RANKS[standingIn(c, town)])} here. Pick a job.`;
    const chosen = picked === null ? null : c.offers[picked];
    el.innerHTML = `${ART}
    <div class="board-inner">
      ${top(NAV)}
      <div class="board-hero">
        <p class="board-kicker">${slip ? 'Landed at' : 'Contracts at'}</p>
        <h2>${esc(town)}</h2>
        <p class="board-sub">${sub}</p>
      </div>
      <div class="board-grid${slip ? '' : ' no-slip'}">
        ${slip ? slipPanel(slip) : ''}
        <section class="board-offers" aria-label="Contracts">
          <div class="offers-head"><h3>Contracts out of ${esc(town)}</h3><span>Take one. New offers at the next town.</span></div>
          <div class="board-cards">${c.offers.map(card).join('')}</div>
          <div class="board-foot">
            <span class="board-status">${chosen ? `Cargo loading for ${esc(chosen.to)}.` : 'No contract taken yet.'}</span>
            <button type="button" class="board-launch"${chosen ? '' : ' disabled'}>${chosen ? `Launch to ${esc(chosen.to)}` : 'Launch'}</button>
          </div>
          <button type="button" class="board-reset">New career</button>
        </section>
      </div>
    </div>`;
    wireNav();
    el.querySelectorAll('.board-card').forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('too-heavy')) return;
      const i = Number(b.dataset.i);
      picked = picked === i ? null : i;
      render(slip);
      el.querySelector(`.board-card[data-i="${i}"]`)?.focus();
    }));
    el.querySelector('.board-launch').addEventListener('click', launch);
    el.querySelector('.board-reset').addEventListener('click', () => {
      if (confirm('Start a new career? Credits and standing go back to the beginning.')) onReset();
    });
    current = slip;
  }

  function wireNav() {
    el.querySelectorAll('.board-nav').forEach((b) => b.addEventListener('click', () => {
      view = b.dataset.go;
      toast = '';
      render(current);
      el.scrollTop = 0;
      el.querySelector('.board-nav')?.focus({ preventScroll: true });
    }));
  }

    // The navigation chart (board-chart.js): inspect a town, take its contract, or ferry there
  function renderChartView() {
    const names = Object.keys(TOWNS);
    el.innerHTML = renderChart(career, { esc, cr, art: ART, top, back: BACK, toast }, chartSel);
    wireNav();
    el.querySelectorAll('.chart-town').forEach((b) => b.addEventListener('click', () => {
      chartSel = names[Number(b.dataset.t)];
      toast = '';
      renderChartView();
      el.querySelector(`.chart-town[data-t="${b.dataset.t}"]`)?.focus({ preventScroll: true });
    }));
    el.querySelector('.chart-take')?.addEventListener('click', (e) => {
      picked = Number(e.currentTarget.dataset.i);
      view = 'board';
      render(current);
      el.querySelector(`.board-card[data-i="${picked}"]`)?.focus();
    });
    el.querySelector('.chart-ferry')?.addEventListener('click', () => {
      const k = makeFerry(career, chartSel);
      if (!k) return;
      if (!confirm(`Fly empty to ${chartSel}? About ${cr(k.fuel)} cr of fuel comes off the pay slip when you land. No fee, no standing.`)) return;
      onLaunch(k);
    });
  }

  // Crew quarters and the wanted board (board-crew.js draws them; crew.js holds the rules)
  function renderStrategy() {
    const h = { esc, cr, art: ART, top, back: BACK, toast };
    el.innerHTML = view === 'crew' ? renderCrew(career, h) : renderWanted(career, h);
    wireNav();
    el.querySelectorAll('.crew-hire').forEach((b) => b.addEventListener('click', () => {
      const m = crewById(b.dataset.id);
      if (!hire(career, m.id)) return;
      toast = `${m.name} signed on. ${cr(m.hire)} cr paid.`;
      onChange(career);
      renderStrategy();
    }));
    el.querySelectorAll('.crew-dismiss').forEach((b) => b.addEventListener('click', () => {
      const m = crewById(b.dataset.id);
      if (!confirm(`Let ${m.name} go? The hiring fee is not refunded.`)) return;
      dismiss(career, m.id);
      toast = `${m.name} packed a bag and left.`;
      onChange(career);
      renderStrategy();
    }));
  }

  function renderMarket() {
    const c = career;
    const cats = ['All', ...new Set(UPGRADES.map((u) => u.cat))];
    const items = UPGRADES.filter((u) => category === 'All' || u.cat === category);
    const upCard = (u) => {
      const st = upgradeState(c, u);
      const label = st === 'owned' ? 'Fitted' : st === 'locked' ? 'Locked' : st === 'poor' ? `Need ${cr(u.price - c.credits)} more` : 'Buy';
      const note = st === 'locked' ? `Needs Trusted standing in ${u.needsTrusted} towns (you have ${trustedTowns(c)})` : u.note;
      return `
      <article class="up-card is-${st}">
        <div class="up-head"><span>${esc(u.cat)}</span><span class="up-badge">${st === 'owned' ? 'Fitted' : st === 'locked' ? 'Locked' : ''}</span></div>
        <h3>${esc(u.name)}</h3>
        <p class="up-stat"><span>${esc(u.stat)}</span> ${esc(u.from)} \u2192 <b>${esc(u.to)}</b></p>
        <p class="up-note">${esc(note)}</p>
        <div class="up-foot"><span class="up-price">${st === 'owned' ? '' : `${cr(u.price)} cr`}</span>
          <button type="button" class="up-buy" data-id="${u.id}"${st === 'buy' ? '' : ' disabled'}>${esc(label)}</button></div>
      </article>`;
    };
    el.innerHTML = `${ART}
    <div class="board-inner">
      ${top(BACK)}
      <div class="board-hero">
        <p class="board-kicker">Shipwright's market</p>
        <h2>The yards</h2>
        <p class="board-sub">${esc(c.town)} shipwrights \u00b7 prices include fitting \u00b7 better stock as your standing grows</p>
      </div>
      <div class="market-grid">
        <section class="ship-panel" aria-label="Your ship">
          <div class="slip-head"><h3>Your ship</h3><span>RS-7 Runner</span></div>
          <svg class="ship-plan" viewBox="0 0 324 150" role="img" aria-label="Your ship, from above"><path d="M162 10 L178 58 L262 92 L262 104 L178 96 L172 132 L152 132 L146 96 L62 104 L62 92 L146 58 Z" fill="rgba(239,228,208,0.08)" stroke="#d9c8aa" stroke-width="1.6"/><path d="M162 30 L170 58 L154 58 Z" fill="none" stroke="#d9c8aa" stroke-width="1.2"/><path d="M92 98 L92 88 M232 98 L232 88" stroke="#e58a3a" stroke-width="3"/></svg>
          <dl class="ship-stats">${shipStats(c).map(([k, v, up]) => `<dt>${esc(k)}</dt><dd class="${up ? 'up' : ''}">${esc(v)}</dd>`).join('')}</dl>
          <p class="ship-toast" aria-live="polite">${esc(toast || 'Upgrades are fitted before your next launch.')}</p>
        </section>
        <section class="market-items" aria-label="Upgrades">
          <div class="chips" role="group" aria-label="Filter by part">${cats.map((k) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${k === category}">${k}</button>`).join('')}</div>
          <div class="up-grid">${items.map(upCard).join('')}</div>
        </section>
      </div>
    </div>`;
    wireNav();
    el.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { category = b.dataset.cat; renderMarket(); el.querySelector(`.chip[data-cat="${category}"]`)?.focus(); }));
    el.querySelectorAll('.up-buy').forEach((b) => b.addEventListener('click', () => {
      const u = UPGRADES.find((x) => x.id === b.dataset.id);
      if (!buy(career, u.id)) return;
      toast = `${u.name} fitted. ${cr(u.price)} cr paid.`;
      onChange(career);
      renderMarket();
    }));
  }

  function launch() {
    if (picked === null || !career) return;
    const k = career.offers[picked];
    onLaunch(k);
  }

  return {
    el,
    show(c, slip = null) {
      career = c;
      picked = null;
            view = 'board';
      toast = '';
      chartSel = null;
      render(slip);
      el.scrollTop = 0;
      el.classList.add('on');
      setTimeout(() => el.querySelector('.board-card')?.focus({ preventScroll: true }), 50);
    },
    refresh(c) { career = c; picked = null; render(current); },
    hide() { el.classList.remove('on'); },
    get open() { return el.classList.contains('on'); },
    // Enter / A / Start: launch if a contract is taken, else take the focused one
    confirm() {
      if (view !== 'board') return;
      if (picked !== null) return launch();
      const f = document.activeElement?.closest?.('.board-card');
      if (f) f.click();
    },
  };
}
