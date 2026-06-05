"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type CameraMode = "CHASE" | "COMMAND" | "CINEMATIC";

interface BattlefieldControls {
  paused: boolean;
  cameraMode: CameraMode;
  thermal: boolean;
}

interface BattlefieldCommands {
  reset: boolean;
  fireNow: boolean;
}

interface ArmoredVehicleRig {
  group: THREE.Group;
  hull: THREE.Mesh;
  turret: THREE.Group;
  barrel: THREE.Mesh;
  wheels: THREE.Mesh[];
  trackBelts: THREE.Mesh[];
  headlightBeams: THREE.Mesh[];
  muzzleSocket: THREE.Object3D;
  dustSockets: THREE.Object3D[];
}

interface BattlefieldTarget {
  group: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  health: number;
  maxHealth: number;
  radius: number;
  alive: boolean;
  kind: "BUNKER" | "RADAR" | "DRONE";
  phase: number;
}

interface Shell {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  velocity: THREE.Vector3;
  target: BattlefieldTarget | null;
  life: number;
  trail: THREE.Line;
}

interface Burst {
  group: THREE.Group;
  light: THREE.PointLight;
  age: number;
  duration: number;
  shock: THREE.Mesh;
  smoke: THREE.Mesh[];
}

interface DustPuff {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  duration: number;
}

interface Telemetry {
  speed: number;
  range: number;
  shells: number;
  targets: number;
}

const WORLD_SIZE = 520;
const ROAD_Y = 0.065;
const VEHICLE_CLEARANCE = 0.72;
const PATH_POINTS = [
  new THREE.Vector3(-206, 0, 120),
  new THREE.Vector3(-148, 0, 70),
  new THREE.Vector3(-82, 0, 36),
  new THREE.Vector3(-24, 0, 4),
  new THREE.Vector3(48, 0, -28),
  new THREE.Vector3(118, 0, -66),
  new THREE.Vector3(184, 0, -116),
  new THREE.Vector3(222, 0, -164),
];

function stdMat(color: number, roughness = 0.68, metalness = 0.12) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function glowMat(color: number, intensity = 1.8) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.2,
    metalness: 0,
    emissive: color,
    emissiveIntensity: intensity,
  });
}

function terrainHeight(x: number, z: number) {
  const broad = Math.sin(x * 0.018) * 2.2 + Math.cos(z * 0.021) * 1.8;
  const ridges = Math.sin((x + z) * 0.045) * 0.7 + Math.cos((x - z) * 0.033) * 0.65;
  const raw = broad + ridges - 0.8;
  const roadBias = Math.max(0, 1 - Math.abs(z + x * 0.32 - 52) / 18);
  return THREE.MathUtils.lerp(raw, ROAD_Y, roadBias);
}

function surfaceNormal(x: number, z: number) {
  const s = 1.8;
  const left = terrainHeight(x - s, z);
  const right = terrainHeight(x + s, z);
  const back = terrainHeight(x, z - s);
  const front = terrainHeight(x, z + s);
  return new THREE.Vector3(left - right, s * 2, back - front).normalize();
}

function yawToQuaternion(yaw: number, x: number, z: number) {
  const up = surfaceNormal(x, z);
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).projectOnPlane(up).normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const adjustedForward = new THREE.Vector3().crossVectors(right, up).normalize();
  const matrix = new THREE.Matrix4().makeBasis(right, up, adjustedForward);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function addMesh(group: THREE.Group, mesh: THREE.Mesh, cast = true, receive = false) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  group.add(mesh);
  return mesh;
}

function buildSky(scene: THREE.Scene) {
  const cv = document.createElement("canvas");
  cv.width = 2;
  cv.height = 256;
  const ctx = cv.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, "#050911");
  gradient.addColorStop(0.36, "#101b2a");
  gradient.addColorStop(0.68, "#2a2c26");
  gradient.addColorStop(1, "#5b4937");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  scene.background = texture;
  scene.fog = new THREE.FogExp2(0x151719, 0.0062);

  const stars = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 230 + Math.random() * 220;
    stars[i * 3] = Math.cos(a) * r;
    stars[i * 3 + 1] = 90 + Math.random() * 150;
    stars[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xd7e8ff,
    size: 0.55,
    transparent: true,
    opacity: 0.62,
    fog: false,
  })));
}

function buildLighting(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0x5f738e, 0x201409, 1.2));

  const key = new THREE.DirectionalLight(0xffd9ac, 2.35);
  key.position.set(-80, 84, -120);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 540;
  key.shadow.camera.left = -220;
  key.shadow.camera.right = 220;
  key.shadow.camera.top = 220;
  key.shadow.camera.bottom = -220;
  key.shadow.bias = -0.00035;
  scene.add(key);

  const blueFill = new THREE.DirectionalLight(0x4d8ad8, 0.55);
  blueFill.position.set(90, 42, 110);
  scene.add(blueFill);
}

