// Input is reduced to intent: a stick (-1..1 on each axis), a roll axis, a
// fire trigger, plus edge-triggered actions. Modes decide what they mean.
//
// Steering modes (options.steering)
//   mouse  - pointer lock: moving the mouse pushes a virtual stick, which
//            eases back to centre on its own (options.mouseRecentre), so the
//            ship never keeps spinning because the pointer was left off-centre.
//            Click the view to capture the mouse; Esc releases it.
//   follow - no capture: the pointer's distance from screen centre is the stick
//   drag   - touch: a virtual stick appears where you put your finger down
//   auto   - mouse when captured, follow when not, drag for touch
//
// Actions: phase, rollLeft, rollRight, droid, pause, escape, mute, tuning, lockLost.
// options is read live every frame, so a tuning panel can change it.
export function createInput(canvas, options) {
  const state = {
    stickX: 0, stickY: 0,
    roll: 0,                    // -1 roll left .. +1 roll right
    fire: false,
    boost: false, brake: false,
    lastPointer: 'mouse',
    device: 'keyboard',
    locked: false,              // pointer lock active
    mouseStick: null,           // {x, y} virtual stick while captured, for a HUD to draw
    touchStick: null,           // {x, y, dx, dy} in px, for a HUD to draw
  };
  const pressed = new Set();

  const keys = new Set();
  let dragId = null, originX = 0, originY = 0, dragX = 0, dragY = 0;
  let pointer = null;
  let mouseDown = false;
  let vsx = 0, vsy = 0;
  let tsx = 0, tsy = 0;          // smoothed touch stick         // virtual stick under pointer lock
  let captureEnabled = true;
  let touchBoost = false, touchBrake = false;
  const lastTap = {};
  const listeners = [];
  const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push(() => target.removeEventListener(type, fn, opts)); };

  const mode = () => {
    const m = options.steering;
    if (m !== 'auto') return m;
    if (state.lastPointer === 'touch') return 'drag';
    return state.locked ? 'mouse' : 'follow';
  };

  listen(document, 'pointerlockchange', () => {
    const was = state.locked;
    state.locked = document.pointerLockElement === canvas;
    vsx = vsy = 0;
    if (was && !state.locked) { pressed.add('lockLost'); mouseDown = false; }
  });

  listen(canvas, 'pointerdown', (e) => {
    state.lastPointer = e.pointerType === 'touch' ? 'touch' : 'mouse';
    state.device = e.pointerType === 'touch' ? 'touch' : 'keyboard';
    if (e.pointerType !== 'touch') {
      const wantsLock = captureEnabled && (options.steering === 'auto' || options.steering === 'mouse');
      if (wantsLock && !state.locked) { canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
      if (e.button === 0) mouseDown = true;
      return;
    }
    // The right side belongs to the action buttons: a thumb that misses one does nothing
    if (e.clientX > innerWidth * 0.55) return;
    if (dragId !== null) { pressed.add('phase'); return; }   // a second finger on the left phases
    dragId = e.pointerId; originX = dragX = e.clientX; originY = dragY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  listen(window, 'pointerdown', (e) => {
    state.device = e.pointerType === 'touch' ? 'touch' : 'keyboard';
    state.lastPointer = e.pointerType === 'touch' ? 'touch' : 'mouse';
  }, true);
  listen(canvas, 'pointermove', (e) => {
    if (e.pointerType !== 'touch') {
      state.lastPointer = 'mouse';
      // Real mouse movement takes control back from a controller (a click or key is not needed)
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) state.device = 'keyboard';
    }
    if (state.locked) {
      const range = options.mouseRange || 260;
      vsx += e.movementX / range;
      vsy -= e.movementY / range;
      const len = Math.hypot(vsx, vsy);
      if (len > 1) { vsx /= len; vsy /= len; }
      return;
    }
    const r = canvas.getBoundingClientRect();
    const m = Math.min(r.width, r.height);
    pointer = { nx: (e.clientX - r.left - r.width / 2) / m, ny: (e.clientY - r.top - r.height / 2) / m };
    if (e.pointerId === dragId) { dragX = e.clientX; dragY = e.clientY; }
  });
  const release = (e) => {
    if (e.pointerId === dragId) dragId = null;
    if (e.pointerType !== 'touch' && e.button === 0) mouseDown = false;
  };
  listen(canvas, 'pointerup', release);
  listen(canvas, 'pointercancel', release);
  listen(canvas, 'pointerleave', () => { pointer = null; });
  listen(canvas, 'contextmenu', (e) => e.preventDefault());

  // Double-tap any of these for a barrel roll that way
  // (Q / E always; A / D and the arrows only if options.doubleTapSteerKeys, because
  // quick corrective taps on the steering keys kept firing rolls by accident)
  const ROLL_KEYS = { KeyQ: 'rollLeft', KeyE: 'rollRight' };
  const STEER_ROLL_KEYS = { KeyA: 'rollLeft', ArrowLeft: 'rollLeft', KeyD: 'rollRight', ArrowRight: 'rollRight' };

  listen(window, 'keydown', (e) => {
    if (e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (e.repeat) return;
    // Physical key positions (e.code): WASD sits in the same place on any layout, and a
    // modifier pressed mid-hold can never leave a key stuck down
    const k = e.code;
    state.device = 'keyboard';
    keys.add(k);
    if (k === 'Space') { pressed.add('phase'); e.preventDefault(); }
    const dodge = ROLL_KEYS[k] || (options.doubleTapSteerKeys ? STEER_ROLL_KEYS[k] : null);
    if (dodge) {
      const now = performance.now() / 1000;
      if (lastTap[k] && now - lastTap[k] < (options.doubleTap ?? 0.24)) { pressed.add(dodge); lastTap[k] = 0; }
      else lastTap[k] = now;
    }
    if (k === 'KeyR') pressed.add('droid');
    if (k === 'KeyP') pressed.add('pause');
    if (k === 'Escape') pressed.add('escape');           // pause only, never un-pause (Esc also releases the mouse)
    if (k === 'KeyM') pressed.add('mute');
    if (k === 'KeyT' || k === 'Backquote') pressed.add('tuning');
  });
  listen(window, 'keyup', (e) => keys.delete(e.code));
  listen(window, 'blur', () => { keys.clear(); mouseDown = false; });

  const padWas = {};
  const padRest = new Map();     // each pad's resting axes, so drift or a -1 resting axis is not "activity"
  listen(window, 'gamepaddisconnected', (e) => padRest.delete(e.gamepad.index));
  const edge = (pad, i) => { const now = !!pad.buttons[i]?.pressed; const was = padWas[i]; padWas[i] = now; return now && !was; };
  let keyX = 0, keyY = 0, keyR = 0;
  const padTap = {};
  let touchFire = false;

  function update(dt) {
    let sx = 0, sy = 0;

    // Keys ramp in over ~70 ms: taps make small corrections, holds turn hard
    let kx = 0, ky = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) ky += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) ky -= 1;
    const kr = 1 - Math.exp(-dt / 0.07);
    keyX += (kx - keyX) * kr; keyY += (ky - keyY) * kr;
    sx += keyX; sy += keyY;
    const kroll = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    keyR += (kroll - keyR) * kr;
    let roll = keyR;
    state.boost = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchBoost;
    state.brake = keys.has('KeyX') || touchBrake;   // not Ctrl: Ctrl+W closes the tab on Windows and cannot be blocked
    state.fire = mouseDown || keys.has('KeyF') || touchFire;

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      if (!padRest.has(pad.index)) padRest.set(pad.index, pad.axes.slice());
      const rest = padRest.get(pad.index);
      const padActive = pad.axes.some((v, i) => Math.abs(v - (rest[i] ?? 0)) > 0.35) || pad.buttons.some((b) => b.pressed);
      if (padActive) state.device = 'gamepad';
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
      sx += dz(pad.axes[0] ?? 0);
      sy -= dz(pad.axes[1] ?? 0);
      if ((pad.buttons[7]?.value ?? 0) > 0.3) state.fire = true;      // RT fire
      if ((pad.buttons[6]?.value ?? 0) > 0.3) state.brake = true;     // LT brake
      if (pad.buttons[1]?.pressed || pad.buttons[2]?.pressed) state.boost = true; // B / X boost
      if (edge(pad, 0)) { pressed.add('phase'); pressed.add('confirm'); } // A phase / menu confirm
      if (edge(pad, 3)) pressed.add('droid');                          // Y droid
      if (edge(pad, 9)) pressed.add('pause');
      // Bumpers: hold to roll, double-tap for a barrel roll
      roll += (pad.buttons[5]?.pressed ? 1 : 0) - (pad.buttons[4]?.pressed ? 1 : 0);
      for (const [b, act] of [[4, 'rollLeft'], [5, 'rollRight']]) {
        if (edge(pad, b)) {
          const now = performance.now() / 1000;
          if (padTap[b] && now - padTap[b] < (options.doubleTap ?? 0.24)) { pressed.add(act); padTap[b] = 0; }
          else padTap[b] = now;
        }
      }
    }

    state.touchStick = null;
    state.mouseStick = null;
    const m = mode();
    let touching = false;
    if (m === 'drag' && dragId !== null) {
      // Thumbs wobble and phone screens are small, so the touch stick is lightly smoothed
      // and has its own reach, deadzone and centre curve (options.touch*)
      const dx = dragX - originX, dy = dragY - originY;
      const tau = options.touchSmoothing ?? 0;
      const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
      tsx += (dx / options.touchStickRadius - tsx) * k;
      tsy += (-dy / options.touchStickRadius - tsy) * k;
      sx += tsx; sy += tsy;
      touching = true;
      state.touchStick = { x: originX, y: originY, dx, dy };
    } else if (m === 'mouse' && state.device === 'keyboard') {
      tsx = 0; tsy = 0;
      // The virtual stick eases home, so a forgotten mouse never means a forgotten turn
      const k = Math.exp(-(options.mouseRecentre ?? 1) * dt);
      vsx *= k; vsy *= k;
      sx += vsx; sy += vsy;
      state.mouseStick = { x: vsx, y: vsy };
    } else if (m === 'follow' && pointer && state.device === 'keyboard' && !kx && !ky) {
      sx += pointer.nx / options.stickRadius;
      sy -= pointer.ny / options.stickRadius;
    }

    // Circular clamp, radial deadzone, then a response curve: fine near the
    // centre for aiming, full authority at the edge for hard turns
    let len = Math.hypot(sx, sy);
    if (len > 1) { sx /= len; sy /= len; len = 1; }
    const deadzone = touching ? (options.touchDeadzone ?? options.deadzone) : options.deadzone;
    const curve = touching ? (options.touchCurve ?? options.stickCurve ?? 1) : (options.stickCurve ?? 1);
    if (!touching) { tsx = 0; tsy = 0; }
    if (len < deadzone) { sx = 0; sy = 0; }
    else {
      const t = (len - deadzone) / (1 - deadzone);
      const curved = Math.pow(t, curve);
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
    setTouchFire(v) { touchFire = v; },
    setTouchBoost(v) { touchBoost = v; },
    setTouchBrake(v) { touchBrake = v; },
    consume(action) { const had = pressed.has(action); pressed.delete(action); return had; },
    // Forget queued gameplay presses and half-finished double-taps (a pause screen swallowed them)
    clearActions() {
      for (const a of ['phase', 'rollLeft', 'rollRight', 'droid']) pressed.delete(a);
      for (const k in lastTap) lastTap[k] = 0;
      for (const k in padTap) padTap[k] = 0;
    },
    // The host turns capture off behind menus and releases it for pause / debrief
    setCapture(enabled) { captureEnabled = enabled; if (!enabled) this.release(); },
    release() { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
    dispose() { this.release(); listeners.forEach((off) => off()); },
  };
}
