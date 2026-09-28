import { CONFIG } from '../config.js';

// Input is reduced to intent: where the pilot wants the ship to be (an aim
// point inside the flight frame), plus a few buttons. The ship's spring decides
// how it gets there, which keeps the feel identical across devices.
//
// Steering modes
//   drag   - v1 style: drag anywhere, the aim point moves with your finger
//   follow - the aim point tracks the pointer's position on screen (mouse)
//   auto   - follow for a mouse, drag for touch
export function createInput(canvas) {
  const state = {
    aimX: 0, aimY: 0,           // desired lateral position, world units
    boost: false,
    phasePressed: false,        // edge-triggered, consumed by the game
    pausePressed: false,
    mutePressed: false,
    tuningPressed: false,
    lastPointer: 'mouse',
  };

  const keys = new Set();
  let dragId = null, lastX = 0, lastY = 0;
  let follow = null;             // {nx, ny} normalised pointer, -1..1

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
    dragId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') state.lastPointer = 'mouse';
    const r = canvas.getBoundingClientRect();
    follow = { nx: ((e.clientX - r.left) / r.width) * 2 - 1, ny: ((e.clientY - r.top) / r.height) * 2 - 1 };
    if (e.pointerId !== dragId || mode() !== 'drag') return;
    const s = CONFIG.flight.dragSensitivity;
    state.aimX += (e.clientX - lastX) * s;
    state.aimY -= (e.clientY - lastY) * s;
    lastX = e.clientX; lastY = e.clientY;
  });

  const release = (e) => { if (e.pointerId === dragId) dragId = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (mode() === 'follow') follow = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === ' ') { state.phasePressed = true; e.preventDefault(); }
    if (k === 'p' || k === 'escape') state.pausePressed = true;
    if (k === 'm') state.mutePressed = true;
    if (k === 't' || k === '`') state.tuningPressed = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  let padPhaseWas = false, padPauseWas = false;

  function update(dt) {
    const f = CONFIG.flight;
    let kx = 0, ky = 0;
    if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
    if (keys.has('d') || keys.has('arrowright')) kx += 1;
    if (keys.has('w') || keys.has('arrowup')) ky += 1;
    if (keys.has('s') || keys.has('arrowdown')) ky -= 1;
    state.boost = keys.has('shift');

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      kx += dz(pad.axes[0] ?? 0);
      ky -= dz(pad.axes[1] ?? 0);
      if ((pad.buttons[7]?.value ?? 0) > 0.3) state.boost = true;
      const phaseNow = !!pad.buttons[0]?.pressed;
      if (phaseNow && !padPhaseWas) state.phasePressed = true;
      padPhaseWas = phaseNow;
      const pauseNow = !!pad.buttons[9]?.pressed;
      if (pauseNow && !padPauseWas) state.pausePressed = true;
      padPauseWas = pauseNow;
    }

    state.aimX += kx * f.keySpeed * dt;
    state.aimY += ky * f.keySpeed * dt;

    if (mode() === 'follow' && follow && !kx && !ky) {
      state.aimX = follow.nx * f.boundsX * 1.1;
      state.aimY = -follow.ny * f.boundsY * 1.1;
    }

    state.aimX = Math.max(-f.boundsX, Math.min(f.boundsX, state.aimX));
    state.aimY = Math.max(-f.boundsY, Math.min(f.boundsY, state.aimY));
  }

  function consume(name) {
    const v = state[name];
    state[name] = false;
    return v;
  }

  return { state, update, consume, mode };
}