function buildGround(scene: THREE.Scene) {
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 124, 124);
  const positions = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    positions.setZ(i, terrainHeight(positions.getX(i), -positions.getY(i)));
  }
  positions.needsUpdate = true;
  groundGeo.computeVertexNormals();

  const ground = new THREE.Mesh(groundGeo, stdMat(0x2b2b1d, 0.92, 0.04));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = stdMat(0x171813, 0.95, 0.02);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(470, 18), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = -0.31;
  road.position.set(6, ROAD_Y + 0.01, 50);
  road.receiveShadow = true;
  scene.add(road);

  const trenchMat = stdMat(0x0f1110, 0.96, 0.02);
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 5; i++) {
      const trench = new THREE.Mesh(new THREE.BoxGeometry(54, 0.18, 2.6), trenchMat);
      trench.position.set(-150 + i * 82, terrainHeight(-150 + i * 82, -64 * side) + 0.04, -64 * side);
      trench.rotation.y = side * 0.34 + i * 0.12;
      trench.receiveShadow = true;
      scene.add(trench);

      const berm = new THREE.Mesh(new THREE.BoxGeometry(55, 1.1, 1.4), stdMat(0x3a3222, 0.9, 0.02));
      berm.position.copy(trench.position).add(new THREE.Vector3(0, 0.46, side * 2.35));
      berm.rotation.copy(trench.rotation);
      berm.castShadow = true;
      berm.receiveShadow = true;
      scene.add(berm);
    }
  });

  const craterMat = new THREE.MeshStandardMaterial({ color: 0x11100d, roughness: 0.98, metalness: 0.02 });
  const rimMat = stdMat(0x4a3e2a, 0.9, 0.03);
  const craterPoints = [
    [-188, 52, 9], [-126, -16, 6], [-74, 104, 7], [-12, -92, 12],
    [48, 72, 8], [96, -24, 10], [152, 28, 7], [196, -132, 11],
    [-214, -96, 8], [18, 142, 6],
  ] as [number, number, number][];
  craterPoints.forEach(([x, z, r], index) => {
    const y = terrainHeight(x, z) + 0.055;
    const pit = new THREE.Mesh(new THREE.CircleGeometry(r, 38), craterMat);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(x, y, z);
    scene.add(pit);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.24, 7, 42), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = index * 0.4;
    rim.scale.set(1, 0.74 + (index % 3) * 0.12, 1);
    rim.position.set(x, y + 0.08, z);
    rim.castShadow = true;
    scene.add(rim);
  });

  const debrisMat = stdMat(0x1e2424, 0.76, 0.5);
  for (let i = 0; i < 70; i++) {
    const x = -230 + Math.random() * 460;
    const z = -185 + Math.random() * 370;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.4 + Math.random() * 1.5, 0.18 + Math.random() * 0.8, 0.4 + Math.random() * 1.5),
      debrisMat
    );
    box.position.set(x, terrainHeight(x, z) + 0.18, z);
    box.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.8);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);
  }
}

