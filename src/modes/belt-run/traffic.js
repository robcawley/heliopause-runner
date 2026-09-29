import * as THREE from 'three/webgpu';

// Civilian couriers crossing the lane. They stay well clear of the pilot and
// are scenery, not targets: their job is to make the belt feel inhabited.
export function createTraffic(config) {
  const group = new THREE.Group();
  const hull = new THREE.MeshBasicNodeMaterial({ color: 0x9acbd6 });
  const dark = new THREE.MeshBasicNodeMaterial({ color: 0x294052 });
  const glow = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.25, 1.8, 2.2), fog: false });
  const amber = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2.5, 0.7, 0.16), fog: false });
  const exhaust = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.18, 0.85, 1.4), transparent: true, opacity: 0.42, depthWrite: false, fog: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const nose = new THREE.ConeGeometry(0.68, 2.2, 4).rotateX(-Math.PI / 2);

  function part(parent, geo, mat, pos, scale) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  }

  const ships = Array.from({ length: config.world.trafficCount }, (_, i) => {
    const craft = new THREE.Group();
    part(craft, nose, hull, [0, 0, -1.4], [1, 0.7, 1]);
    part(craft, box, dark, [0, 0, 0.7], [1.25, 0.8, 3.2]);
    part(craft, box, hull, [0, -0.05, 0.35], [5.2, 0.12, 1.2]);
    part(craft, box, hull, [-2.1, 0.15, 0.9], [0.16, 0.8, 0.8]);
    part(craft, box, hull, [2.1, 0.15, 0.9], [0.16, 0.8, 0.8]);
    for (const side of [-1, 1]) {
      part(craft, box, glow, [side * 0.39, 0, 2.34], [0.3, 0.3, 0.06]);
      part(craft, box, side < 0 ? amber : glow, [side * 2.43, 0.15, 0.6], [0.11, 0.16, 0.3]);
      part(craft, new THREE.ConeGeometry(0.26, 7, 7).rotateX(Math.PI / 2), exhaust, [side * 0.39, 0, 5.8], [1, 1, 1]);
    }
    craft.scale.setScalar(1.9);
    craft.visible = false;
    group.add(craft);
    return { craft, i, active: false, passed: false, side: 1, direction: 1, speed: 0, baseX: 0, baseY: 0, phase: 0, lastRelativeZ: 0 };
  });

  let timer = 1.6;
  const relative = new THREE.Vector3();
  const handlers = { onPass: () => {}, blocked: () => false };

  function spawn(s, ship) {
    const lane = config.lane.safeRadius;
    s.side = Math.random() < 0.5 ? -1 : 1;
    s.direction = Math.random() < 0.75 ? 1 : -1; // mostly oncoming; occasional overtake
    s.baseX = s.side * (27 + Math.random() * Math.min(25, lane * 0.22));
    s.baseY = (Math.random() - 0.5) * 20;
    s.phase = Math.random() * Math.PI * 2;
    s.speed = s.direction > 0 ? 88 + Math.random() * 42 : 115 + Math.random() * 35;
    s.craft.position.set(
      s.baseX,
      s.baseY,
      ship.pos.z + (s.direction > 0 ? -260 - Math.random() * 160 : 100 + Math.random() * 70),
    );
    s.craft.rotation.set(0, s.direction > 0 ? Math.PI : 0, s.side * 0.035);
    s.craft.visible = s.active = true;
    s.passed = false;
    s.lastRelativeZ = s.craft.position.z - ship.pos.z;
  }

  function reset(ship) {
    timer = 4.5;
    for (const s of ships) { s.active = false; s.craft.visible = false; }
    if (ships[0]) {
      spawn(ships[0], ship);
      ships[0].direction = 1;
      ships[0].speed = 85;
      ships[0].craft.position.z = ship.pos.z - 190;
      ships[0].craft.rotation.y = Math.PI;
      ships[0].lastRelativeZ = -190;
    }
    if (ships[1]) {
      spawn(ships[1], ship);
      ships[1].direction = -1;
      ships[1].speed = 135;
      ships[1].baseX *= -1;
      ships[1].craft.position.set(ships[1].baseX, 8, ship.pos.z + 85);
      ships[1].craft.rotation.y = 0;
      ships[1].lastRelativeZ = 85;
    }
  }

  function update(dt, ship, flying) {
    if (flying) {
      timer -= dt;
      if (timer <= 0) {
        const free = ships.find((s) => !s.active);
        if (free) spawn(free, ship);
        timer = 5 + Math.random() * 3;
      }
    }
    for (const s of ships) {
      if (!s.active) continue;
      s.craft.position.z += s.direction * s.speed * dt;
      s.craft.position.x += (s.baseX + Math.sin(s.craft.position.z * 0.009 + s.phase) * 5 - s.craft.position.x) * Math.min(1, dt * 1.5);
      s.craft.position.y += (s.baseY + Math.cos(s.craft.position.z * 0.006 + s.phase) * 2 - s.craft.position.y) * Math.min(1, dt * 1.5);
      relative.copy(s.craft.position).sub(ship.pos);
      if (!s.passed && s.lastRelativeZ * relative.z <= 0 && Math.abs(relative.z) < 30) {
        s.passed = true;
        if (flying && relative.length() < 145) handlers.onPass(Math.sign(relative.x) || s.side, relative.length());
      }
      s.lastRelativeZ = relative.z;
      if (handlers.blocked(s.craft.position) || relative.lengthSq() > 550 * 550 || (s.passed && Math.abs(relative.z) > 180)) {
        s.active = false;
        s.craft.visible = false;
      }
    }
  }

  return { group, ships, handlers, update, reset };
}
