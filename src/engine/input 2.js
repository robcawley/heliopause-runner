// Input is reduced to intent: a stick (-1..1 on each axis), a roll axis, plus actions.
// Modes decide what the stick means; for the belt run it turns the ship.
//
// Steering modes (options.steering)
//   follow - the mouse is the stick: distance from screen centre is deflection
//   drag   - touch: a virtual stick appears where you put your finger down
//   auto   - follow for a mouse, drag for touch
//
// options is read live every frame, so a tuning panel can change it.
export function createInput(canvas, options) {
  const state = {
    stickX: 0, stickY: 0,
    roll: 0,                    // -1 roll left .. +1 roll right
    boost: false, brake: false,
    lastPointer: 'mouse',
    touchStick: null,           // {x, y, dx, dy} in px, for a HUD to draw
  };
  const pressed = new Set();    // edge-triggered actions: phase, rollLeft, rollRight, pause, mute, tuning

  const keys = new Set();
  let dragId = null, originX = 0, originY = 0, dragX = 0, dragY = 0;
  let pointer = null;
  const lastTap = {};
  const listeners = [];
  const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push(() => target.removeEventListener(type, fn, opts)); };

  const mode = () => {
    const m = options.steering;
    if (m !== 'auto') return m;
    return state.lastPointer === 'touch' ? 'drag' : 'follow';
  };

  listen(canvas, 'pointerdown', (e) => {
    state.lastPointer = e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (dragId !== null) { if (e.pointerType === 'touch') pressed.add('phase'); return; }
    dragId = e.pointerId; originX = dragX = e.clientX; originY = dragY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  listen(canvas, 'pointermove', (e) => {
    if (e.pointerType !== 'touch') state.lastPointer = 'mouse';
    const r = canvas.getBoundingClientRect();
    const m = Math.min(r.width, r.height);
    pointer = { nx: (e.clientX - r.left - r.width / 2) / m, ny: (e.clientY - r.top - r.height / 2) / m };
    if (e.pointerId === dragId) { dragX = e.clientX; dragY = e.clientY; }
  });
  const release = (e) => { if (e.pointerId === dragId) dragId = null; };
  listen(canvas, 'pointerup', release);
  listen(canvas, 'pointercancel', release);
  listen(canvas, 'pointerleave', () => { pointer = null; });
  listen(canvas, 'contextmenu', (e) => e.preventDefault());

  // Double-tap any of these for a barrel roll that way
  const DIR_KEYS = { a: 'rollLeft', arrowleft: 'rollLeft', q: 'rollLeft', d: 'rollRight', arrowright: 'rollRight', e: 'rollRight' };

  listen(window, 'keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === ' ') { pressed.add('phase'); e.preventDefault(); }
    if (k in DIR_KEYS) {
      const now = performance.now() / 1000;
      if (lastTap[k] && now - lastTap[k] < (options.doubleTap ?? 0.24)) { pressed.add(DIR_KEYS[k]); lastTap[k] = 0; }
      else lastTap[k] = now;
    }
    if (k === 'p' || k === 'escape') pressed.add('pause');
    if (k === 'm') pressed.add('mute');
    if (k === 't' || k === '`') pressed.add('tuning');
  });
  listen(window, 'keyup', (e) => keys.delete(e.key.toLowerCase()));
  listen(window, 'blur', () => keys.clear());

  const padWas = {};
  const edge = (pad, i) => { const now = !!pad.buttons[i]?.pressed; const was = padWas[i]; padWas[i] = now; return now && !was; };
  let keyX = 0, keyY = 0, keyR = 0;
  const padTap = {};

  function update(dt) {
    let sx = 0, sy = 0;

    // Keys ramp in over ~70 ms: taps make small corrections, holds turn hard
    let kx = 0, ky = 0;
    if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
    if (keys.has('d') || keys.has('arrowright')) kx += 1;
    if (keys.has('w') || keys.has('arrowup')) ky += 1;
    if (keys.has('s') || keys.has('arrowdown')) ky -= 1;
    const kr = 1 - Math.exp(-dt / 0.07);
    keyX += (kx - keyX) * kr; keyY += (ky - keyY) * kr;
    sx += keyX; sy += keyY;
    const kroll = (keys.has('e') ? 1 : 0) - (keys.has('q') ? 1 : 0);
    keyR += (kroll - keyR) * kr;
    let roll = keyR;
    state.boost = keys.has('shift');
    state.brake = keys.has('control') || keys.has('x');

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      sx += dz(pad.axes[0] ?? 0);
      sy -= dz(pad.axes[1] ?? 0);
      if ((pad.buttons[7]?.value ?? 0) > 0.3) state.boost = true;
      if ((pad.buttons[6]?.value ?? 0) > 0.3) state.brake = true;
      if (edge(pad, 0)) pressed.add('phase');
      // Bumpers: hold to roll, double-tap for a barrel roll
      roll += (pad.buttons[5]?.pressed ? 1 : 0) - (pad.buttons[4]?.pressed ? 1 : 0);
      for (const [b, act] of [[4, 'rollLeft'], [5, 'rollRight']]) {
        if (edge(pad, b)) {
          const now = performance.now() / 1000;
          if (padTap[b] && now - padTap[b] < (options.doubleTap ?? 0.24)) { pressed.add(act); padTap[b] = 0; }
          else padTap[b] = now;
        }
      }
      if (edge(pad, 9)) pressed.add('pause');
    }

    state.touchStick = null;
    if (mode() === 'drag' && dragId !== null) {
      const dx = dragX - originX, dy = dragY - originY;
      sx += dx / options.touchStickRadius;
      sy -= dy / options.touchStickRadius;
      state.touchStick = { x: originX, y: originY, dx, dy };
    } else if (mode() === 'follow' && pointer && !kx && !ky) {
      sx += pointer.nx / options.stickRadius;
      sy -= pointer.ny / options.stickRadius;
    }

    // Circular clamp, radial deadzone, then a response curve: fine near the
    // centre for aiming, full authority at the edge for hard turns
    let len = Math.hypot(sx, sy);
    if (len > 1) { sx /= len; sy /= len; len = 1; }
    if (len < options.deadzone) { sx = 0; sy = 0; }
    else {
      const t = (len - options.deadzone) / (1 - options.deadzone);
      const curved = Math.pow(t, options.stickCurve ?? 1);
      sx *= curved / len; sy *= curved / len;
    }
    state.stickX = sx; state.stickY = sy;
    state.roll = Math.max(-1, Math.min(1, roll));
  }

  return {
    state,
    update,
    mode,
    press(action) { pressed.add(action); },           // for on-screen buttons
    consume(action) { const had = pressed.has(action); pressed.delete(action); return had; },
    dispose() { listeners.forEach((off) => off()); },
  };
}
