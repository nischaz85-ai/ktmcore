"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type CameraMode = "CHASE" | "COMMAND" | "CINEMATIC";

interface BattlefieldControls {
  paused: boolean;
  cameraMode: CameraMode;
  thermal: boolean;
  autoRoute: boolean;
}

interface BattlefieldCommands {
  reset: boolean;
  fireNow: boolean;
  clickTarget: BattlefieldTarget | null;
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
  kind: "BUNKER" | "RADAR" | "DRONE" | "ARMOR" | "LAUNCHER" | "EVTOL" | "SOLDIER";
  phase: number;
  anchor: THREE.Vector3;
}

interface BattlefieldObstacle {
  position: THREE.Vector3;
  radius: number;
  source?: BattlefieldTarget;
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

interface EnemyShot {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  velocity: THREE.Vector3;
  age: number;
  damage: number;
  blastRadius: number;
  trail: THREE.Line;
  sourceKind: BattlefieldTarget["kind"];
}

interface Telemetry {
  speed: number;
  range: number;
  shells: number;
  targets: number;
  armor: number;
  incoming: number;
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

type BiomeKind = "DESERT" | "ARCTIC" | "JUNGLE" | "SCRUB";

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

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function roadBiasAt(x: number, z: number) {
  return Math.max(0, 1 - Math.abs(z + x * 0.32 - 52) / 18);
}

function biomeWeights(x: number, z: number) {
  const desert = smoothstep(-20, -210, x) * smoothstep(-210, 80, z);
  const arctic = smoothstep(15, 185, x) * smoothstep(20, 210, z);
  const jungle = smoothstep(30, 180, x) * smoothstep(20, -180, z);
  return { desert, arctic, jungle };
}

function dominantBiome(x: number, z: number): BiomeKind {
  const weights = biomeWeights(x, z);
  if (weights.desert > weights.arctic && weights.desert > weights.jungle && weights.desert > 0.2) return "DESERT";
  if (weights.arctic > weights.desert && weights.arctic > weights.jungle && weights.arctic > 0.2) return "ARCTIC";
  if (weights.jungle > weights.desert && weights.jungle > weights.arctic && weights.jungle > 0.2) return "JUNGLE";
  return "SCRUB";
}

function biomeGroundColor(x: number, z: number) {
  const color = new THREE.Color(0x2b2b1d);
  const weights = biomeWeights(x, z);
  color.lerp(new THREE.Color(0xa9793a), weights.desert * 0.86);
  color.lerp(new THREE.Color(0xd7e8ee), weights.arctic * 0.9);
  color.lerp(new THREE.Color(0x123a22), weights.jungle * 0.86);
  if (roadBiasAt(x, z) > 0.65) color.lerp(new THREE.Color(0x171813), 0.5);
  return color;
}

function terrainHeight(x: number, z: number) {
  const weights = biomeWeights(x, z);
  const broad = Math.sin(x * 0.014) * 4.8 + Math.cos(z * 0.017) * 4.1;
  const ridges = Math.sin((x + z) * 0.039) * 2.4 + Math.cos((x - z) * 0.032) * 1.85;
  const dunes = (Math.sin(z * 0.07 + x * 0.018) * 1.8 + Math.sin(x * 0.045) * 0.9) * weights.desert;
  const alpine = (Math.max(0, Math.sin(x * 0.028) + Math.cos(z * 0.026)) * 8.5) * weights.arctic;
  const jungleRoll = (Math.sin((x - z) * 0.026) * 2.8 + Math.cos(z * 0.049) * 1.9) * weights.jungle;
  const raw = broad + ridges + dunes + alpine + jungleRoll - 1.4;
  const roadBias = roadBiasAt(x, z);
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

function buildGround(scene: THREE.Scene, obstacles: BattlefieldObstacle[]) {
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 164, 164);
  const positions = groundGeo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = -positions.getY(i);
    positions.setZ(i, terrainHeight(x, z));
    const color = biomeGroundColor(x, z);
    colors.push(color.r, color.g, color.b);
  }
  positions.needsUpdate = true;
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();

  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0.03, vertexColors: true })
  );
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
    if (roadBiasAt(x, z) < 0.35) obstacles.push({ position: new THREE.Vector3(x, box.position.y, z), radius: 1.15 });
  }

  buildBiomeDetails(scene, obstacles);
}

function addTree(scene: THREE.Scene, obstacles: BattlefieldObstacle[], x: number, z: number, scale = 1) {
  const y = terrainHeight(x, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * scale, 0.58 * scale, 4.15 * scale, 10), stdMat(0x4a2f19, 0.82, 0.08));
  trunk.position.set(x, y + 2.05 * scale, z);
  trunk.castShadow = true;
  scene.add(trunk);

  const crownMat = stdMat(0x0b351c, 0.78, 0.03);
  [
    [2.65, 3.6, 4.2],
    [2.15, 3.1, 5.28],
    [1.58, 2.5, 6.18],
  ].forEach(([radius, height, offset], level) => {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(radius * scale, height * scale, 11), crownMat);
    crown.position.set(x + Math.sin(level + x) * 0.24 * scale, y + offset * scale, z + Math.cos(level + z) * 0.24 * scale);
    crown.rotation.y = level * 0.37;
    crown.castShadow = true;
    crown.receiveShadow = true;
    scene.add(crown);
  });

  for (let i = 0; i < 3; i++) {
    const root = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.12 * scale, 1.6 * scale), stdMat(0x3b2616, 0.86, 0.05));
    root.position.set(x, y + 0.12 * scale, z);
    root.rotation.y = (Math.PI * 2 * i) / 3 + Math.sin(x + z);
    root.castShadow = true;
    scene.add(root);
  }
  obstacles.push({ position: new THREE.Vector3(x, y, z), radius: 2.05 * scale });
}