function createArmoredVehicle(): ArmoredVehicleRig {
  const group = new THREE.Group();
  const armor = stdMat(0x4f5b4a, 0.58, 0.38);
  const darkArmor = stdMat(0x20291f, 0.72, 0.28);
  const rubber = stdMat(0x070807, 0.9, 0.02);
  const metal = stdMat(0x68706c, 0.42, 0.65);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fc6c1,
    roughness: 0.08,
    metalness: 0.08,
    transparent: true,
    opacity: 0.38,
  });

  const hull = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.55, 8.2), armor), true, true);
  hull.position.y = 1.3;

  const glacis = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.45, 0.82, 2.0), darkArmor));
  glacis.position.set(0, 1.72, -3.35);
  glacis.rotation.x = -0.28;

  const rearDeck = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.42, 2.1), darkArmor));
  rearDeck.position.set(0, 2.05, 2.9);

  const turret = new THREE.Group();
  turret.position.set(0, 2.3, -0.6);
  group.add(turret);

  const turretBody = addMesh(turret, new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.95, 1.0, 8), armor));
  turretBody.rotation.y = Math.PI / 8;
  turretBody.scale.z = 1.16;

  const cupola = addMesh(turret, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.36, 18), darkArmor));
  cupola.position.set(-0.68, 0.66, 0.22);

  const barrel = addMesh(turret, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 5.3, 18), metal));
  barrel.position.set(0, 0.08, -3.62);
  barrel.rotation.x = Math.PI / 2;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.08, -6.28);
  turret.add(muzzle);

  const coax = addMesh(turret, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.0, 10), darkArmor));
  coax.position.set(0.45, -0.04, -2.7);
  coax.rotation.x = Math.PI / 2;

  const wheels: THREE.Mesh[] = [];
  const trackBelts: THREE.Mesh[] = [];
  [-1, 1].forEach((side) => {
    const belt = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 7.55), rubber), true, true);
    belt.position.set(side * 3.0, 0.76, 0);
    trackBelts.push(belt);

    for (let i = 0; i < 6; i++) {
      const wheel = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.34, 22), darkArmor));
      wheel.position.set(side * 3.04, 0.76, -3.0 + i * 1.2);
      wheel.rotation.z = Math.PI / 2;
      wheels.push(wheel);
    }
  });

  const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), glass);
  frontGlass.position.set(0, 2.03, -4.18);
  frontGlass.rotation.x = -0.18;
  group.add(frontGlass);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), glowMat(0xffa319, 2.4));
  beacon.position.set(0.8, 2.82, 0.2);
  group.add(beacon);

  const antenna = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 8), metal));
  antenna.position.set(-1.9, 3.12, 2.4);
  antenna.rotation.x = -0.2;

  const headlightBeams: THREE.Mesh[] = [];
  [-1.35, 1.35].forEach((x) => {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.08), glowMat(0xfff2cf, 4.2));
    light.position.set(x, 1.55, -4.18);
    group.add(light);

    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 9.5, 22, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe3a8,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beam.position.set(x, 1.22, -8.4);
    beam.rotation.x = Math.PI / 2;
    beam.renderOrder = 3;
    group.add(beam);
    headlightBeams.push(beam);
  });

  const dustSockets = [new THREE.Object3D(), new THREE.Object3D()];
  dustSockets[0].position.set(-2.9, 0.5, 3.7);
  dustSockets[1].position.set(2.9, 0.5, 3.7);
  dustSockets.forEach((socket) => group.add(socket));

  group.scale.setScalar(1.05);
  return { group, hull, turret, barrel, wheels, trackBelts, headlightBeams, muzzleSocket: muzzle, dustSockets };
}

function createBunkerTarget(kind: BattlefieldTarget["kind"], x: number, z: number, phase: number): BattlefieldTarget {
  const group = new THREE.Group();
  const baseY = terrainHeight(x, z);
  const velocity = new THREE.Vector3();
  const maxHealth = kind === "DRONE" ? 60 : kind === "RADAR" ? 95 : 135;

  if (kind === "BUNKER") {
    const base = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.55, 4.4), stdMat(0x34382d, 0.82, 0.18)), true, true);
    base.position.y = 0.78;
    const roof = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.42, 4.9), stdMat(0x1b211d, 0.84, 0.22)));
    roof.position.y = 1.65;
    const slit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.07), glowMat(0xff3c1f, 1.3));
    slit.position.set(0, 1.08, -2.25);
    group.add(slit);
  } else if (kind === "RADAR") {
    const mast = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 14), stdMat(0x59605a, 0.55, 0.45)));
    mast.position.y = 2.1;
    const dish = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.12, 28), stdMat(0x7b877b, 0.45, 0.5)));
    dish.position.set(0, 4.2, 0);
    dish.rotation.x = Math.PI / 2.8;
    const pulse = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.03, 8, 44), glowMat(0xff3030, 1.8));
    pulse.position.set(0, 4.2, 0);
    pulse.rotation.x = Math.PI / 2.8;
    group.add(pulse);
  } else {
    const body = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 1.7), stdMat(0x262d32, 0.5, 0.38)));
    body.position.y = 0;
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, emissive: 0xff3216, emissiveIntensity: 1.4, transparent: true, opacity: 0.52 });
    [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([rx, rz]) => {
      const arm = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.12), stdMat(0x202a2e, 0.55, 0.32)));
      arm.position.set(0, 0, rz * 0.52);
      arm.rotation.y = rx * rz > 0 ? 0.55 : -0.55;
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.025, 28), rotorMat);
      rotor.position.set(rx, 0.18, rz);
      group.add(rotor);
    });
  }

  group.position.set(x, baseY + (kind === "DRONE" ? 18 + Math.sin(phase) * 4 : 0), z);
  group.rotation.y = Math.atan2(-x, -z);

  return {
    group,
    position: group.position.clone(),
    velocity,
    health: maxHealth,
    maxHealth,
    radius: kind === "DRONE" ? 2.4 : kind === "RADAR" ? 4.2 : 5.2,
    alive: true,
    kind,
    phase,
  };
}

function createMuzzleFlash() {
  const flash = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.7, 18),
    new THREE.MeshBasicMaterial({ color: 0xffd173, transparent: true, opacity: 0.9, depthWrite: false })
  );
  cone.rotation.x = -Math.PI / 2;
  flash.add(cone);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false })
  );
  flash.add(core);
  return flash;
}

