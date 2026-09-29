import * as THREE from 'three/webgpu';

// PIP, the pilot-intervention probe. A small droid that lives in a hatch on
// the dash. When you stray toward the edge of the beacon lane it pops up and
// offers to fly you home; press R (gamepad Y, or the PIP button on touch) and
// it takes the stick, turns you round and brings you back into the lane, then
// hands control back. Push the stick hard, or press R again, to take over.
//
// PIP also works as a panic button: call it any time you have lost your
// bearings and it will level you out and point you down the lane.
//
// The mode reads `pip.driving` and `pip.stick` each frame; PIP never touches
// the ship directly.
const clamp = THREE.MathUtils.clamp;

function buildModel() {
  const root = new THREE.Group();       // rises and sinks
  const head = new THREE.Group();       // turns to look
  root.add(head);

  const shell = new THREE.MeshStandardNodeMaterial({ color: 0xc9d3dc, roughness: 0.35, metalness: 0.4 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x1b2129, roughness: 0.5, metalness: 0.5 });
  const eyeMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.3, 1.6, 1.5) });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), shell);
  body.scale.set(1, 0.85, 1);
  head.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.009, 8, 32), dark);
  band.rotation.x = Math.PI / 2;
  head.add(band);
  // The eye faces +z, toward the pilot, until PIP turns to look elsewhere
  const socket = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), dark);
  socket.position.set(0, 0.012, 0.066);
  head.add(socket);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), eyeMat);
  eye.position.set(0, 0.012, 0.064);
  head.add(eye);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 6), dark);
  mast.position.set(0.028, 0.08, -0.01);
  mast.rotation.z = -0.25;
  head.add(mast);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), eyeMat);
  tip.position.set(0.036, 0.11, -0.01);
  head.add(tip);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.05), dark);
    fin.position.set(side * 0.071, 0, -0.005);
    head.add(fin);
  }
  // Hatch lid the droid lifts out of
  const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.01, 24), dark);
  root.add(hatch);
  hatch.position.y = -0.07;

  root.traverse((o) => { if (o.isMesh) o.renderOrder = 11; });
  return { root, head, eye, eyeMat };
}