function addPalm(scene: THREE.Scene, obstacles: BattlefieldObstacle[], x: number, z: number, scale = 1) {
  const y = terrainHeight(x, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.46 * scale, 5.2 * scale, 10), stdMat(0x6b4b2e, 0.82, 0.08));
  trunk.position.set(x, y + 2.6 * scale, z);
  trunk.rotation.z = Math.sin(x + z) * 0.12;
  trunk.castShadow = true;
  scene.add(trunk);

  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.58 * scale, 0.14 * scale, 4.7 * scale), stdMat(i % 2 ? 0x174f25 : 0x1f6a31, 0.76, 0.02));
    leaf.position.set(x, y + 5.35 * scale, z);
    leaf.rotation.set(0.35, (Math.PI * 2 * i) / 9, 0.28);
    leaf.castShadow = true;
    scene.add(leaf);
  }
  obstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.65 * scale });
}

function addPine(scene: THREE.Scene, obstacles: BattlefieldObstacle[], x: number, z: number, scale = 1) {
  const y = terrainHeight(x, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 2.4 * scale, 8), stdMat(0x4b3424, 0.8, 0.06));
  trunk.position.set(x, y + 1.2 * scale, z);
  trunk.castShadow = true;
  scene.add(trunk);

  [0, 1, 2].forEach((level) => {
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry((2.0 - level * 0.42) * scale, 2.8 * scale, 10),
      stdMat(level === 0 ? 0x1f4a3f : 0x2f5b4c, 0.72, 0.02)
    );
    canopy.position.set(x, y + (2.35 + level * 1.35) * scale, z);
    canopy.castShadow = true;
    scene.add(canopy);
  });
  obstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.35 * scale });
}

function addDesertPlant(scene: THREE.Scene, obstacles: BattlefieldObstacle[], x: number, z: number, scale = 1) {
  const y = terrainHeight(x, z);
  const mat = stdMat(0x4f6f35, 0.82, 0.02);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.28 * scale, 2.2 * scale, 8), mat);
  stem.position.set(x, y + 1.1 * scale, z);
  stem.castShadow = true;
  scene.add(stem);

  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * scale, 0.16 * scale, 1.25 * scale, 8), mat);
    arm.position.set(x + side * 0.54 * scale, y + 1.45 * scale, z);
    arm.rotation.z = side * 0.82;
    arm.castShadow = true;
    scene.add(arm);
  });
  obstacles.push({ position: new THREE.Vector3(x, y, z), radius: 0.85 * scale });
}

function addIceOutcrop(scene: THREE.Scene, obstacles: BattlefieldObstacle[], x: number, z: number, scale = 1) {
  const y = terrainHeight(x, z);
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xbad8e6, roughness: 0.24, metalness: 0.03, transparent: true, opacity: 0.72 });
  const shard = new THREE.Mesh(new THREE.ConeGeometry(0.9 * scale, 3.8 * scale, 5), iceMat);
  shard.position.set(x, y + 1.9 * scale, z);
  shard.rotation.set(0.18, Math.sin(x) * Math.PI, -0.12);
  shard.castShadow = true;
  scene.add(shard);
  obstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.15 * scale });
}

function addBoulder(scene: THREE.Scene, obstacles: BattlefieldObstacle[], x: number, z: number, scale = 1) {
  const y = terrainHeight(x, z);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 * scale, 0), stdMat(0x4b463c, 0.88, 0.08));
  rock.position.set(x, y + 0.65 * scale, z);
  rock.scale.set(1.2, 0.72, 0.95);
  rock.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.6);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
  obstacles.push({ position: new THREE.Vector3(x, y, z), radius: 1.35 * scale });
}

function canPlaceNaturalDetail(x: number, z: number) {
  return Math.abs(z + x * 0.32 - 52) > 28 && Math.abs(x) < WORLD_SIZE * 0.47 && Math.abs(z) < WORLD_SIZE * 0.43;
}

function buildBiomeDetails(scene: THREE.Scene, obstacles: BattlefieldObstacle[]) {
  for (let i = 0; i < 245; i++) {
    const x = -235 + Math.random() * 470;
    const z = -205 + Math.random() * 410;
    if (!canPlaceNaturalDetail(x, z)) continue;
    const biome = dominantBiome(x, z);
    const scale = 0.75 + Math.random() * 0.9;

    if (biome === "JUNGLE") {
      if (Math.random() < 0.72) addTree(scene, obstacles, x, z, scale);
      else addPalm(scene, obstacles, x, z, scale);
    } else if (biome === "ARCTIC") {
      if (Math.random() < 0.45) addPine(scene, obstacles, x, z, scale * 0.9);
      else addIceOutcrop(scene, obstacles, x, z, scale);
    } else if (biome === "DESERT") {
      if (Math.random() < 0.55) addDesertPlant(scene, obstacles, x, z, scale * 0.8);
      else addBoulder(scene, obstacles, x, z, scale);
    } else if (Math.random() < 0.38) {
      addBoulder(scene, obstacles, x, z, scale * 0.75);
    }
  }

  const snowCaps = [
    [172, 144, 34], [214, 98, 26], [98, 182, 30],
  ] as [number, number, number][];
  snowCaps.forEach(([x, z, radius]) => {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(radius, 42), stdMat(0xecf5f8, 0.72, 0.02));
    cap.rotation.x = -Math.PI / 2;
    cap.position.set(x, terrainHeight(x, z) + 0.12, z);
    cap.receiveShadow = true;
    scene.add(cap);
  });

  const oasis = new THREE.Mesh(
    new THREE.CircleGeometry(18, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b5260, roughness: 0.22, metalness: 0.02 })
  );
  oasis.rotation.x = -Math.PI / 2;
  oasis.position.set(-178, terrainHeight(-178, 118) + 0.09, 118);
  scene.add(oasis);
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

  const bullbar = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.42, 0.36), darkArmor));
  bullbar.position.set(0, 1.15, -4.48);

  const lowerPlow = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.48, 0.62), stdMat(0x30392f, 0.74, 0.34)));
  lowerPlow.position.set(0, 0.72, -4.68);
  lowerPlow.rotation.x = -0.18;

  [-1, 1].forEach((side) => {
    const sideArmor = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.28, 7.7), stdMat(0x273326, 0.66, 0.36)), true, true);
    sideArmor.position.set(side * 3.18, 1.18, -0.08);

    const stowage = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.58, 2.2), stdMat(0x1c241c, 0.86, 0.2)));
    stowage.position.set(side * 3.42, 1.72, 1.8);
  });

  for (let i = 0; i < 4; i++) {
    const reactive = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.32, 0.55), stdMat(0x354132, 0.62, 0.42)));
    reactive.position.set(-1.85 + i * 1.23, 2.2, -3.95);
    reactive.rotation.x = -0.18;
  }

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

  const roofRack = addMesh(group, new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.055, 8, 48), stdMat(0x1a211a, 0.7, 0.42)));
  roofRack.position.set(0, 2.78, 1.25);
  roofRack.scale.z = 0.52;
  roofRack.rotation.x = Math.PI / 2;

  [-1, 1].forEach((side) => {
    const launcher = addMesh(turret, new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 1.22), darkArmor));
    launcher.position.set(side * 1.72, 0.04, -0.3);
    const pod = addMesh(turret, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.12, 10), metal));
    pod.position.set(side * 1.72, 0.06, -0.78);
    pod.rotation.x = Math.PI / 2;
  });

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