function createShell(scene: THREE.Scene, origin: THREE.Vector3, target: BattlefieldTarget | null, fallbackDirection: THREE.Vector3): Shell {
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), mat);
  mesh.position.copy(origin);
  scene.add(mesh);

  const light = new THREE.PointLight(0xffb347, 2.8, 9);
  light.position.copy(origin);
  scene.add(light);

  const aim = target
    ? target.position.clone().addScaledVector(target.velocity, 0.35)
    : origin.clone().addScaledVector(fallbackDirection, 90);
  const distance = origin.distanceTo(aim);
  const velocity = aim.sub(origin).normalize().multiplyScalar(78).add(new THREE.Vector3(0, Math.min(12, distance * 0.05), 0));

  const trailGeo = new THREE.BufferGeometry().setFromPoints([origin, origin]);
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xffba66, transparent: true, opacity: 0.62 })
  );
  scene.add(trail);

  return { mesh, light, velocity, target, life: 0, trail };
}

function createBurst(scene: THREE.Scene, position: THREE.Vector3, scale = 1): Burst {
  const group = new THREE.Group();
  group.position.copy(position);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 1.2, 24, 14),
    new THREE.MeshBasicMaterial({ color: 0xff9d2e, transparent: true, opacity: 0.9, depthWrite: false })
  );
  group.add(core);

  const shock = new THREE.Mesh(
    new THREE.TorusGeometry(scale * 1.8, scale * 0.08, 8, 44),
    new THREE.MeshBasicMaterial({ color: 0xffdf88, transparent: true, opacity: 0.65, depthWrite: false })
  );
  shock.rotation.x = Math.PI / 2;
  group.add(shock);

  const smoke: THREE.Mesh[] = [];
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x3d3932, transparent: true, opacity: 0.34, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(scale * (0.9 + Math.random() * 0.6), 14, 10), smokeMat.clone());
    puff.position.set((Math.random() - 0.5) * scale * 2.4, Math.random() * scale * 1.2, (Math.random() - 0.5) * scale * 2.4);
    group.add(puff);
    smoke.push(puff);
  }

  const light = new THREE.PointLight(0xff8a22, 12 * scale, 36 * scale);
  light.position.copy(position);
  scene.add(group, light);
  return { group, light, age: 0, duration: 1.4, shock, smoke };
}

