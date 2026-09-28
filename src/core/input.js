import { CONFIG } from '../config.js';

// Input is reduced to intent: a stick (-1..1 on each axis), plus buttons.
// The ship's flight model decides what the stick does, so every device feels
// the same.
//
// Steering modes
//   follow - the mouse is the stick: distance from screen centre is deflection
//   drag   - touch: a virtual stick appears where you put your finger down
//   auto   - follow for a mouse, drag for touch
//
// Rolls: Q / E, double-tap a direction key, gamepad LB / RB, or the touch buttons.
export function createInput(canvas) {
  const state = {
    stickX: 0, stickY: 0,
    boost: false,
    phasePressed: false,        // edge-triggered, consumed by the game
    rollPressed: 0,             // -1 left, +1 right, 0 none
    pausePressed: false,
    mutePressed: false,
    tuningPressed: false,
    lastPointer: 'mouse',
    touchStick: null,           // {x, y, dx, dy} in px, for the HUD to draw
  };

  const keys = new Set();
  let dragId = null, originX = 0, originY = 0, dragX = 0, dragY = 0;
  let pointer = null;           // {nx, ny} pointer offset from centre, in screen-min units
  const lastTap = {};

  const mode = () => {
    const m = CONFIG.flight.steering;
    if (m !== 'auto') return m;
    return state.lastPointer === 'touch' ? 'drag' : 'follow';
  };

  canvas.addEventListener('pointerdown', (e) => {
    state.lastPointer = e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (dragId !== null) {                 // a second finger phases
      if (e.pointerType === 'touch') state.phasePressed = true;
      return;
    }
    dragId = e.pointerId; originX = dragX = e.clientX; originY = dragY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') state.lastPointer = 'mouse';
    const r = canvas.getBoundingClientRect();
    const m = Math.min(r.width, r.height);
    pointer = { nx: (e.clientX - r.left - r.width / 2) / m, ny: (e.clientY - r.top - r.height / 2) / m };
    if (e.pointerId === dragId) { dragX = e.clientX; dragY = e.clientY; }
  });

  const release = (e) => { if (e.pointerId === dragId) dragId = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { pointer = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const DIR_KEYS = { a: -1, arrowleft: -1, d: 1, arrowright: 1 };

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === ' ') { state.phasePressed = true; e.preventDefault(); }
    if (k === 'q') state.rollPressed = -1;
    if (k === 'e') state.rollPressed = 1;
    if (k in DIR_KEYS) {
      const now = performance.now() / 1000;
      const dir = DIR_KEYS[k];
      if (lastTap[dir] && now - lastTap[dir] < CONFIG.roll.doubleTap) { state.rollPressed = dir; lastTap[dir] = 0; }
      else lastTap[dir] = now;
    }
    if (k === 'p' || k === 'escape') state.pausePressed = true;
    if (k === 'm') state.mutePressed = true;
    if (k === 't' || k === '`') state.tuningPressed = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  const padWas = {};
  const edge = (pad, i) => { const now = !!pad.buttons[i]?.pressed; const was = padWas[i]; padWas[i] = now; return now && !was; };

  let keyX = 0, keyY = 0;

  function update(dt) {
    const f = CONFIG.flight;
    let sx = 0, sy = 0;

    // Keys ramp in over ~80 ms so taps can make small corrections
    let kx = 0, ky = 0;
    if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
    if (keys.has('d') || keys.has('arrowright')) kx += 1;
    if (keys.has('w') || keys.has('arrowup')) ky += 1;
    if (keys.has('s') || keys.has('arrowdown')) ky -= 1;
    const kr = 1 - Math.exp(-dt / 0.08);
    keyX += (kx - keyX) * kr; keyY += (ky - keyY) * kr;
    sx += keyX; sy += keyY;
    state.boost = keys.has('shift');

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      sx += dz(pad.axes[0] ?? 0);
      sy -= dz(pad.axes[1] ?? 0);
      if ((pad.buttons[7]?.value ?? 0) > 0.3) state.boost = true;
      if (edge(pad, 0)) state.phasePressed = true;
      if (edge(pad, 4)) state.rollPressed = -1;
      if (edge(pad, 5)) state.rollPressed = 1;
      if (edge(pad, 9)) state.pausePressed = true;
    }

    state.touchStick = null;
    if (mode() === 'drag' && dragId !== null) {
      const dx = dragX - originX, dy = dragY - originY;
      sx += dx / f.touchStickRadius;
      sy -= dy / f.touchStickRadius;
      state.touchStick = { x: originX, y: originY, dx, dy };
    } else if (mode() === 'follow' && pointer && !kx && !ky) {
      sx += pointer.nx / f.stickRadius;
      sy -= pointer.ny / f.stickRadius;
    }

    // Circular clamp, then a radial deadzone that keeps fine control near zero
    let len = Math.hypot(sx, sy);
    if (len > 1) { sx /= len; sy /= len; len = 1; }
    if (len < f.deadzone) { sx = 0; sy = 0; }
    else { const k = (len - f.deadzone) / (1 - f.deadzone) / len; sx *= k; sy *= k; }
    state.stickX = sx; state.stickY = sy;
  }

  function consume(name) {
    const v = state[name];
    state[name] = typeof v === 'number' ? 0 : false;
    return v;
  }

  return { state, update, consume, mode };
}