function createAdversaryTarget(kind: BattlefieldTarget["kind"], x: number, z: number, phase: number): BattlefieldTarget {
  const group = new THREE.Group();
  const baseY = terrainHeight(x, z);
  const velocity = new THREE.Vector3();
  const maxHealth =
    kind === "DRONE" ? 60 :
    kind === "EVTOL" ? 125 :
    kind === "SOLDIER" ? 35 :
    kind === "RADAR" ? 95 :
    kind === "ARMOR" ? 115 :
    kind === "LAUNCHER" ? 105 :
    135;

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
  } else if (kind === "DRONE") {
    const body = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 1.7), stdMat(0x262d32, 0.5, 0.38)));
    body.position.y = 0;
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, emissive: 0xff3216, emissiveIntensity: 1.4, transparent: true, opacity: 0.52 });
    [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([rx, rz]) => {
      const arm = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.12), stdMat(0x202a2e, 0.55, 0.32)));
      arm.position.set(0, 0, rz * 0.52);
      arm.rotation.y = rx * rz > 0 ? 0.55 : -0.55;
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.025, 28), rotorMat);
      rotor.position.set(rx, 0.18, rz);
      rotor.userData.rotor = true;
      group.add(rotor);
    });
  } else if (kind === "EVTOL") {
    const fuselage = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.58, 4.4), stdMat(0x2e3941, 0.5, 0.44)));
    fuselage.position.y = 0;
    const canopy = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.34, 1.1), new THREE.MeshStandardMaterial({
      color: 0x7cc9e8, roughness: 0.08, metalness: 0.08, transparent: true, opacity: 0.45,
    })));
    canopy.position.set(0, 0.38, -1.3);
    const wing = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.18, 1.1), stdMat(0x202a30, 0.55, 0.42)));
    wing.position.set(0, -0.02, 0.15);
    const tail = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 2.2), stdMat(0x202a30, 0.55, 0.42)));
    tail.position.set(0, 0.2, 2.25);
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x9bdfff, emissive: 0x1d9dff, emissiveIntensity: 0.95, transparent: true, opacity: 0.38 });
    [[-3.6, -0.6], [3.6, -0.6], [-3.1, 1.55], [3.1, 1.55]].forEach(([rx, rz]) => {
      const nacelle = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.42, 14), stdMat(0x151b20, 0.46, 0.58)));
      nacelle.position.set(rx, 0.02, rz);
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.96, 0.028, 32), rotorMat);
      rotor.position.set(rx, 0.3, rz);
      rotor.userData.rotor = true;
      group.add(rotor);
    });
  } else if (kind === "ARMOR") {
    const armorMat = stdMat(0x3d4937, 0.62, 0.32);
    const darkMat = stdMat(0x20291f, 0.72, 0.28);
    const metalMat = stdMat(0x5f6760, 0.46, 0.58);
    const hull = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.45, 1.36, 7.35), armorMat), true, true);
    hull.position.y = 1.02;
    const nose = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.72, 1.45), darkMat));
    nose.position.set(0, 1.28, -3.84);
    nose.rotation.x = -0.24;
    const plow = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.42, 0.52), darkMat));
    plow.position.set(0, 0.58, -4.2);
    plow.rotation.x = -0.18;
    const turret = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.45, 0.78, 10), darkMat));
    turret.position.set(0, 1.95, -0.8);
    const cannon = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 4.2, 14), metalMat));
    cannon.position.set(0, 1.98, -3.2);
    cannon.rotation.x = Math.PI / 2;
    [-1, 1].forEach((side) => {
      const sideArmor = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.02, 6.75), stdMat(0x273326, 0.66, 0.36)), true, true);
      sideArmor.position.set(side * 2.95, 1.02, -0.05);
      const track = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.64, 6.55), stdMat(0x111311, 0.9, 0.08)), true, true);
      track.position.set(side * 2.68, 0.48, 0);
      for (let wi = 0; wi < 5; wi++) {
        const wheel = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 16), darkMat));
        wheel.position.set(side * 2.82, 0.5, -2.55 + wi * 1.26);
        wheel.rotation.z = Math.PI / 2;
      }
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), glowMat(0xff542d, 1.8));
      marker.position.set(side * 1.05, 1.28, -3.86);
      group.add(marker);
      const pod = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.92), darkMat));
      pod.position.set(side * 1.54, 1.96, -1.22);
    });
    for (let i = 0; i < 4; i++) {
      const reactive = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.46), stdMat(0x354132, 0.62, 0.42)));
      reactive.position.set(-1.55 + i * 1.04, 1.9, -3.25);
      reactive.rotation.x = -0.18;
    }
    const roofRack = addMesh(group, new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.045, 8, 42), darkMat));
    roofRack.position.set(0, 2.35, 1.1);
    roofRack.scale.z = 0.48;
    roofRack.rotation.x = Math.PI / 2;
    const antenna = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.6, 7), metalMat));
    antenna.position.set(-1.86, 2.65, 2.4);
    antenna.rotation.x = -0.22;
  } else if (kind === "LAUNCHER") {
    const base = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.72, 4.8), stdMat(0x424537, 0.72, 0.28)), true, true);
    base.position.y = 0.56;
    const rack = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.48, 2.4), stdMat(0x24281f, 0.66, 0.36)));
    rack.position.set(0, 1.22, -0.42);
    rack.rotation.x = -0.34;
    [-1.05, 0, 1.05].forEach((rx) => {
      const tube = addMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.7, 14), stdMat(0x6f7468, 0.48, 0.54)));
      tube.position.set(rx, 1.42, -1.05);
      tube.rotation.x = Math.PI / 2 - 0.34;
    });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glowMat(0xff3030, 2.5));
    beacon.position.set(1.7, 1.12, 1.85);
    group.add(beacon);
  } else if (kind === "SOLDIER") {
  const uniform = stdMat(0x263a24, 0.78, 0.08);
  const webbing = stdMat(0x151b13, 0.82, 0.18);
  const skin = stdMat(0x8a6a4d, 0.68, 0.04);
  const boots = stdMat(0x11130f, 0.86, 0.08);

  const leftLeg = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.28), uniform));
  leftLeg.name = "soldier_left_leg";
  leftLeg.position.set(-0.16, 0.58, 0);

  const rightLeg = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.28), uniform));
  rightLeg.name = "soldier_right_leg";
  rightLeg.position.set(0.16, 0.58, 0);

  const torso = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.98, 0.48), uniform));
  torso.name = "soldier_torso";
  torso.position.y = 1.42;

  const vest = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.54, 0.52), webbing));
  vest.name = "soldier_vest";
  vest.position.y = 1.55;

  const head = addMesh(group, new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), skin));
  head.name = "soldier_head";
  head.position.y = 2.15;

  const helmet = addMesh(
    group,
    new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      stdMat(0x1b2a1b, 0.8, 0.18)
    )
  );
  helmet.name = "soldier_helmet";
  helmet.position.y = 2.24;

  const leftArm = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.2), uniform));
  leftArm.name = "soldier_left_arm";
  leftArm.position.set(-0.48, 1.45, -0.08);
  leftArm.rotation.z = 0.18;

  const rightArm = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.2), uniform));
  rightArm.name = "soldier_right_arm";
  rightArm.position.set(0.48, 1.45, -0.08);
  rightArm.rotation.z = -0.18;

  const leftBoot = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.42), boots));
  leftBoot.name = "soldier_left_boot";
  leftBoot.position.set(-0.18, 0.08, -0.04);

  const rightBoot = addMesh(group, new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.42), boots));
  rightBoot.name = "soldier_right_boot";
  rightBoot.position.set(0.18, 0.08, -0.04);

  const rifle = addMesh(
    group,
    new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 1.28), stdMat(0x161616, 0.5, 0.62))
  );
  rifle.name = "soldier_rifle";
  rifle.position.set(0.48, 1.45, -0.46);
  rifle.rotation.set(0.12, -0.26, -0.1);
}

  group.position.set(x, baseY + (kind === "DRONE" ? 18 + Math.sin(phase) * 4 : kind === "EVTOL" ? 28 + Math.sin(phase) * 5 : 0), z);
  group.rotation.y = Math.atan2(-x, -z);

  return {
    group,
    position: group.position.clone(),
    velocity,
    health: maxHealth,
    maxHealth,
    radius:
      kind === "DRONE" ? 2.4 :
      kind === "EVTOL" ? 4.8 :
      kind === "SOLDIER" ? 1.15 :
      kind === "RADAR" ? 4.2 :
      kind === "ARMOR" ? 4.3 :
      kind === "LAUNCHER" ? 4.4 :
      5.2,
    alive: true,
    kind,
    phase,
    anchor: new THREE.Vector3(x, baseY, z),
  };
}