function BattlefieldHUD({
  controls,
  telemetry,
  onControlsChange,
  onReset,
}: {
  controls: BattlefieldControls;
  telemetry: Telemetry;
  onControlsChange: (next: BattlefieldControls) => void;
  onReset: () => void;
}) {
  const setControl = <K extends keyof BattlefieldControls>(key: K, value: BattlefieldControls[K]) => {
    onControlsChange({ ...controls, [key]: value });
  };

  const buttonClass = (active: boolean) =>
    `rounded border px-3 py-2 text-xs font-semibold tracking-wide transition ${
      active
        ? "border-amber-300 bg-amber-300 text-black"
        : "border-white/20 bg-black/35 text-gray-200 hover:border-amber-300/70 hover:text-amber-100"
    }`;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 md:p-6">
      <div className="max-w-xl">
        <p className="text-xs uppercase tracking-[0.28em] text-amber-200/80">Live WebGL Theater</p>
        <h2 className="mt-2 text-3xl font-semibold text-white drop-shadow-[0_0_22px_rgba(245,158,11,0.32)] md:text-5xl">
          Armored Battlefield Simulation
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-stone-300 md:text-base">
          Autonomous armor, reactive turret fire, moving aerial threats, impact effects, and battlefield terrain in one real-time scene.
        </p>
      </div>

      <div className="pointer-events-auto grid gap-3 rounded-lg border border-white/10 bg-black/45 p-3 text-white shadow-2xl backdrop-blur-md md:max-w-4xl md:grid-cols-[1.2fr_1fr]">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-400">Speed</p>
            <p className="text-lg font-semibold text-amber-200">{telemetry.speed.toFixed(1)}</p>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-400">Range</p>
            <p className="text-lg font-semibold text-amber-200">{telemetry.range.toFixed(0)}m</p>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-400">Rounds</p>
            <p className="text-lg font-semibold text-amber-200">{telemetry.shells}</p>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-400">Targets</p>
            <p className="text-lg font-semibold text-amber-200">{telemetry.targets}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button className={buttonClass(controls.paused)} onClick={() => setControl("paused", !controls.paused)}>
            {controls.paused ? "Resume" : "Pause"}
          </button>
          <button className={buttonClass(controls.thermal)} onClick={() => setControl("thermal", !controls.thermal)}>
            Thermal
          </button>
          <button className={buttonClass(false)} onClick={onReset}>
            Reset
          </button>
          {(["CHASE", "COMMAND", "CINEMATIC"] as CameraMode[]).map((mode) => (
            <button key={mode} className={buttonClass(controls.cameraMode === mode)} onClick={() => setControl("cameraMode", mode)}>
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function BattlefieldSimulation3D({ active = true }: { active?: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  const controlsRef = useRef<BattlefieldControls>({
    paused: false,
    cameraMode: "CHASE",
    thermal: false,
  });
  const commandsRef = useRef<BattlefieldCommands>({ reset: false, fireNow: false });
  const [controls, setControls] = useState<BattlefieldControls>(controlsRef.current);
  const [telemetry, setTelemetry] = useState<Telemetry>({ speed: 0, range: 0, shells: 0, targets: 0 });

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const mountElement: HTMLDivElement = mount;

    const scene = new THREE.Scene();
    buildSky(scene);
    buildLighting(scene);
    buildGround(scene);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.2, 900);
    camera.position.set(-18, 11, 24);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mountElement.appendChild(renderer.domElement);

    const vehicle = createArmoredVehicle();
    scene.add(vehicle.group);

    const targets: BattlefieldTarget[] = [
      createBunkerTarget("BUNKER", 72, -86, 0.1),
      createBunkerTarget("BUNKER", 146, -132, 1.1),
      createBunkerTarget("RADAR", 16, -118, 2.0),
      createBunkerTarget("RADAR", 198, -62, 3.1),
      createBunkerTarget("DRONE", -62, -72, 4.0),
      createBunkerTarget("DRONE", 114, 36, 5.2),
      createBunkerTarget("DRONE", 190, -18, 2.8),
    ];
    targets.forEach((target) => scene.add(target.group));

    const shells: Shell[] = [];
    const bursts: Burst[] = [];
    const dust: DustPuff[] = [];
    const muzzleFlashes: { group: THREE.Group; age: number }[] = [];
    const clock = new THREE.Clock();
    const camTarget = new THREE.Vector3();
    const camOffset = new THREE.Vector3();
    const scratch = new THREE.Vector3();
    const keys = new Set<string>();
    let pathIndex = 0;
    let vehicleSpeed = 0;
    let vehicleYaw = 0;
    let fireCooldown = 0.6;
    let shotCount = 0;
    let hudTick = 0;
    let frameId = 0;
    let cinematicYaw = 0;

    function resize() {
      const rect = mountElement.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(mountElement);
    resize();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright", " "].includes(key)) {
        event.preventDefault();
      }
      keys.add(key);
      if (key === " ") commandsRef.current.fireNow = true;
      if (key === "r") commandsRef.current.reset = true;
      if (key === "p") setControls((current) => ({ ...current, paused: !current.paused }));
      if (key === "t") setControls((current) => ({ ...current, thermal: !current.thermal }));
      if (key === "1") setControls((current) => ({ ...current, cameraMode: "CHASE" }));
      if (key === "2") setControls((current) => ({ ...current, cameraMode: "COMMAND" }));
      if (key === "3") setControls((current) => ({ ...current, cameraMode: "CINEMATIC" }));
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function visualForwardFromYaw(yaw: number) {
      return scratch.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    }

    function yawFromVisualDirection(direction: THREE.Vector3) {
      return Math.atan2(-direction.x, -direction.z);
    }

    function initialVehicleYaw() {
      return yawFromVisualDirection(PATH_POINTS[1].clone().sub(PATH_POINTS[0]).normalize());
    }

    function resetTheater() {
      vehicle.group.position.set(PATH_POINTS[0].x, terrainHeight(PATH_POINTS[0].x, PATH_POINTS[0].z) + VEHICLE_CLEARANCE, PATH_POINTS[0].z);
      vehicleYaw = initialVehicleYaw();
      vehicle.group.quaternion.copy(yawToQuaternion(vehicleYaw, vehicle.group.position.x, vehicle.group.position.z));
      pathIndex = 0;
      vehicleSpeed = 0;
      fireCooldown = 0.6;
      shotCount = 0;
      targets.forEach((target) => {
        target.alive = true;
        target.health = target.maxHealth;
        target.group.visible = true;
      });
      shells.splice(0).forEach((shell) => {
        scene.remove(shell.mesh, shell.light, shell.trail);
        shell.mesh.geometry.dispose();
        (shell.mesh.material as THREE.Material).dispose();
        shell.trail.geometry.dispose();
        (shell.trail.material as THREE.Material).dispose();
      });
      bursts.splice(0).forEach((burst) => {
        scene.remove(burst.group, burst.light);
      });
      dust.splice(0).forEach((puff) => {
        scene.remove(puff.mesh);
      });
    }

    function nearestTarget() {
      let best: BattlefieldTarget | null = null;
      let bestDistance = Infinity;
      targets.forEach((target) => {
        if (!target.alive) return;
        const distance = target.position.distanceTo(vehicle.group.position);
        if (distance < bestDistance) {
          best = target;
          bestDistance = distance;
        }
      });
      return { target: best, distance: bestDistance };
    }

    function fireAt(target: BattlefieldTarget | null) {
      const muzzleDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicle.turret.getWorldQuaternion(new THREE.Quaternion())).normalize();
      const origin = vehicle.muzzleSocket.getWorldPosition(new THREE.Vector3()).addScaledVector(muzzleDirection, 0.7);
      const shell = createShell(scene, origin, target, muzzleDirection);
      shells.push(shell);
      shotCount += 1;

      const flash = createMuzzleFlash();
      flash.position.copy(origin);
      vehicle.turret.getWorldQuaternion(flash.quaternion);
      scene.add(flash);
      muzzleFlashes.push({ group: flash, age: 0 });

    }

    function updateVehicle(dt: number) {
      const current = vehicle.group.position;
      const forwardPressed = keys.has("w") || keys.has("arrowup");
      const reversePressed = keys.has("s") || keys.has("arrowdown");
      const leftPressed = keys.has("a") || keys.has("arrowleft");
      const rightPressed = keys.has("d") || keys.has("arrowright");
      const manualDrive = forwardPressed || reversePressed || leftPressed || rightPressed;

      if (manualDrive) {
        const throttle = (forwardPressed ? 1 : 0) - (reversePressed ? 0.75 : 0);
        const steering = (leftPressed ? 1 : 0) - (rightPressed ? 1 : 0);
        vehicleSpeed += throttle * dt * 24;
        vehicleSpeed *= 1 - Math.min(0.08, dt * 1.8);
        vehicleSpeed = THREE.MathUtils.clamp(vehicleSpeed, -8, 18);
        vehicleYaw += steering * dt * (0.8 + Math.abs(vehicleSpeed) * 0.07) * (vehicleSpeed >= 0 ? 1 : -1);

        const forward = visualForwardFromYaw(vehicleYaw);
        current.addScaledVector(forward, vehicleSpeed * dt);
        current.x = THREE.MathUtils.clamp(current.x, -238, 238);
        current.z = THREE.MathUtils.clamp(current.z, -210, 210);
        current.y = terrainHeight(current.x, current.z) + VEHICLE_CLEARANCE;
        vehicle.group.quaternion.slerp(yawToQuaternion(vehicleYaw, current.x, current.z), THREE.MathUtils.clamp(dt * 5.2, 0, 1));
      } else {
        const nextPath = PATH_POINTS[Math.min(pathIndex + 1, PATH_POINTS.length - 1)];
        const next = scratch.set(nextPath.x, terrainHeight(nextPath.x, nextPath.z) + VEHICLE_CLEARANCE, nextPath.z);
        const toNext = next.clone().sub(current);
        const distance = toNext.length();
        const desiredSpeed = pathIndex >= PATH_POINTS.length - 2 ? 5.5 : 12.5;
        vehicleSpeed = THREE.MathUtils.lerp(vehicleSpeed, desiredSpeed, 1 - Math.pow(0.05, dt));

        if (distance < 4.5 && pathIndex < PATH_POINTS.length - 2) {
          pathIndex += 1;
        }

        if (distance > 0.01) {
          const step = Math.min(distance, vehicleSpeed * dt);
          const dir = toNext.normalize();
          current.addScaledVector(dir, step);
          current.y = terrainHeight(current.x, current.z) + VEHICLE_CLEARANCE;
          vehicleYaw = yawFromVisualDirection(dir);
          vehicle.group.quaternion.slerp(yawToQuaternion(vehicleYaw, current.x, current.z), THREE.MathUtils.clamp(dt * 3.2, 0, 1));
        }
      }

      vehicle.wheels.forEach((wheel, index) => {
        wheel.rotation.x += dt * vehicleSpeed * (index % 2 === 0 ? 1 : 1.08);
      });
      vehicle.trackBelts.forEach((belt, index) => {
        belt.position.y = 0.76 + Math.sin(performance.now() * 0.012 + index) * 0.015;
      });

      if (Math.random() < dt * Math.max(2, vehicleSpeed * 0.9)) {
        vehicle.dustSockets.forEach((socket) => {
          const pos = socket.getWorldPosition(new THREE.Vector3());
          const mat = new THREE.MeshBasicMaterial({ color: 0x8b7656, transparent: true, opacity: 0.22, depthWrite: false });
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.55 + Math.random() * 0.55, 10, 8), mat);
          puff.position.copy(pos);
          scene.add(puff);
          dust.push({
            mesh: puff,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.1 + Math.random() * 0.8, 1.2 + Math.random()),
            age: 0,
            duration: 1.6 + Math.random() * 0.7,
          });
        });
      }
    }

    function updateTargets(t: number, dt: number) {
      targets.forEach((target, index) => {
        if (!target.alive) return;
        const previous = target.position.clone();
        if (target.kind === "DRONE") {
          const orbit = 28 + index * 3;
          const cx = index % 2 === 0 ? 20 : 140;
          const cz = index % 2 === 0 ? -60 : -18;
          target.group.position.set(
            cx + Math.sin(t * 0.45 + target.phase) * orbit,
            terrainHeight(cx, cz) + 22 + Math.sin(t * 1.2 + target.phase) * 4,
            cz + Math.cos(t * 0.37 + target.phase) * orbit
          );
          target.group.rotation.y += dt * 1.8;
        } else if (target.kind === "RADAR") {
          target.group.rotation.y += dt * 0.55;
        }
        target.position.copy(target.group.position);
        target.velocity.copy(target.position).sub(previous).divideScalar(Math.max(dt, 0.001));
      });
    }

    function updateTurret(dt: number, target: BattlefieldTarget | null) {
      if (!target) return;
      const localTarget = vehicle.turret.parent!.worldToLocal(target.position.clone());
      const desiredYaw = Math.atan2(-localTarget.x, -localTarget.z);
      const yawError = THREE.MathUtils.euclideanModulo(desiredYaw - vehicle.turret.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      vehicle.turret.rotation.y += THREE.MathUtils.clamp(yawError, -dt * 2.4, dt * 2.4);

      const muzzle = vehicle.muzzleSocket.getWorldPosition(new THREE.Vector3());
      const vertical = target.position.y - muzzle.y;
      const horizontal = Math.hypot(target.position.x - muzzle.x, target.position.z - muzzle.z);
      const pitch = THREE.MathUtils.clamp(Math.atan2(vertical, horizontal) * 0.45, -0.16, 0.22);
      vehicle.barrel.rotation.x = Math.PI / 2 - pitch;
    }

    function updateShells(dt: number) {
      for (let i = shells.length - 1; i >= 0; i--) {
        const shell = shells[i];
        const previous = shell.mesh.position.clone();
        shell.life += dt;
        shell.velocity.y -= 6.8 * dt;
        shell.mesh.position.addScaledVector(shell.velocity, dt);
        shell.light.position.copy(shell.mesh.position);
        shell.trail.geometry.setFromPoints([previous, shell.mesh.position.clone()]);

        let hitTarget: BattlefieldTarget | null = null;
        if (shell.target?.alive && shell.mesh.position.distanceTo(shell.target.position) < shell.target.radius) {
          hitTarget = shell.target;
        }
        const groundY = terrainHeight(shell.mesh.position.x, shell.mesh.position.z) + 0.3;
        const hitGround = shell.mesh.position.y <= groundY;
        if (hitTarget || hitGround || shell.life > 4.2) {
          const impact = hitTarget ? hitTarget.position.clone() : shell.mesh.position.clone();
          impact.y = Math.max(impact.y, terrainHeight(impact.x, impact.z) + 0.45);
          bursts.push(createBurst(scene, impact, hitTarget ? 1.45 : 0.95));
          if (hitTarget) {
            hitTarget.health -= 46;
            if (hitTarget.health <= 0) {
              hitTarget.alive = false;
              hitTarget.group.visible = false;
              bursts.push(createBurst(scene, impact.clone().add(new THREE.Vector3(0, 1.2, 0)), 1.9));
            }
          }
          scene.remove(shell.mesh, shell.light, shell.trail);
          shell.mesh.geometry.dispose();
          (shell.mesh.material as THREE.Material).dispose();
          shell.trail.geometry.dispose();
          (shell.trail.material as THREE.Material).dispose();
          shells.splice(i, 1);
        }
      }
    }

    function updateBursts(dt: number) {
      for (let i = bursts.length - 1; i >= 0; i--) {
        const burst = bursts[i];
        burst.age += dt;
        const p = burst.age / burst.duration;
        burst.group.scale.setScalar(1 + p * 2.6);
        burst.light.intensity = 12 * Math.max(0, 1 - p);
        burst.shock.scale.setScalar(1 + p * 4.2);
        const shockMat = burst.shock.material as THREE.MeshBasicMaterial;
        shockMat.opacity = Math.max(0, 0.65 * (1 - p));
        burst.smoke.forEach((puff, idx) => {
          puff.position.y += dt * (0.8 + idx * 0.08);
          puff.scale.multiplyScalar(1 + dt * 0.55);
          const mat = puff.material as THREE.MeshBasicMaterial;
          mat.opacity = Math.max(0, 0.32 * (1 - p * 0.75));
        });
        if (p >= 1) {
          scene.remove(burst.group, burst.light);
          burst.group.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            mesh.geometry?.dispose();
            if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
            else (mesh.material as THREE.Material | undefined)?.dispose();
          });
          bursts.splice(i, 1);
        }
      }
    }

    function updateDust(dt: number) {
      for (let i = dust.length - 1; i >= 0; i--) {
        const puff = dust[i];
        puff.age += dt;
        const p = puff.age / puff.duration;
        puff.mesh.position.addScaledVector(puff.velocity, dt);
        puff.mesh.scale.setScalar(1 + p * 2.4);
        const mat = puff.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.22 * (1 - p));
        if (p >= 1) {
          scene.remove(puff.mesh);
          puff.mesh.geometry.dispose();
          mat.dispose();
          dust.splice(i, 1);
        }
      }
    }

    function updateMuzzleFlashes(dt: number) {
      for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
        const flash = muzzleFlashes[i];
        flash.age += dt;
        flash.group.scale.setScalar(1 + flash.age * 5);
        flash.group.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          const mat = mesh.material as THREE.MeshBasicMaterial | undefined;
          if (mat?.opacity !== undefined) mat.opacity = Math.max(0, 1 - flash.age * 9);
        });
        if (flash.age > 0.14) {
          scene.remove(flash.group);
          flash.group.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            mesh.geometry?.dispose();
            (mesh.material as THREE.Material | undefined)?.dispose();
          });
          muzzleFlashes.splice(i, 1);
        }
      }
    }

    function updateCamera(dt: number) {
      const controlsNow = controlsRef.current;
      if (controlsNow.cameraMode === "COMMAND") {
        camTarget.set(vehicle.group.position.x - 22, vehicle.group.position.y + 78, vehicle.group.position.z + 34);
      } else if (controlsNow.cameraMode === "CINEMATIC") {
        cinematicYaw += dt * 0.18;
        camOffset.set(Math.sin(cinematicYaw) * 36, 15 + Math.sin(cinematicYaw * 0.7) * 6, Math.cos(cinematicYaw) * 36);
        camTarget.copy(vehicle.group.position).add(camOffset);
      } else {
        camOffset.set(0, 9.8, 20);
        camOffset.applyQuaternion(vehicle.group.quaternion);
        camTarget.copy(vehicle.group.position).add(camOffset);
      }
      camera.position.lerp(camTarget, 1 - Math.pow(0.002, dt));
      camera.lookAt(vehicle.group.position.x, vehicle.group.position.y + 2.0, vehicle.group.position.z);
    }

    function applyThermalLook(enabled: boolean) {
      renderer.toneMappingExposure = enabled ? 1.45 : 1.05;
      scene.fog = enabled ? new THREE.FogExp2(0x101820, 0.0048) : new THREE.FogExp2(0x151719, 0.0062);
      vehicle.headlightBeams.forEach((beam) => {
        const mat = beam.material as THREE.MeshBasicMaterial;
        mat.opacity = enabled ? 0.2 : 0.1;
      });
    }

    resetTheater();

    function animate() {
      frameId = requestAnimationFrame(animate);
      const rawDt = Math.min(clock.getDelta(), 0.045);
      if (!activeRef.current) return;
      const controlsNow = controlsRef.current;
      const dt = controlsNow.paused ? 0 : rawDt;
      const t = clock.elapsedTime;

      applyThermalLook(controlsNow.thermal);

      if (commandsRef.current.reset) {
        commandsRef.current.reset = false;
        resetTheater();
      }

      if (dt > 0) {
        updateVehicle(dt);
        updateTargets(t, dt);
      }

      const { target, distance } = nearestTarget();
      if (dt > 0) updateTurret(dt, target);

      const shouldManualFire = commandsRef.current.fireNow;
      fireCooldown -= dt;
      if (shouldManualFire && fireCooldown <= 0) {
        fireAt(target);
        fireCooldown = 0.28;
      }
      commandsRef.current.fireNow = false;

      updateShells(dt || rawDt);
      updateBursts(dt || rawDt);
      updateDust(dt || rawDt);
      updateMuzzleFlashes(dt || rawDt);
      updateCamera(rawDt);

      if (++hudTick % 8 === 0) {
        setTelemetry({
          speed: controlsNow.paused ? 0 : vehicleSpeed,
          range: Number.isFinite(distance) ? distance : 0,
          shells: shotCount,
          targets: targets.filter((candidate) => candidate.alive).length,
        });
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      ro.disconnect();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else (mesh.material as THREE.Material | undefined)?.dispose();
      });
      renderer.dispose();
      if (mountElement.contains(renderer.domElement)) mountElement.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-label="Interactive armored battlefield WebGL simulation"
      className="absolute inset-0 h-full w-full"
      role="img"
    >
      <BattlefieldHUD
        controls={controls}
        telemetry={telemetry}
        onControlsChange={setControls}
        onReset={() => {
          commandsRef.current.reset = true;
        }}
      />
    </div>
  );
}