export function createDroid(config) {
  const { root, head, eye, eyeMat } = buildModel();
  const UP = new THREE.Vector3(0.64, -0.43, -0.8);      // ship-local, sitting on the dash
  const DOWN = new THREE.Vector3(0.66, -0.66, -0.8);    // tucked into its hatch
  root.position.copy(DOWN);
  root.scale.setScalar(1.3);
  root.visible = false;

  const pip = {
    group: root,
    state: 'hidden',        // hidden | up | driving
    driving: false,
    stick: { stickX: 0, stickY: 0, roll: 0, boost: false, brake: false },
    rise: 0,                // 0 tucked .. 1 up
    handlers: { onSay: () => {}, onChirp: () => {} },
  };

  const qInv = new THREE.Quaternion();
  const local = new THREE.Vector3();
  const target = new THREE.Vector3();
  const look = new THREE.Vector3();
  const eyeColors = {
    idle: new THREE.Color(0.3, 1.6, 1.5),
    warn: new THREE.Color(2.2, 1.4, 0.3),
    drive: new THREE.Color(0.5, 2.2, 0.6),
  };
  let calmTime = 0, blink = 0, t = 0;

  const say = (text, mood = 'idle') => { pip.handlers.onSay(text); pip.handlers.onChirp(mood); };

  function engage(reason) {
    pip.state = 'driving';
    pip.driving = true;
    say(reason === 'panic' ? 'Got you. Levelling out and heading for the lane.' : 'Hold on. Taking us back to the lane.', 'drive');
  }
  function disengage(text) {
    pip.state = 'up';
    pip.driving = false;
    pip.stick.stickX = pip.stick.stickY = 0; pip.stick.boost = false;
    if (text) say(text);
  }

  pip.reset = () => {
    pip.state = 'hidden'; pip.driving = false; pip.rise = 0; calmTime = 0;
    root.visible = false; root.position.copy(DOWN);
  };

  // Called when the pilot presses the PIP button
  pip.request = () => {
    if (pip.driving) { disengage('Your ship.'); return; }
    engage(pip.state === 'hidden' ? 'panic' : 'home');
  };

  // flying: is a run in progress; input: the pilot's own stick
  pip.update = (dt, ship, laneDist, flying, input) => {
    const D = config.droid, L = config.lane;
    t += dt;
    if (!flying) { if (pip.driving) disengage(); pip.state = 'hidden'; }

    const far = laneDist > L.safeRadius * D.popUpAt;

    if (flying) {
      if (pip.state === 'hidden' && far) {
        pip.state = 'up';
        say('Drifting off the lane. Press R and I\u2019ll fly us back.', 'warn');
      }

      if (pip.driving) {
        // The pilot can always take over
        if (Math.hypot(input.stickX, input.stickY) > D.overrideStick) disengage('Your ship.');
      }

      if (pip.driving) {
        // Steer for a point well inside the lane, some way down it
        const want = L.safeRadius * D.returnTo;
        const k = laneDist > want ? want / laneDist : 1;
        target.set(ship.pos.x * k, ship.pos.y * k, ship.pos.z - 220);
        local.subVectors(target, ship.pos).applyQuaternion(qInv.copy(ship.quat).invert());
        const yawErr = Math.atan2(local.x, -local.z);
        const pitchErr = Math.atan2(local.y, Math.hypot(local.x, local.z));
        pip.stick.stickX = clamp(yawErr * D.steerGain, -1, 1);
        pip.stick.stickY = clamp(pitchErr * D.steerGain, -1, 1);
        pip.stick.roll = 0;
        pip.stick.boost = laneDist > L.safeRadius && Math.abs(yawErr) < 0.35 && Math.abs(pitchErr) < 0.35;

        // Home: inside the lane and pointing down it
        if (laneDist < L.safeRadius * D.handBackAt && ship.fwd.z < -0.8) disengage('Back in the lane. You have control.');
      }

      // Sink back into the hatch after a while safely inside
      calmTime = !far && !pip.driving ? calmTime + dt : 0;
      if (pip.state === 'up' && calmTime > 2.5) pip.state = 'hidden';
    }

    // Rise / sink
    const wantUp = pip.state !== 'hidden';
    pip.rise += ((wantUp ? 1 : 0) - pip.rise) * (1 - Math.exp(-(wantUp ? 9 : 5) * dt));
    root.visible = pip.rise > 0.01;
    // A little overshoot on the way up: the "pop"
    const pop = wantUp ? Math.sin(Math.min(1, pip.rise) * Math.PI) * 0.12 : 0;
    root.position.lerpVectors(DOWN, UP, Math.min(1.1, pip.rise + pop * 0.2));

    // Look at the pilot, or toward home while driving; bob while idle
    if (pip.driving) {
      look.subVectors(target, ship.pos).applyQuaternion(qInv.copy(ship.quat).invert()).normalize();
    } else {
      look.set(-UP.x, -UP.y + 0.1, -UP.z).normalize();          // toward the pilot's eyes
      look.x += Math.sin(t * 0.7) * 0.15;
    }
    const yaw = Math.atan2(look.x, look.z);
    const pitch = -Math.asin(clamp(look.y, -1, 1));
    head.rotation.y += (yaw - head.rotation.y) * (1 - Math.exp(-6 * dt));
    head.rotation.x += (pitch - head.rotation.x) * (1 - Math.exp(-6 * dt));
    head.position.y = Math.sin(t * 2.1) * 0.004;

    // Eye: colour by mood, and an occasional blink
    const mood = pip.driving ? 'drive' : far ? 'warn' : 'idle';
    eyeMat.color.lerp(eyeColors[mood], 1 - Math.exp(-6 * dt));
    blink -= dt;
    if (blink < -3 - Math.random() * 3) blink = 0.12;
    const open = blink > 0 ? 0.15 : 1;
    eye.scale.y = open;
  };

  return pip;
}