function targetAimPoint(target: BattlefieldTarget) {
  const point = target.position.clone();
  if (target.kind === "SOLDIER") point.y += 1.35;
  else if (target.kind === "ARMOR" || target.kind === "LAUNCHER" || target.kind === "BUNKER") point.y += 1.4;
  else if (target.kind === "RADAR") point.y += 2.6;
  return point;
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

function animateSoldierBody(target: BattlefieldTarget, time: number, dt: number, moveAmount: number) {
  if (target.kind !== "SOLDIER") return;

  const walk = THREE.MathUtils.clamp(Math.abs(moveAmount) * 0.28, 0, 1);
  const phase = time * 6.5 + target.phase;

  const torso = target.group.getObjectByName("soldier_torso");
  const vest = target.group.getObjectByName("soldier_vest");
  const head = target.group.getObjectByName("soldier_head");
  const helmet = target.group.getObjectByName("soldier_helmet");
  const rifle = target.group.getObjectByName("soldier_rifle");

  const leftArm = target.group.getObjectByName("soldier_left_arm");
  const rightArm = target.group.getObjectByName("soldier_right_arm");
  const leftLeg = target.group.getObjectByName("soldier_left_leg");
  const rightLeg = target.group.getObjectByName("soldier_right_leg");

  const leftBoot = target.group.getObjectByName("soldier_left_boot");
  const rightBoot = target.group.getObjectByName("soldier_right_boot");

  const bodyBob = Math.sin(phase * 2.0) * 0.035 * walk;
  const torsoTwist = Math.sin(phase) * 0.16 * walk;
  const torsoLean = -0.10 * walk + Math.sin(phase * 2.0) * 0.025 * walk;

  // Torso: lean and twist while walking
  if (torso) {
    torso.position.y = 1.42 + bodyBob;
    torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, torsoLean, dt * 8);
    torso.rotation.y = THREE.MathUtils.lerp(torso.rotation.y, torsoTwist, dt * 8);
    torso.rotation.z = THREE.MathUtils.lerp(
      torso.rotation.z,
      Math.sin(phase) * 0.055 * walk,
      dt * 8
    );
  }

  // Vest should follow torso but with less movement
  if (vest) {
    vest.position.y = 1.55 + bodyBob;
    vest.rotation.x = THREE.MathUtils.lerp(vest.rotation.x, torsoLean * 0.7, dt * 8);
    vest.rotation.y = THREE.MathUtils.lerp(vest.rotation.y, torsoTwist * 0.7, dt * 8);
  }

  // Head counter-rotates slightly so it does not look like a statue
  if (head) {
    head.position.y = 2.15 + bodyBob * 0.55;
    head.rotation.y = THREE.MathUtils.lerp(
      head.rotation.y,
      -torsoTwist * 0.35 + Math.sin(time * 1.7 + target.phase) * 0.04,
      dt * 7
    );
    head.rotation.x = THREE.MathUtils.lerp(
      head.rotation.x,
      Math.sin(time * 2.1 + target.phase) * 0.025,
      dt * 7
    );
  }

  if (helmet) {
    helmet.position.y = 2.24 + bodyBob * 0.55;
    helmet.rotation.copy(head?.rotation ?? helmet.rotation);
  }

  // Arms swing opposite to legs
  if (leftArm) {
    leftArm.rotation.x = THREE.MathUtils.lerp(
      leftArm.rotation.x,
      Math.sin(phase) * 0.45 * walk - 0.15,
      dt * 10
    );
    leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, 0.16, dt * 10);
  }

  if (rightArm) {
    rightArm.rotation.x = THREE.MathUtils.lerp(
      rightArm.rotation.x,
      -Math.sin(phase) * 0.45 * walk - 0.15,
      dt * 10
    );
    rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, -0.16, dt * 10);
  }

  // Legs: simple marching motion
  if (leftLeg) {
    leftLeg.rotation.x = THREE.MathUtils.lerp(
      leftLeg.rotation.x,
      -Math.sin(phase) * 0.48 * walk,
      dt * 10
    );
  }

  if (rightLeg) {
    rightLeg.rotation.x = THREE.MathUtils.lerp(
      rightLeg.rotation.x,
      Math.sin(phase) * 0.48 * walk,
      dt * 10
    );
  }

  // Boots lift slightly
  if (leftBoot) {
    leftBoot.position.y = 0.08 + Math.max(0, Math.sin(phase)) * 0.08 * walk;
    leftBoot.rotation.x = THREE.MathUtils.lerp(
      leftBoot.rotation.x,
      Math.max(0, Math.sin(phase)) * 0.25 * walk,
      dt * 10
    );
  }

  if (rightBoot) {
    rightBoot.position.y = 0.08 + Math.max(0, -Math.sin(phase)) * 0.08 * walk;
    rightBoot.rotation.x = THREE.MathUtils.lerp(
      rightBoot.rotation.x,
      Math.max(0, -Math.sin(phase)) * 0.25 * walk,
      dt * 10
    );
  }

  // Rifle moves with chest, but stays mostly controlled
  if (rifle) {
    rifle.position.y = 1.45 + bodyBob;
    rifle.rotation.x = THREE.MathUtils.lerp(
      rifle.rotation.x,
      0.12 + torsoLean * 0.35,
      dt * 8
    );
    rifle.rotation.y = THREE.MathUtils.lerp(
      rifle.rotation.y,
      -0.26 + torsoTwist * 0.35,
      dt * 8
    );
  }
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
    ? targetAimPoint(target).addScaledVector(target.velocity, 0.35)
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
        <div className="grid grid-cols-6 gap-2 text-center">
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
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-400">Armor</p>
            <p className="text-lg font-semibold text-amber-200">{telemetry.armor.toFixed(0)}%</p>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-400">Incoming</p>
            <p className="text-lg font-semibold text-amber-200">{telemetry.incoming}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button className={buttonClass(controls.paused)} onClick={() => setControl("paused", !controls.paused)}>
            {controls.paused ? "Resume" : "Pause"}
          </button>
          <button className={buttonClass(controls.autoRoute)} onClick={() => setControl("autoRoute", !controls.autoRoute)}>
            Auto Route
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
  const [scenePlaying, setScenePlaying] = useState(false);
  const controlsRef = useRef<BattlefieldControls>({
    paused: false,
    cameraMode: "CHASE",
    thermal: false,
    autoRoute: false,
  });
  const commandsRef = useRef<BattlefieldCommands>({ reset: false, fireNow: false, clickTarget: null });
  const [controls, setControls] = useState<BattlefieldControls>(controlsRef.current);
  const [telemetry, setTelemetry] = useState<Telemetry>({ speed: 0, range: 0, shells: 0, targets: 0, armor: 100, incoming: 0 });

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    if (!active) setScenePlaying(false);
  }, [active]);

  useEffect(() => {
    activeRef.current = active && scenePlaying;
  }, [active, scenePlaying]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const mountElement: HTMLDivElement = mount;

    const scene = new THREE.Scene();
    const obstacles: BattlefieldObstacle[] = [];
    buildSky(scene);
    buildLighting(scene);
    buildGround(scene, obstacles);

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
      createAdversaryTarget("BUNKER", 72, -86, 0.1),
      createAdversaryTarget("BUNKER", 146, -132, 1.1),
      createAdversaryTarget("BUNKER", -38, -128, 2.4),
      createAdversaryTarget("RADAR", 16, -118, 2.0),
      createAdversaryTarget("RADAR", 198, -62, 3.1),
      createAdversaryTarget("ARMOR", -112, -38, 0.4),
      createAdversaryTarget("ARMOR", 62, 52, 1.8),
      createAdversaryTarget("ARMOR", 178, 18, 2.9),
      createAdversaryTarget("ARMOR", -38, 112, 3.7),
      createAdversaryTarget("ARMOR", 218, -128, 4.1),
      createAdversaryTarget("ARMOR", -196, 36, 5.4),
      createAdversaryTarget("LAUNCHER", -184, 82, 0.9),
      createAdversaryTarget("LAUNCHER", 112, -166, 2.7),
      createAdversaryTarget("LAUNCHER", 206, 104, 4.7),
      createAdversaryTarget("DRONE", -62, -72, 4.0),
      createAdversaryTarget("DRONE", 114, 36, 5.2),
      createAdversaryTarget("DRONE", 190, -18, 2.8),
      createAdversaryTarget("DRONE", -166, 8, 6.4),
      createAdversaryTarget("DRONE", -32, 148, 7.1),
      createAdversaryTarget("DRONE", 222, 92, 8.3),
      createAdversaryTarget("DRONE", -216, -118, 9.2),
      createAdversaryTarget("EVTOL", -146, 156, 1.5),
      createAdversaryTarget("EVTOL", 42, 168, 3.5),
      createAdversaryTarget("EVTOL", 214, -88, 5.5),
      createAdversaryTarget("EVTOL", -226, -62, 7.5),
      createAdversaryTarget("SOLDIER", -74, 88, 0.2),
      createAdversaryTarget("SOLDIER", -66, 96, 0.8),
      createAdversaryTarget("SOLDIER", -58, 84, 1.4),
      createAdversaryTarget("SOLDIER", 92, -108, 2.1),
      createAdversaryTarget("SOLDIER", 104, -102, 2.7),
      createAdversaryTarget("SOLDIER", 116, -114, 3.3),
      createAdversaryTarget("SOLDIER", 184, 82, 4.2),
      createAdversaryTarget("SOLDIER", 198, 76, 4.8),
      createAdversaryTarget("SOLDIER", -178, -28, 5.6),
      createAdversaryTarget("SOLDIER", -190, -20, 6.1),
    ];
    const targetMeshes: THREE.Object3D[] = [];
    targets.forEach((target, targetIndex) => {
      target.group.traverse((obj) => {
        obj.userData.targetIndex = targetIndex;
        if ((obj as THREE.Mesh).isMesh) targetMeshes.push(obj);
      });
      if (target.kind !== "DRONE" && target.kind !== "EVTOL") {
        obstacles.push({ position: target.position, radius: target.radius + 1.1, source: target });
      }
      scene.add(target.group);
    });

    const shells: Shell[] = [];
    const enemyShots: EnemyShot[] = [];
    const bursts: Burst[] = [];
    const dust: DustPuff[] = [];
    const muzzleFlashes: { group: THREE.Group; age: number }[] = [];
    const clock = new THREE.Clock();
    const camTarget = new THREE.Vector3();
    const camOffset = new THREE.Vector3();
    const scratch = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const targetMarker = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.055, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.9, depthWrite: false })
    );
    targetMarker.rotation.x = Math.PI / 2;
    targetMarker.renderOrder = 6;
    targetMarker.visible = false;
    scene.add(targetMarker);
    const keys = new Set<string>();
    let pathIndex = 0;
    let vehicleSpeed = 0;
    let vehicleYaw = 0;
    let fireCooldown = 0.6;
    let shotCount = 0;
    let vehicleArmor = 100;
    let hudTick = 0;
    let frameId = 0;
    let cinematicYaw = 0;
    let hoveredTarget: BattlefieldTarget | null = null;
    let selectedTarget: BattlefieldTarget | null = null;

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

    function targetFromObject(object: THREE.Object3D | null) {
      let current: THREE.Object3D | null = object;
      while (current) {
        const targetIndex = current.userData.targetIndex;
        if (typeof targetIndex === "number") {
          const target = targets[targetIndex];
          return target?.alive ? target : null;
        }
        current = current.parent;
      }
      return null;
    }

    function pickTarget(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(targetMeshes, false).find((candidate) => targetFromObject(candidate.object));
      return hit ? targetFromObject(hit.object) : null;
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!activeRef.current) return;
      hoveredTarget = pickTarget(event);
      renderer.domElement.style.cursor = hoveredTarget ? "crosshair" : "default";
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!activeRef.current || event.button !== 0) return;
      const target = pickTarget(event);
      if (!target) return;
      event.preventDefault();
      selectedTarget = target;
      commandsRef.current.clickTarget = target;
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

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
      vehicleArmor = 100;
      fireCooldown = 0.6;
      shotCount = 0;
      targets.forEach((target) => {
        target.alive = true;
        target.health = target.maxHealth;
        target.group.visible = true;
        target.group.position.copy(target.anchor);
        if (target.kind === "DRONE") target.group.position.y = terrainHeight(target.anchor.x, target.anchor.z) + 18 + Math.sin(target.phase) * 4;
        else if (target.kind === "EVTOL") target.group.position.y = terrainHeight(target.anchor.x, target.anchor.z) + 28 + Math.sin(target.phase) * 5;
        else target.group.position.y = terrainHeight(target.anchor.x, target.anchor.z);
      });
      hoveredTarget = null;
      selectedTarget = null;
      commandsRef.current.clickTarget = null;
      shells.splice(0).forEach((shell) => {
        scene.remove(shell.mesh, shell.light, shell.trail);
        shell.mesh.geometry.dispose();
        (shell.mesh.material as THREE.Material).dispose();
        shell.trail.geometry.dispose();
        (shell.trail.material as THREE.Material).dispose();
      });
      enemyShots.splice(0).forEach((shot) => {
        scene.remove(shot.mesh, shot.light, shot.trail);
        shot.mesh.geometry.dispose();
        (shot.mesh.material as THREE.Material).dispose();
        shot.trail.geometry.dispose();
        (shot.trail.material as THREE.Material).dispose();
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

    function attackerStats(target: BattlefieldTarget) {
      if (target.kind === "SOLDIER") return { range: 105, cooldown: 1.45, speed: 62, damage: 2.6, blastRadius: 2.5, color: 0xffd27a };
      if (target.kind === "ARMOR") return { range: 145, cooldown: 2.6, speed: 74, damage: 7.5, blastRadius: 4.5, color: 0xff7138 };
      if (target.kind === "LAUNCHER") return { range: 185, cooldown: 4.2, speed: 58, damage: 12, blastRadius: 7.2, color: 0xff4928 };
      if (target.kind === "DRONE") return { range: 125, cooldown: 2.1, speed: 68, damage: 4.2, blastRadius: 3.2, color: 0xffa13d };
      if (target.kind === "EVTOL") return { range: 170, cooldown: 2.8, speed: 78, damage: 6.5, blastRadius: 4.8, color: 0xff8d46 };
      if (target.kind === "BUNKER") return { range: 135, cooldown: 3.0, speed: 70, damage: 6, blastRadius: 4.2, color: 0xff6838 };
      return null;
    }

    function createEnemyShot(attacker: BattlefieldTarget) {
      const stats = attackerStats(attacker);
      if (!stats) return;
      const origin = targetAimPoint(attacker);
      const vehicleAim = vehicle.group.position.clone().add(new THREE.Vector3(0, 1.45, 0));
      const lead = vehicleAim.addScaledVector(
        visualForwardFromYaw(vehicleYaw).clone().multiplyScalar(vehicleSpeed),
        THREE.MathUtils.clamp(origin.distanceTo(vehicleAim) / stats.speed / 2, 0, 0.55)
      );
      const direction = lead.sub(origin).normalize();
      const mesh = new THREE.Mesh(
        attacker.kind === "LAUNCHER"
          ? new THREE.SphereGeometry(0.26, 12, 8)
          : new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshBasicMaterial({ color: stats.color })
      );
      mesh.position.copy(origin);
      const light = new THREE.PointLight(stats.color, attacker.kind === "LAUNCHER" ? 4.8 : 2.2, 14);
      light.position.copy(origin);
      const trail = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([origin, origin]),
        new THREE.LineBasicMaterial({ color: stats.color, transparent: true, opacity: 0.72 })
      );
      scene.add(mesh, light, trail);
      enemyShots.push({
        mesh,
        light,
        velocity: direction.multiplyScalar(stats.speed),
        age: 0,
        damage: stats.damage,
        blastRadius: stats.blastRadius,
        trail,
        sourceKind: attacker.kind,
      });
    }

    function updateEnemyFire(t: number, dt: number) {
      targets.forEach((target, index) => {
        if (!target.alive) return;
        const stats = attackerStats(target);
        if (!stats) return;
        const distance = target.position.distanceTo(vehicle.group.position);
        if (distance > stats.range) return;
        const nextFire = (target.group.userData.nextFireAt as number | undefined) ?? (t + (index % 6) * 0.22);
        if (t < nextFire) return;
        target.group.userData.nextFireAt = t + stats.cooldown + Math.random() * 0.65;
        createEnemyShot(target);
      });
    }

    function updateEnemyShots(dt: number) {
      for (let i = enemyShots.length - 1; i >= 0; i--) {
        const shot = enemyShots[i];
        const previous = shot.mesh.position.clone();
        shot.age += dt;
        if (shot.sourceKind === "LAUNCHER") shot.velocity.y -= 5.2 * dt;
        shot.mesh.position.addScaledVector(shot.velocity, dt);
        shot.light.position.copy(shot.mesh.position);
        shot.trail.geometry.setFromPoints([previous, shot.mesh.position.clone()]);

        const hitVehicle = shot.mesh.position.distanceTo(vehicle.group.position.clone().add(new THREE.Vector3(0, 1.15, 0))) < shot.blastRadius;
        const groundY = terrainHeight(shot.mesh.position.x, shot.mesh.position.z) + 0.25;
        const expired = shot.age > 4.4 || shot.mesh.position.y <= groundY;
        if (hitVehicle || expired) {
          if (hitVehicle) {
            vehicleArmor = Math.max(0, vehicleArmor - shot.damage);
            const knockback = vehicle.group.position.clone().sub(shot.mesh.position);
            knockback.y = 0;
            if (knockback.lengthSq() > 0.001) {
              knockback.normalize();
              vehicle.group.position.addScaledVector(knockback, shot.damage * 0.035);
              vehicleSpeed *= 0.86;
            }
          }
          bursts.push(createBurst(scene, shot.mesh.position.clone(), hitVehicle ? 0.85 : 0.45));
          scene.remove(shot.mesh, shot.light, shot.trail);
          shot.mesh.geometry.dispose();
          (shot.mesh.material as THREE.Material).dispose();
          shot.trail.geometry.dispose();
          (shot.trail.material as THREE.Material).dispose();
          enemyShots.splice(i, 1);
        }
      }
    }

    function resolveVehicleObstacles(previousPosition: THREE.Vector3) {
      const vehicleRadius = 3.25;
      const current = vehicle.group.position;
      for (const obstacle of obstacles) {
        if (obstacle.source && !obstacle.source.alive) continue;
        const obstaclePosition = obstacle.source?.position ?? obstacle.position;
        const dx = current.x - obstaclePosition.x;
        const dz = current.z - obstaclePosition.z;
        const distanceSq = dx * dx + dz * dz;
        const minDistance = vehicleRadius + obstacle.radius;
        if (distanceSq >= minDistance * minDistance) continue;

        const distance = Math.sqrt(Math.max(distanceSq, 0.0001));
        const normalX = dx / distance;
        const normalZ = dz / distance;
        const penetration = minDistance - distance;
        current.x += normalX * penetration;
        current.z += normalZ * penetration;
        current.x = THREE.MathUtils.clamp(current.x, -238, 238);
        current.z = THREE.MathUtils.clamp(current.z, -210, 210);

        const moveX = current.x - previousPosition.x;
        const moveZ = current.z - previousPosition.z;
        if (moveX * normalX + moveZ * normalZ < 0.12) {
          vehicleSpeed *= -0.18;
        } else {
          vehicleSpeed *= 0.35;
        }
      }
      current.y = terrainHeight(current.x, current.z) + VEHICLE_CLEARANCE;
    }

    function updateVehicle(dt: number) {
      const current = vehicle.group.position;
      const previousPosition = current.clone();
      const forwardPressed = keys.has("w") || keys.has("arrowup");
      const reversePressed = keys.has("s") || keys.has("arrowdown");
      const leftPressed = keys.has("a") || keys.has("arrowleft");
      const rightPressed = keys.has("d") || keys.has("arrowright");
      const manualDrive = forwardPressed || reversePressed || leftPressed || rightPressed;
      const autoRoute = controlsRef.current.autoRoute;

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
      } else if (autoRoute) {
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
      } else {
        vehicleSpeed = THREE.MathUtils.lerp(vehicleSpeed, 0, 1 - Math.pow(0.02, dt));
        current.y = terrainHeight(current.x, current.z) + VEHICLE_CLEARANCE;
        vehicle.group.quaternion.slerp(yawToQuaternion(vehicleYaw, current.x, current.z), THREE.MathUtils.clamp(dt * 5.2, 0, 1));
      }

      resolveVehicleObstacles(previousPosition);

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
          const orbit = 20 + (index % 7) * 5;
          const cx = target.anchor.x;
          const cz = target.anchor.z;
          target.group.position.set(
            cx + Math.sin(t * 0.45 + target.phase) * orbit,
            terrainHeight(cx, cz) + 22 + Math.sin(t * 1.2 + target.phase) * 4,
            cz + Math.cos(t * 0.37 + target.phase) * orbit
          );
          target.group.rotation.y += dt * 1.8;
          target.group.traverse((obj) => {
            if (obj.userData.rotor) obj.rotation.y += dt * 18;
          });
        } else if (target.kind === "EVTOL") {
          const orbit = 42 + (index % 4) * 8;
          const cx = target.anchor.x;
          const cz = target.anchor.z;
          const angle = t * 0.22 + target.phase;
          target.group.position.set(
            cx + Math.sin(angle) * orbit,
            terrainHeight(cx, cz) + 34 + Math.sin(t * 0.9 + target.phase) * 7,
            cz + Math.cos(angle * 0.92) * orbit
          );
          target.group.rotation.y = Math.atan2(-Math.cos(angle), Math.sin(angle));
          target.group.rotation.z = Math.sin(t * 0.8 + target.phase) * 0.14;
          target.group.traverse((obj) => {
            if (obj.userData.rotor) obj.rotation.y += dt * 24;
          });
        } else if (target.kind === "RADAR") {
          target.group.rotation.y += dt * 0.55;
        } else if (target.kind === "ARMOR") {
          const sweep = Math.sin(t * 0.28 + target.phase) * 22;
          target.group.position.set(
            target.anchor.x + sweep,
            terrainHeight(target.anchor.x + sweep, target.anchor.z) + 0.02,
            target.anchor.z + Math.cos(t * 0.22 + target.phase) * 10
          );
          target.group.rotation.y = Math.atan2(
            -Math.cos(t * 0.28 + target.phase),
            -Math.sin(t * 0.22 + target.phase)
          );
        } else if (target.kind === "LAUNCHER") {
          target.group.rotation.y = Math.sin(t * 0.35 + target.phase) * 0.32 + Math.atan2(-target.anchor.x, -target.anchor.z);
        } else if (target.kind === "SOLDIER") {
          const toVehicle = vehicle.group.position.clone().sub(target.group.position);
          toVehicle.y = 0;
          const distanceToVehicle = Math.max(0.001, toVehicle.length());
          const approach = toVehicle.normalize();
          const flank = new THREE.Vector3(-approach.z, 0, approach.x);
          const desiredStandOff = 34 + (index % 4) * 5;
          const advance = THREE.MathUtils.clamp((distanceToVehicle - desiredStandOff) * 0.16, -2.6, 4.4);
          const strafe = Math.sin(t * 0.9 + target.phase) * 2.2;
          const px = target.group.position.x + (approach.x * advance + flank.x * strafe) * dt;
          const pz = target.group.position.z + (approach.z * advance + flank.z * strafe) * dt;
          target.group.position.set(px, terrainHeight(px, pz), pz);
          target.group.rotation.y = Math.atan2(vehicle.group.position.x - px, vehicle.group.position.z - pz);
        }
        target.position.copy(target.group.position);
        target.velocity.copy(target.position).sub(previous).divideScalar(Math.max(dt, 0.001));
      });
    }

    function updateTurret(dt: number, target: BattlefieldTarget | null) {
      if (!target) return;
      const aimPoint = targetAimPoint(target);
      const localTarget = vehicle.turret.parent!.worldToLocal(aimPoint.clone());
      const desiredYaw = Math.atan2(-localTarget.x, -localTarget.z);
      const yawError = THREE.MathUtils.euclideanModulo(desiredYaw - vehicle.turret.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      vehicle.turret.rotation.y += THREE.MathUtils.clamp(yawError, -dt * 2.4, dt * 2.4);

      const muzzle = vehicle.muzzleSocket.getWorldPosition(new THREE.Vector3());
      const vertical = aimPoint.y - muzzle.y;
      const horizontal = Math.hypot(aimPoint.x - muzzle.x, aimPoint.z - muzzle.z);
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
        if (shell.target?.alive && shell.mesh.position.distanceTo(targetAimPoint(shell.target)) < shell.target.radius) {
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
        updateEnemyFire(t, dt);
      }

      const { target: nearest, distance } = nearestTarget();
      const aimedTarget =
        selectedTarget?.alive ? selectedTarget :
        hoveredTarget?.alive ? hoveredTarget :
        nearest;
      if (dt > 0) updateTurret(dt, aimedTarget);
      targetMarker.visible = Boolean(aimedTarget?.alive);
      if (aimedTarget?.alive) {
        targetMarker.position.copy(aimedTarget.position);
        targetMarker.position.y = Math.max(aimedTarget.position.y + 0.18, terrainHeight(aimedTarget.position.x, aimedTarget.position.z) + 0.2);
        targetMarker.scale.setScalar(
          aimedTarget.kind === "SOLDIER" ? 0.36 :
          aimedTarget.kind === "DRONE" ? 0.7 :
          aimedTarget.kind === "EVTOL" ? 1.35 :
          aimedTarget.kind === "BUNKER" ? 1.35 :
          1
        );
      }

      const shouldManualFire = commandsRef.current.fireNow;
      const clickTarget = commandsRef.current.clickTarget;
      fireCooldown -= dt;
      if ((shouldManualFire || clickTarget) && fireCooldown <= 0) {
        fireAt(clickTarget?.alive ? clickTarget : aimedTarget);
        fireCooldown = 0.28;
      }
      commandsRef.current.fireNow = false;
      commandsRef.current.clickTarget = null;

      updateShells(dt || rawDt);
      updateEnemyShots(dt || rawDt);
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
          armor: vehicleArmor,
          incoming: enemyShots.length,
        });
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
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
      className="absolute inset-0 h-full min-h-[100svh] w-full"
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
      {!scenePlaying && (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/48 backdrop-blur-sm">
          <button
            className="rounded-lg border border-amber-300/70 bg-amber-300 px-8 py-4 text-lg font-semibold text-black shadow-[0_0_38px_rgba(251,191,36,0.35)] transition hover:bg-amber-200"
            onClick={() => {
              if (active) setScenePlaying(true);
            }}
          >
            Play Battlefield
          </button>
        </div>
      )}
    </div>
  );
}
