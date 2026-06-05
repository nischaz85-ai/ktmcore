"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SIDE_ROAD_Z = [-128, -76, -34, 31, 84, 132];
const ROAD_SURFACE_Y = 0.04;
const VEHICLE_CLEARANCE = 0.015;
const ROVER_LANDING_PAD_LOCAL = new THREE.Vector3(0, 1.45, 1.22);
const ROVER_MASS = 1850;
const LOOP_ROAD_HALF_X = 122;
const LOOP_ROAD_HALF_Z = 184;
const LOOP_ROAD_HALF_WIDTH = 9.5;
const LOOP_LANE_OFFSET = 3.35;
const BUILDING_FOOTPRINT_SCALE = 1.75;
const BUILDING_HEIGHT_SCALE = 2.8;
const EVTOL_FLEET_SIZE = 24;
const EVTOL_LANDING_CLEARANCE = 0.72;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Obstacle {
  position: THREE.Vector3;
  radius: number;
  dynamic?: boolean;
  halfExtents?: THREE.Vector2;
  yaw?: number;
}

interface TrafficVehicle {
  group: THREE.Group;
  obstacle: Obstacle;
  axis: "x" | "z" | "loop";
  lane: number;
  progress: number;
  speed: number;
  min: number;
  max: number;
  direction: 1 | -1;
  verticalVelocity: number;
  velocity: THREE.Vector3;
  impactVelocity: THREE.Vector3;
  mass: number;
  path: THREE.Vector3[];
  pathIndex: number;
  yaw: number;
  steerAngle: number;
  laneOffset: number;
  yawOffset: number;
  yawVelocity: number;
}

interface TrafficPath {
  points: THREE.Vector3[];
  direction: 1 | -1;
}

interface DroneRig {
  group: THREE.Group;
  bladePairs: [THREE.Mesh, THREE.Mesh][];
  navLightMats: THREE.MeshStandardMaterial[];
  role: "SCOUT" | "RELAY" | "GUARD" | "LOGISTICS";
  logisticState: "PATROL" | "APPROACH" | "ALIGN" | "DOCK" | "DEPART";
  logisticTargetVehicleIndex: number;
  dockTimer: number;
  isDocked: boolean;
  hasTargetLock: boolean;
  trackedDeck: THREE.Vector3;
  trackedDeckVelocity: THREE.Vector3;
  departTarget: THREE.Vector3;
  phase: number;
  radius: number;
  speed: number;
  altitude: number;
}

interface EvtolRig {
  group: THREE.Group;
  rotors: THREE.Mesh[];
  navLightMats: THREE.MeshStandardMaterial[];
  beaconMat: THREE.MeshStandardMaterial;
  beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
}

interface RooftopPad {
  position: THREE.Vector3;
  yaw: number;
  kind: "ROOFTOP" | "GROUND";
}

interface EvtolFlightRig extends EvtolRig {
  state: "INBOUND" | "DESCEND" | "LANDED" | "TAKEOFF" | "OUTBOUND";
  padIndex: number;
  horizonIn: THREE.Vector3;
  horizonOut: THREE.Vector3;
  hoverPoint: THREE.Vector3;
  timer: number;
  phase: number;
  cruiseSpeed: number;
  cycles: number;
}

interface HudState {
  speed: number;
  beams: number;
  nearest: number;
}

interface SimulationControls {
  paused: boolean;
  simSpeed: number;
  roverPower: number;
  roverMaxSpeed: number;
  roverSteering: number;
  trafficEnabled: boolean;
  logisticsEnabled: boolean;
  cameraMode: "CHASE" | "TOP" | "ORBIT";
}

interface SimulationCommands {
  resetRover: boolean;
  reassignMissions: boolean;
}

// ── Material helpers ──────────────────────────────────────────────────────────

function stdMat(color: number, roughness = 0.65, metalness = 0.15) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function emissiveMat(color: number, emissive: number, intensity = 1.5) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.1, metalness: 0, emissive, emissiveIntensity: intensity,
  });
}

function glassMat(color: number) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35,
  });
}

// ── Sky ───────────────────────────────────────────────────────────────────────

function terrainHeight(x: number, z: number) {
  const broad = Math.sin(x * 0.028) * 1.8 + Math.cos(z * 0.024) * 1.5;
  const ridges = Math.sin((x + z) * 0.045) * 0.9 + Math.cos((x - z) * 0.036) * 0.7;
  const rawHeight = broad + ridges - 0.25;
  const mainRoadCore = Math.abs(x) <= 13 && Math.abs(z) <= 190;
  const sideRoadCore = SIDE_ROAD_Z.some((roadZ) => Math.abs(z - roadZ) <= 9 && Math.abs(x) <= LOOP_ROAD_HALF_X);
  const loopRoadCore =
    (Math.abs(Math.abs(x) - LOOP_ROAD_HALF_X) <= LOOP_ROAD_HALF_WIDTH && Math.abs(z) <= LOOP_ROAD_HALF_Z + LOOP_ROAD_HALF_WIDTH) ||
    (Math.abs(Math.abs(z) - LOOP_ROAD_HALF_Z) <= LOOP_ROAD_HALF_WIDTH && Math.abs(x) <= LOOP_ROAD_HALF_X + LOOP_ROAD_HALF_WIDTH);

  if (mainRoadCore || sideRoadCore || loopRoadCore) return ROAD_SURFACE_Y;

  const sideRoadFlatten = SIDE_ROAD_Z.reduce((max, roadZ) => {
    const shoulder = Math.abs(x) <= LOOP_ROAD_HALF_X + 5 ? Math.max(0, 1 - (Math.abs(z - roadZ) - 9) / 8) : 0;
    return Math.max(max, shoulder);
  }, 0);
  const mainRoadFlatten = Math.abs(z) <= 194 ? Math.max(0, 1 - (Math.abs(x) - 13) / 8) : 0;
  const loopVerticalFlatten = Math.abs(z) <= LOOP_ROAD_HALF_Z + 18
    ? Math.max(0, 1 - (Math.abs(Math.abs(x) - LOOP_ROAD_HALF_X) - LOOP_ROAD_HALF_WIDTH) / 10)
    : 0;
  const loopHorizontalFlatten = Math.abs(x) <= LOOP_ROAD_HALF_X + 18
    ? Math.max(0, 1 - (Math.abs(Math.abs(z) - LOOP_ROAD_HALF_Z) - LOOP_ROAD_HALF_WIDTH) / 10)
    : 0;
  const flatten = Math.max(mainRoadFlatten, sideRoadFlatten, loopVerticalFlatten, loopHorizontalFlatten);

  return THREE.MathUtils.lerp(rawHeight, ROAD_SURFACE_Y, THREE.MathUtils.clamp(flatten, 0, 1));
}

function isRoadSurface(x: number, z: number) {
  const onMainRoad = Math.abs(x) < 13 && Math.abs(z) < 190;
  const onSideRoad = SIDE_ROAD_Z.some((roadZ) => Math.abs(z - roadZ) < 9 && Math.abs(x) < LOOP_ROAD_HALF_X);
  const onLoopRoad =
    (Math.abs(Math.abs(x) - LOOP_ROAD_HALF_X) < LOOP_ROAD_HALF_WIDTH && Math.abs(z) < LOOP_ROAD_HALF_Z + LOOP_ROAD_HALF_WIDTH) ||
    (Math.abs(Math.abs(z) - LOOP_ROAD_HALF_Z) < LOOP_ROAD_HALF_WIDTH && Math.abs(x) < LOOP_ROAD_HALF_X + LOOP_ROAD_HALF_WIDTH);
  return onMainRoad || onSideRoad || onLoopRoad;
}

function surfaceHeight(x: number, z: number) {
  return terrainHeight(x, z);
}

function terrainNormal(x: number, z: number) {
  const sample = 1.4;
  const left = terrainHeight(x - sample, z);
  const right = terrainHeight(x + sample, z);
  const back = terrainHeight(x, z - sample);
  const front = terrainHeight(x, z + sample);

  return new THREE.Vector3(left - right, sample * 2, back - front).normalize();
}

function surfaceNormal(x: number, z: number) {
  return isRoadSurface(x, z) ? new THREE.Vector3(0, 1, 0) : terrainNormal(x, z);
}

function stepSuspension(currentY: number, verticalVelocity: number, targetY: number, dt: number) {
  const gravity = -24;
  const spring = 95;
  const damping = 16;
  const compression = targetY - currentY;
  let nextVelocity = verticalVelocity + gravity * dt;

  if (compression > -0.18) {
    nextVelocity += compression * spring * dt;
    nextVelocity *= Math.max(0, 1 - damping * dt);
  }

  let nextY = currentY + nextVelocity * dt;
  if (nextY < targetY) {
    nextY = targetY;
    nextVelocity = Math.max(0, nextVelocity * -0.08);
  }

  return { y: nextY, verticalVelocity: nextVelocity };
}

function terrainAdjustedEuler(yaw: number, x: number, z: number) {
  const normal = surfaceNormal(x, z);
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    .projectOnPlane(normal)
    .normalize();
  const right = new THREE.Vector3().crossVectors(normal, forward).normalize();
  const adjustedForward = new THREE.Vector3().crossVectors(right, normal).normalize();
  const matrix = new THREE.Matrix4().makeBasis(right, normal, adjustedForward);

  return new THREE.Euler().setFromRotationMatrix(matrix);
}

function buildSky(scene: THREE.Scene) {
  const cv = document.createElement("canvas");
  cv.width = 2; cv.height = 256;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, "#010810");
  g.addColorStop(0.20, "#071830");
  g.addColorStop(0.42, "#0b2e58");
  g.addColorStop(0.62, "#154f7a");
  g.addColorStop(0.80, "#286e90");
  g.addColorStop(0.92, "#4a96aa");
  g.addColorStop(1.00, "#6abcc8");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);

  const skyTexture = new THREE.CanvasTexture(cv);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  skyTexture.minFilter = THREE.LinearFilter;
  skyTexture.magFilter = THREE.LinearFilter;
  scene.background = skyTexture;

  // Stars
  const N = 1800;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = Math.random() * Math.PI * 2;
    const p = Math.acos(Math.random() * 0.75);
    const r = 480;
    pos[i * 3]     = r * Math.sin(p) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.cos(p);
    pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.72, fog: false, depthWrite: false,
  }));
  stars.renderOrder = -20;
  scene.add(stars);

  // Moon
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xccddef, side: THREE.DoubleSide, fog: false, depthWrite: false, depthTest: false })
  );
  moon.position.set(-75, 125, -155);
  moon.lookAt(0, 0, 0);
  moon.renderOrder = -10;
  scene.add(moon);

  // Horizon haze
  const hz = new THREE.Mesh(
    new THREE.CylinderGeometry(500, 500, 30, 80, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x2d7894, transparent: true, opacity: 0.14,
      side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false,
    })
  );
  hz.position.y = 3;
  hz.renderOrder = -15;
  scene.add(hz);
}

// ── Lighting ──────────────────────────────────────────────────────────────────

function buildLighting(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0x2a5080, 0x061018, 1.15));

  const key = new THREE.DirectionalLight(0xb0ccf0, 2.6);
  key.position.set(-40, 55, -100);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 520;
  key.shadow.camera.left = -210;
  key.shadow.camera.right = 210;
  key.shadow.camera.top = 210;
  key.shadow.camera.bottom = -210;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 3;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xff7733, 0.38);
  fill.position.set(55, 6, 75);
  scene.add(fill);

  const bounce = new THREE.DirectionalLight(0x183050, 0.25);
  bounce.position.set(0, -1, 0);
  scene.add(bounce);
}

// ── Ground & Roads ────────────────────────────────────────────────────────────

function buildGround(scene: THREE.Scene) {
  const groundGeo = new THREE.PlaneGeometry(460, 460, 92, 92);
  const position = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    position.setZ(i, terrainHeight(position.getX(i), -position.getY(i)));
  }
  position.needsUpdate = true;
  groundGeo.computeVertexNormals();

  const ground = new THREE.Mesh(groundGeo, stdMat(0x070d07, 0.88, 0.04));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat     = stdMat(0x111416, 0.9, 0.03);
  const shoulderMat = stdMat(0x181f10, 0.84, 0.02);
  const laneMat     = stdMat(0xccc8a0, 0.5, 0);

  function addPlane(w: number, d: number, y: number, px: number, pz: number, mat: THREE.Material) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(px, y, pz);
    m.receiveShadow = true;
    scene.add(m);
  }

  addPlane(16, 380, 0.025, 0, 0, roadMat);
  addPlane(5.2, 380, 0.022, -10.6, 0, shoulderMat);
  addPlane(5.2, 380, 0.022,  10.6, 0, shoulderMat);
  ([-128, -76, -34, 31, 84, 132] as number[]).forEach(z => addPlane(250, 12, 0.025, 0, z, roadMat));
  addPlane(LOOP_ROAD_HALF_WIDTH * 2, LOOP_ROAD_HALF_Z * 2 + LOOP_ROAD_HALF_WIDTH * 2, 0.026, -LOOP_ROAD_HALF_X, 0, roadMat);
  addPlane(LOOP_ROAD_HALF_WIDTH * 2, LOOP_ROAD_HALF_Z * 2 + LOOP_ROAD_HALF_WIDTH * 2, 0.026, LOOP_ROAD_HALF_X, 0, roadMat);
  addPlane(LOOP_ROAD_HALF_X * 2 + LOOP_ROAD_HALF_WIDTH * 2, LOOP_ROAD_HALF_WIDTH * 2, 0.026, 0, -LOOP_ROAD_HALF_Z, roadMat);
  addPlane(LOOP_ROAD_HALF_X * 2 + LOOP_ROAD_HALF_WIDTH * 2, LOOP_ROAD_HALF_WIDTH * 2, 0.026, 0, LOOP_ROAD_HALF_Z, roadMat);
  addPlane(3.2, LOOP_ROAD_HALF_Z * 2 + LOOP_ROAD_HALF_WIDTH * 2, 0.024, -LOOP_ROAD_HALF_X + LOOP_ROAD_HALF_WIDTH + 2.1, 0, shoulderMat);
  addPlane(3.2, LOOP_ROAD_HALF_Z * 2 + LOOP_ROAD_HALF_WIDTH * 2, 0.024, LOOP_ROAD_HALF_X - LOOP_ROAD_HALF_WIDTH - 2.1, 0, shoulderMat);
  addPlane(LOOP_ROAD_HALF_X * 2 + LOOP_ROAD_HALF_WIDTH * 2, 3.2, 0.024, 0, -LOOP_ROAD_HALF_Z + LOOP_ROAD_HALF_WIDTH + 2.1, shoulderMat);
  addPlane(LOOP_ROAD_HALF_X * 2 + LOOP_ROAD_HALF_WIDTH * 2, 3.2, 0.024, 0, LOOP_ROAD_HALF_Z - LOOP_ROAD_HALF_WIDTH - 2.1, shoulderMat);

  for (let z = -184; z < 185; z += 8) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.8), laneMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(0, 0.045, z);
    scene.add(d);
  }
  ([-128, -76, -34, 31, 84, 132] as number[]).forEach(z => {
    for (let x = -116; x < 117; x += 8) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.2), laneMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.047, z);
      scene.add(d);
    }
  });
  for (let z = -176; z <= 176; z += 8) {
    ([-LOOP_ROAD_HALF_X, LOOP_ROAD_HALF_X] as number[]).forEach(x => {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.8), laneMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.049, z);
      scene.add(d);
    });
  }
  for (let x = -112; x <= 112; x += 8) {
    ([-LOOP_ROAD_HALF_Z, LOOP_ROAD_HALF_Z] as number[]).forEach(z => {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.2), laneMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.049, z);
      scene.add(d);
    });
  }

  const creek = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 170),
    new THREE.MeshStandardMaterial({ color: 0x081e2c, roughness: 0.3, metalness: 0.05 })
  );
  creek.rotation.x = -Math.PI / 2;
  creek.rotation.z = -0.38;
  creek.position.set(-98, 0.036, 12);
  scene.add(creek);
}

// ── Rover ─────────────────────────────────────────────────────────────────────

function createRover(): { rover: THREE.Group; wheels: THREE.Mesh[] } {
  const g = new THREE.Group();

  const hull   = stdMat(0x182530, 0.52, 0.42);
  const armor  = stdMat(0x0e1c25, 0.65, 0.35);
  const accent = emissiveMat(0x00c8ff, 0x00c8ff, 0.9);
  const tire   = stdMat(0x060809, 0.94, 0.04);
  const rim    = stdMat(0x8098b0, 0.32, 0.72);
  const glass  = glassMat(0x88c8e8);

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.58, 4.6), hull);
  body.position.y = 0.82; body.castShadow = true; g.add(body);

  ([-1.56, 1.56] as number[]).forEach(x => {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.52, 4.1), armor);
    sk.position.set(x, 0.72, 0); sk.castShadow = true; g.add(sk);
  });

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.6, 1.7), hull);
  cab.position.set(0, 1.32, -0.38); cab.castShadow = true; g.add(cab);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 0.6), armor);
  nose.position.set(0, 0.82, -2.3); nose.rotation.x = 0.25; nose.castShadow = true; g.add(nose);

  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.4), glass);
  ws.position.set(0, 1.44, -1.2); ws.rotation.x = -0.3; g.add(ws);

  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), accent);
  lid.position.set(0, 1.76, -0.38); lid.castShadow = true; g.add(lid);

  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), stdMat(0x8090a8, 0.5, 0.6));
  ant.position.set(0.62, 2.04, -0.38); g.add(ant);

  const padBase = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, 0.08, 48), armor);
  padBase.position.set(0, 1.16, 1.22);
  padBase.castShadow = true;
  g.add(padBase);

  const padRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.025, 8, 48),
    emissiveMat(0x66ffcc, 0x66ffcc, 1.8)
  );
  padRing.position.set(0, 1.22, 1.22);
  padRing.rotation.x = Math.PI / 2;
  g.add(padRing);

  const padCross = new THREE.Group();
  ([0, Math.PI / 2] as number[]).forEach((rot) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.018, 0.09), emissiveMat(0x00c8ff, 0x00c8ff, 1.25));
    stripe.position.y = 0.02;
    stripe.rotation.y = rot;
    padCross.add(stripe);
  });
  padCross.position.set(0, 1.25, 1.22);
  g.add(padCross);

  ([-0.72, 0.72] as number[]).forEach(x => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.05), emissiveMat(0xfff8dc, 0xfff4d0, 6.5));
    hl.position.set(x, 0.88, -2.34); g.add(hl);
    const sl = new THREE.SpotLight(0xfff0cc, 22, 26, Math.PI / 7, 0.5);
    sl.position.set(x, 0.88, -2.34);
    sl.target.position.set(x * 0.5, 0, -8);
    sl.castShadow = false;
    g.add(sl, sl.target);
  });

  ([-0.7, 0.7] as number[]).forEach(x => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.05), emissiveMat(0xff1a00, 0xff1a00, 2.5));
    tl.position.set(x, 0.88, 2.34); g.add(tl);
  });

  const wheels: THREE.Mesh[] = [];
  const wGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.4, 24);
  const rGeo = new THREE.CylinderGeometry(0.2,  0.2,  0.42, 14);
  ([[-1.52, 0.46, -1.56], [1.52, 0.46, -1.56], [-1.52, 0.46, 0], [1.52, 0.46, 0], [-1.52, 0.46, 1.56], [1.52, 0.46, 1.56]] as [number,number,number][]).forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wGeo, tire); w.position.set(x, y, z); w.rotation.z = Math.PI / 2; w.castShadow = true;
    const r = new THREE.Mesh(rGeo, rim);  r.position.set(x, y, z); r.rotation.z = Math.PI / 2;
    wheels.push(w); g.add(w, r);
  });

  return { rover: g, wheels };
}

// ── Hexacopter Drone ──────────────────────────────────────────────────────────

function createDrone(role: DroneRig["role"]): {
  group: THREE.Group;
  bladePairs: [THREE.Mesh, THREE.Mesh][];
  navLightMats: THREE.MeshStandardMaterial[];
} {
  const g = new THREE.Group();

  const body  = stdMat(0x0a1820, 0.5, 0.45);
  const frame = stdMat(0x182530, 0.45, 0.55);
  const camG  = glassMat(0x0a1525);

  const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.16, 8), body);
  bd.castShadow = true; g.add(bd);

  const dm = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), frame);
  dm.position.y = 0.08; dm.castShadow = true; g.add(dm);

  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), camG);
  cam.position.y = -0.2; g.add(cam);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), stdMat(0x000810, 0.1, 0.1));
  lens.position.set(0, -0.28, 0.09); lens.rotation.x = -0.45; g.add(lens);

  const roleColor = role === "SCOUT" ? 0x00c8ff : role === "RELAY" ? 0xffaa00 : role === "GUARD" ? 0xff2266 : 0x66ffcc;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.028, 8, 32), emissiveMat(roleColor, roleColor, 1.0));
  band.rotation.x = Math.PI / 2; g.add(band);

  const bladePairs: [THREE.Mesh, THREE.Mesh][] = [];
  const navLightMats: THREE.MeshStandardMaterial[] = [];

  [0, 60, 120, 180, 240, 300].forEach((deg, i) => {
    const rad = (deg * Math.PI) / 180;
    const ax = Math.sin(rad) * 1.05;
    const az = Math.cos(rad) * 1.05;

    const armStart = new THREE.Vector3(Math.sin(rad) * 0.22, 0, Math.cos(rad) * 0.22);
    const armEnd = new THREE.Vector3(ax, 0, az);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, armStart.distanceTo(armEnd), 10), frame);
    arm.position.copy(armStart.clone().add(armEnd).multiplyScalar(0.5));
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armEnd.clone().sub(armStart).normalize());
    arm.castShadow = true;
    g.add(arm);

    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.09, 14), stdMat(0x7a8c9a, 0.3, 0.72));
    motor.position.set(ax, 0.05, az); g.add(motor);

    const bGeo = new THREE.BoxGeometry(0.68, 0.013, 0.1);
    const bMat = stdMat(0x1a2a35, 0.6, 0.3);
    const b1 = new THREE.Mesh(bGeo, bMat);
    const b2 = new THREE.Mesh(bGeo, bMat);
    b1.position.set(ax, 0.13, az); b2.position.set(ax, 0.13, az);
    b2.rotation.y = Math.PI / 2;
    b1.castShadow = true; g.add(b1, b2);
    bladePairs.push([b1, b2]);

    const nlColor = i === 0 ? 0xff1010 : i === 3 ? 0x00ff44 : 0xffffff;
    const nlMat = emissiveMat(nlColor, nlColor, 2.5);
    const nl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), nlMat);
    nl.position.set(ax, 0.07, az); g.add(nl);
    navLightMats.push(nlMat);
  });

  return { group: g, bladePairs, navLightMats };
}

// ── Passenger eVTOL ───────────────────────────────────────────────────────────

function createLargeEvtol(): EvtolRig {
  const g = new THREE.Group();
  const hull = stdMat(0xd8edf6, 0.38, 0.28);
  const belly = stdMat(0x233642, 0.56, 0.34);
  const frame = stdMat(0x506877, 0.36, 0.62);
  const dark = stdMat(0x07121a, 0.58, 0.2);
  const glass = glassMat(0x76d9ff);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.92, 10.2), hull);
  cabin.position.y = 0.35;
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  g.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.34, 7.4), stdMat(0xf2fbff, 0.35, 0.18));
  roof.position.set(0, 0.98, -0.45);
  roof.castShadow = true;
  g.add(roof);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.62, 32, 16), hull);
  nose.scale.set(0.95, 0.38, 1.08);
  nose.position.set(0, 0.42, -5.1);
  nose.castShadow = true;
  g.add(nose);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.18, 3.05, 28), hull);
  tail.position.set(0, 0.42, 6.15);
  tail.rotation.x = Math.PI / 2;
  tail.castShadow = true;
  g.add(tail);

  const bellyPod = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.34, 6.6), belly);
  bellyPod.position.set(0, -0.24, 0.35);
  bellyPod.castShadow = true;
  g.add(bellyPod);

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 0.66), glass);
  windshield.position.set(0, 0.83, -5.72);
  windshield.rotation.x = -0.36;
  g.add(windshield);

  ([-1, 1] as number[]).forEach((side) => {
    const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), glass);
    sideWindow.position.set(side * 1.59, 0.72, -3.1);
    sideWindow.rotation.y = side * Math.PI / 2;
    g.add(sideWindow);

    for (let i = 0; i < 5; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.38), glass);
      win.position.set(side * 1.6, 0.67, -2 + i * 1.18);
      win.rotation.y = side * Math.PI / 2;
      g.add(win);
    }

    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.8, 10), frame);
    skid.position.set(side * 1.12, -0.8, 0.35);
    skid.rotation.x = Math.PI / 2;
    skid.castShadow = true;
    g.add(skid);

  });

  const wing = new THREE.Mesh(new THREE.BoxGeometry(15.8, 0.16, 0.82), frame);
  wing.position.set(0, 0.72, -0.9);
  wing.castShadow = true;
  g.add(wing);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.12, 0.56), frame);
  tailWing.position.set(0, 1.0, 5.65);
  tailWing.castShadow = true;
  g.add(tailWing);

  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.75, 1.36), frame);
  tailFin.position.set(0, 1.62, 5.82);
  tailFin.castShadow = true;
  g.add(tailFin);

  const rotors: THREE.Mesh[] = [];
  const navLightMats: THREE.MeshStandardMaterial[] = [];
  const rotorStations: [number, number, number][] = [
    [-7.7, 0.9, -3.25], [-7.25, 0.9, 0.25], [-5.85, 0.9, 4.35],
    [7.7, 0.9, -3.25], [7.25, 0.9, 0.25], [5.85, 0.9, 4.35],
  ];

  rotorStations.forEach(([x, y, z], index) => {
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, Math.abs(x) - 1.35, 10), frame);
    pylon.position.set(x * 0.5 + Math.sign(x) * 0.68, y - 0.05, z);
    pylon.rotation.z = Math.PI / 2;
    pylon.castShadow = true;
    g.add(pylon);

    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.68, 20), dark);
    nacelle.position.set(x, y + 0.02, z);
    nacelle.castShadow = true;
    g.add(nacelle);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.48, 1.48, 0.016, 56),
      new THREE.MeshStandardMaterial({ color: 0x9fdcff, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.16 })
    );
    disc.position.set(x, y + 0.16, z);
    disc.castShadow = true;
    g.add(disc);
    rotors.push(disc);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.014, 0.12), stdMat(0x13212a, 0.48, 0.35));
    blade.position.copy(disc.position);
    blade.rotation.y = index % 2 === 0 ? 0 : Math.PI / 2;
    blade.castShadow = true;
    g.add(blade);
    rotors.push(blade);
  });

  const redMat = emissiveMat(0xff1a1a, 0xff1a1a, 2.8);
  const greenMat = emissiveMat(0x32ff6a, 0x32ff6a, 2.8);
  const beaconMat = emissiveMat(0xfff4d0, 0xfff4d0, 3.5);
  const leftNav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), redMat);
  leftNav.position.set(-6.9, 0.95, -0.7);
  const rightNav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), greenMat);
  rightNav.position.set(6.9, 0.95, -0.7);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), beaconMat);
  beacon.position.set(0, 1.15, -3.2);
  g.add(leftNav, rightNav, beacon);
  navLightMats.push(redMat, greenMat);

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, 8.2, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xbdefff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beam.position.set(0, -4.2, -3.25);
  beam.rotation.x = Math.PI;
  beam.renderOrder = 5;
  g.add(beam);

  g.scale.setScalar(1);
  return { group: g, rotors, navLightMats, beaconMat, beam };
}

// ── Buildings ─────────────────────────────────────────────────────────────────

function createBuilding(w: number, d: number, h: number, style: number): THREE.Group {
  const g = new THREE.Group();
  const wallColors = [0x1c2c38, 0x1e2e24, 0x281e1c, 0x1a2434];
  const trimColors = [0x00c8ff, 0x44ff88, 0xff8800, 0xff2066];
  const wallMat = stdMat(wallColors[style % 4], 0.72, 0.1);
  const trimColor = trimColors[style % 4];

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);

  const winMat = emissiveMat(0x88d0ff, 0x88d0ff, 0.35);
  const addWindowWall = (side: "front" | "back" | "left" | "right") => {
    const horizontalSpan = side === "front" || side === "back" ? w : d;
    const rows = Math.max(2, Math.floor((h - 1.4) / 1.45));
    const cols = Math.max(2, Math.floor((horizontalSpan - 1.2) / 1.25));
    const matrices: THREE.Matrix4[] = [];
    const rotation = new THREE.Euler();
    const quaternion = new THREE.Quaternion();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (((r * 7 + c * 11 + style * 5) % 10) < 3) continue;

        const position = new THREE.Vector3();
        const horizontal = -horizontalSpan / 2 + 0.78 + c * 1.25;
        const y = 1.15 + r * 1.45;

        if (side === "front") {
          position.set(horizontal, y, d / 2 + 0.012);
          rotation.set(0, 0, 0);
        } else if (side === "back") {
          position.set(-horizontal, y, -d / 2 - 0.012);
          rotation.set(0, Math.PI, 0);
        } else if (side === "left") {
          position.set(-w / 2 - 0.012, y, -horizontal);
          rotation.set(0, -Math.PI / 2, 0);
        } else {
          position.set(w / 2 + 0.012, y, horizontal);
          rotation.set(0, Math.PI / 2, 0);
        }
        quaternion.setFromEuler(rotation);
        matrices.push(new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)));
      }
    }

    if (matrices.length > 0) {
      const windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.64), winMat, matrices.length);
      matrices.forEach((matrix, index) => windows.setMatrixAt(index, matrix));
      windows.instanceMatrix.needsUpdate = true;
      windows.frustumCulled = false;
      g.add(windows);
    }
  };
  addWindowWall("front");
  addWindowWall("back");
  addWindowWall("left");
  addWindowWall("right");

  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.16, d + 0.1), emissiveMat(trimColor, trimColor, 0.5));
  trim.position.y = h + 0.08; g.add(trim);

  if (style % 2 === 0) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8), stdMat(0x7a8898, 0.45, 0.6));
    ant.position.set(w * 0.3, h + 0.7, -d * 0.3); g.add(ant);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), emissiveMat(0xff1a00, 0xff1a00, 3.5));
    blink.position.set(w * 0.3, h + 1.45, -d * 0.3); g.add(blink);
  }
  return g;
}

function createGroundLandingPad(style: number): THREE.Group {
  const g = new THREE.Group();
  const baseMat = stdMat(0x10191b, 0.78, 0.08);
  const ringColor = style % 2 === 0 ? 0x66ffcc : 0x00c8ff;
  const ringMat = emissiveMat(ringColor, ringColor, 1.5);
  const amberMat = emissiveMat(0xffaa22, 0xffaa22, 2.2);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.45, 0.08, 72), baseMat);
  base.position.y = 0.04;
  base.receiveShadow = true;
  g.add(base);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.07, 10, 80), ringMat);
  ring.position.y = 0.11;
  ring.rotation.x = Math.PI / 2;
  g.add(ring);

  ([0, Math.PI / 2] as number[]).forEach((rot) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.035, 0.18), ringMat);
    stripe.position.y = 0.13;
    stripe.rotation.y = rot;
    g.add(stripe);
  });

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), amberMat);
    light.position.set(Math.sin(angle) * 3.72, 0.2, Math.cos(angle) * 3.72);
    g.add(light);
  }

  return g;
}

// ── Trees ─────────────────────────────────────────────────────────────────────

function createTree(h: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.27, h * 0.38, 10), stdMat(0x2b190e, 0.9, 0.02));
  trunk.position.y = h * 0.19; trunk.castShadow = true; g.add(trunk);
  ([0, 0.28, 0.52] as number[]).forEach((yo, i) => {
    const r = h * 0.42 * (1 - i * 0.22);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.36, 10), stdMat(0x0d2e14 + i * 0x040800, 0.82, 0.01));
    cone.position.y = h * 0.52 + yo * h * 0.5; cone.castShadow = true; g.add(cone);
  });
  return g;
}

// ── Sedan ─────────────────────────────────────────────────────────────────────

function createSedan(color: number): THREE.Group {
  const g = new THREE.Group();
  const bm   = stdMat(color, 0.38, 0.38);
  const tire = stdMat(0x060809, 0.94, 0.04);
  const rim  = stdMat(0xb0c0d0, 0.28, 0.78);
  const glass = glassMat(0x88c8e8);

  const lo = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 4.2), bm);
  lo.position.y = 0.54; lo.castShadow = true; lo.receiveShadow = true; g.add(lo);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.56, 2.1), bm);
  cab.position.set(0, 1.02, -0.14); cab.castShadow = true; g.add(cab);

  const wg = new THREE.PlaneGeometry(1.42, 0.46);
  const fw = new THREE.Mesh(wg, glass); fw.position.set(0, 1.08, -1.24); fw.rotation.x = 0.32; g.add(fw);
  const rw = new THREE.Mesh(wg, glass); rw.position.set(0, 1.08, 0.96);  rw.rotation.x = -0.32; g.add(rw);

  const wGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20);
  const rGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.26, 12);
  ([[-1.04, 0.34, -1.38], [1.04, 0.34, -1.38], [-1.04, 0.34, 1.38], [1.04, 0.34, 1.38]] as [number,number,number][]).forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wGeo, tire); w.position.set(x, y, z); w.rotation.z = Math.PI / 2; w.castShadow = true;
    const r = new THREE.Mesh(rGeo, rim);  r.position.set(x, y, z); r.rotation.z = Math.PI / 2;
    g.add(w, r);
  });

  ([-0.68, 0.68] as number[]).forEach(x => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.05), emissiveMat(0xfff7d8, 0xfff1c6, 5.5));
    hl.position.set(x, 0.66, -2.12);
    g.add(hl);

    const beam = new THREE.SpotLight(0xffe8b8, 14, 28, Math.PI / 8, 0.56, 1.5);
    beam.position.set(x, 0.68, -2.16);
    beam.target.position.set(x * 0.45, 0.42, -8.5);
    beam.castShadow = false;
    g.add(beam, beam.target);
  });

  ([-0.68, 0.68] as number[]).forEach(x => {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.04), emissiveMat(0xff1200, 0xff1200, 2));
    tl.position.set(x, 0.65, 2.12); g.add(tl);
  });
  return g;
}

// ── Sensor Tower ──────────────────────────────────────────────────────────────

function createSolarArray(): THREE.Group {
  const g = new THREE.Group();
  const panel = new THREE.MeshStandardMaterial({
    color: 0x08131c,
    roughness: 0.22,
    metalness: 0.45,
    emissive: 0x001a2a,
    emissiveIntensity: 0.28,
  });
  const frame = stdMat(0x8794a0, 0.34, 0.62);

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.15), panel);
      slab.position.set((col - 1.5) * 2.35, 0.75, (row - 0.5) * 1.45);
      slab.rotation.x = -0.35;
      slab.castShadow = true;
      g.add(slab);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.8, 8), frame);
      post.position.set(slab.position.x, 0.36, slab.position.z + 0.25);
      post.castShadow = true;
      g.add(post);
    }
  }

  return g;
}

function createContainerStack(): THREE.Group {
  const g = new THREE.Group();
  const colors = [0x314f60, 0x533b2f, 0x2c4638, 0x4a4d58];

  for (let i = 0; i < 6; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 1.25, 1.7),
      stdMat(colors[i % colors.length], 0.68, 0.08)
    );
    box.position.set((i % 2) * 2.85, 0.65 + Math.floor(i / 2) * 1.25, (i % 3) * 1.85);
    box.castShadow = true;
    box.receiveShadow = true;
    g.add(box);
  }

  return g;
}

function createSensorTower(h: number): THREE.Group {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, h, 12), stdMat(0x5a7080, 0.45, 0.5));
  mast.position.y = h / 2; mast.castShadow = true;
  const dish = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.055, 10, 28), emissiveMat(0x00d7ff, 0x00d7ff, 0.7));
  dish.position.y = h + 0.3; dish.rotation.x = Math.PI / 2.4;
  const scan = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), emissiveMat(0x00d7ff, 0x00d7ff, 0.7));
  scan.position.y = h + 0.62;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.38, 12), stdMat(0x5a7080, 0.45, 0.5));
  base.position.y = 0.19;
  g.add(mast, dish, scan, base);
  return g;
}

// ── Utility Pole ─────────────────────────────────────────────────────────────

function createUtilityPole(h: number): THREE.Group {
  const g = new THREE.Group();
  const pm = stdMat(0x382718, 0.84, 0.02);
  const p  = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, h, 10), pm);
  p.position.y = h / 2; p.castShadow = true;
  const cb = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.09, 0.09), pm);
  cb.position.y = h * 0.8; cb.castShadow = true;
  g.add(p, cb);
  return g;
}

// ── Collision helpers ─────────────────────────────────────────────────────────

function avoidanceForce(pos: THREE.Vector3, obs: Obstacle[], clearance: number): THREE.Vector3 {
  const f = new THREE.Vector3();
  obs.forEach(o => {
    const off = pos.clone().sub(o.position); off.y = 0;
    const d = Math.max(off.length(), 0.001);
    const inf = o.radius + clearance;
    if (d < inf) f.addScaledVector(off.normalize(), (inf - d) / inf);
  });
  return f;
}

function circleObstacleContact(pos: THREE.Vector3, radius: number, obstacle: Obstacle) {
  if (!obstacle.halfExtents) {
    const off = pos.clone().sub(obstacle.position);
    off.y = 0;
    const distance = Math.max(off.length(), 0.001);
    const minDistance = obstacle.radius + radius;
    return distance < minDistance ? off.normalize().multiplyScalar(minDistance - distance) : null;
  }

  const yaw = obstacle.yaw ?? 0;
  const toCircle = pos.clone().sub(obstacle.position);
  toCircle.y = 0;
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const localX = toCircle.dot(right);
  const localZ = toCircle.dot(forward);
  const closestX = THREE.MathUtils.clamp(localX, -obstacle.halfExtents.x, obstacle.halfExtents.x);
  const closestZ = THREE.MathUtils.clamp(localZ, -obstacle.halfExtents.y, obstacle.halfExtents.y);
  const dx = localX - closestX;
  const dz = localZ - closestZ;
  const distanceSq = dx * dx + dz * dz;

  if (distanceSq > radius * radius) return null;

  const distance = Math.sqrt(distanceSq);
  if (distance > 0.001) {
    return right.multiplyScalar(dx / distance).addScaledVector(forward, dz / distance).multiplyScalar(radius - distance);
  }

  const sideGap = obstacle.halfExtents.x - Math.abs(localX);
  const endGap = obstacle.halfExtents.y - Math.abs(localZ);
  if (sideGap < endGap) {
    return right.multiplyScalar(localX >= 0 ? 1 : -1).multiplyScalar(radius + sideGap);
  }
  return forward.multiplyScalar(localZ >= 0 ? 1 : -1).multiplyScalar(radius + endGap);
}

function resolveCollision(pos: THREE.Vector3, obs: Obstacle[], radius: number, includeDynamic = false): THREE.Vector3 {
  const c = new THREE.Vector3();
  obs.forEach(o => {
    if (o.dynamic && !includeDynamic) return;
    const push = circleObstacleContact(pos, radius, o);
    if (push) c.add(push);
  });
  return c;
}

// ── HUD ───────────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  position: "absolute",
  background: "rgba(2,10,20,0.82)",
  border: "1px solid rgba(0,200,255,0.28)",
  borderRadius: 6,
  padding: "10px 14px",
  lineHeight: 1.8,
  backdropFilter: "blur(4px)",
  fontFamily: "'Courier New', monospace",
  fontSize: 12,
  color: "#00e0ff",
  pointerEvents: "none",
};

function HUD({
  speed,
  beams,
  nearest,
  controls,
  onControlsChange,
  onResetRover,
  onReassignMissions,
}: HudState & {
  controls: SimulationControls;
  onControlsChange: (controls: SimulationControls) => void;
  onResetRover: () => void;
  onReassignMissions: () => void;
}) {
  const nearColor = nearest < 7 ? "#ff3333" : nearest < 14 ? "#ff8844" : "#00ff88";
  const updateControls = (patch: Partial<SimulationControls>) => onControlsChange({ ...controls, ...patch });
  const buttonStyle: React.CSSProperties = {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "rgba(0,220,255,0.34)",
    background: "rgba(0,90,130,0.2)",
    color: "#dffcff",
    borderRadius: 6,
    padding: "7px 9px",
    fontFamily: "'Courier New', monospace",
    fontSize: 11,
    cursor: "pointer",
  };
  const activeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: "rgba(0,220,255,0.26)",
    borderColor: "rgba(102,255,204,0.62)",
    color: "#ffffff",
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
      {/* Status */}
      <div style={{ ...panel, top: 76, left: 16, minWidth: 200 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.55, marginBottom: 6 }}>
          AUTONOMOUS SYSTEMS DEMO
        </div>
        <div>Speed: <span style={{ color: "#fff" }}>{Math.abs(speed).toFixed(1)} m/s</span></div>
        <div>Drones Active: <span style={{ color: "#fff" }}>20</span></div>
        <div>Scan Beams: <span style={{ color: "#00ff88" }}>{beams}</span></div>
        <div>Nearest Object: <span style={{ color: nearColor }}>
          {nearest < 99 ? `${nearest.toFixed(1)} m` : "— m"}
        </span></div>
      </div>

      {/* Simulator */}
      <div style={{ ...panel, top: 76, right: 16, width: 265, pointerEvents: "auto" }}>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.55, marginBottom: 8 }}>
          SIMULATION
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <button
            type="button"
            style={controls.paused ? buttonStyle : activeButtonStyle}
            onClick={() => updateControls({ paused: !controls.paused })}
          >
            {controls.paused ? "Run" : "Pause"}
          </button>
          <button type="button" style={buttonStyle} onClick={onResetRover}>
            Reset Rover
          </button>
          <button
            type="button"
            style={controls.trafficEnabled ? activeButtonStyle : buttonStyle}
            onClick={() => updateControls({ trafficEnabled: !controls.trafficEnabled })}
          >
            Traffic
          </button>
          <button
            type="button"
            style={controls.logisticsEnabled ? activeButtonStyle : buttonStyle}
            onClick={() => updateControls({ logisticsEnabled: !controls.logisticsEnabled })}
          >
            Logistics
          </button>
        </div>
        <label style={{ display: "block", color: "#9befff", marginBottom: 8 }}>
          <span style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span>Time Scale</span>
            <span style={{ color: "#fff" }}>{controls.simSpeed.toFixed(1)}x</span>
          </span>
          <input
            aria-label="Simulation time scale"
            type="range"
            min="0.3"
            max="1.6"
            step="0.1"
            value={controls.simSpeed}
            onChange={(event) => updateControls({ simSpeed: Number(event.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block", color: "#9befff", marginBottom: 8 }}>
          <span style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span>Rover Power</span>
            <span style={{ color: "#fff" }}>{controls.roverPower.toFixed(1)}x</span>
          </span>
          <input
            aria-label="Rover power"
            type="range"
            min="0.4"
            max="1.8"
            step="0.1"
            value={controls.roverPower}
            onChange={(event) => updateControls({ roverPower: Number(event.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block", color: "#9befff", marginBottom: 8 }}>
          <span style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span>Rover Speed Cap</span>
            <span style={{ color: "#fff" }}>{controls.roverMaxSpeed.toFixed(0)} m/s</span>
          </span>
          <input
            aria-label="Rover speed cap"
            type="range"
            min="8"
            max="32"
            step="1"
            value={controls.roverMaxSpeed}
            onChange={(event) => updateControls({ roverMaxSpeed: Number(event.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
        <label style={{ display: "block", color: "#9befff", marginBottom: 8 }}>
          <span style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span>Steering</span>
            <span style={{ color: "#fff" }}>{controls.roverSteering.toFixed(1)}x</span>
          </span>
          <input
            aria-label="Rover steering"
            type="range"
            min="0.5"
            max="1.8"
            step="0.1"
            value={controls.roverSteering}
            onChange={(event) => updateControls({ roverSteering: Number(event.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 10 }}>
          {(["CHASE", "TOP", "ORBIT"] as SimulationControls["cameraMode"][]).map((mode) => (
            <button
              key={mode}
              type="button"
              style={controls.cameraMode === mode ? activeButtonStyle : buttonStyle}
              onClick={() => updateControls({ cameraMode: mode })}
            >
              {mode}
            </button>
          ))}
        </div>
        <button
          type="button"
          style={{ ...buttonStyle, width: "100%", marginTop: 8 }}
          onClick={onReassignMissions}
        >
          New Drone Missions
        </button>
      </div>

      {/* Controls */}
      <div style={{ ...panel, bottom: 16, left: 16, fontSize: 11, lineHeight: 1.9 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.55, marginBottom: 4 }}>CONTROLS</div>
        <div>W / ↑ &nbsp; Forward</div>
        <div>S / ↓ &nbsp; Reverse</div>
        <div>A / ← &nbsp; Turn Left</div>
        <div>D / → &nbsp; Turn Right</div>
      </div>

      {/* Legend */}
      <div style={{ ...panel, bottom: 16, right: 16, fontSize: 11, lineHeight: 1.9 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.55, marginBottom: 4 }}>DRONE ROLES</div>
        {([ ["#00c8ff","SCOUT","Rover escort"], ["#ffaa00","RELAY","Grid patrol"], ["#ff2266","GUARD","Zone coverage"], ["#66ffcc","LOGISTICS","Vehicle dock cycle"] ] as [string,string,string][]).map(([color, role, desc]) => (
          <div key={role}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 6, verticalAlign: "middle" }} />
            {role} — {desc}
          </div>
        ))}
        <div style={{ marginTop: 6, color: "rgba(0,220,255,0.5)", fontSize: 10 }}>— LiDAR scan rays</div>
      </div>

      {/* Crosshair */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 22, height: 22, border: "1px solid rgba(0,220,255,0.35)", borderRadius: "50%",
      }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DroneSimulation3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<HudState>({ speed: 0, beams: 0, nearest: 99 });
  const [controls, setControls] = useState<SimulationControls>({
    paused: false,
    simSpeed: 0.8,
    roverPower: 1,
    roverMaxSpeed: 20,
    roverSteering: 1,
    trafficEnabled: true,
    logisticsEnabled: true,
    cameraMode: "CHASE",
  });
  const controlsRef = useRef<SimulationControls>(controls);
  const commandsRef = useRef<SimulationCommands>({ resetRover: false, reassignMissions: false });

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene setup ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b2e58, 0.0024);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 560);
    camera.position.set(0, 9, 15);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.setClearColor(0x0b2e58, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.zIndex = "0";
    // Canvas must fill the mount div — set style before appending
    mount.appendChild(renderer.domElement);

    // ── Build world ──────────────────────────────────────────────────────────
    buildSky(scene);
    buildLighting(scene);
    buildGround(scene);

    const obstacles: Obstacle[] = [];
    const rooftopPads: RooftopPad[] = [];
    const sideRoadZ = SIDE_ROAD_Z;

    function isOnRoad(pos: THREE.Vector3, radius: number) {
      const onMainRoad = Math.abs(pos.x) < 13 + radius && Math.abs(pos.z) < 190;
      const onSideRoad = sideRoadZ.some((z) => Math.abs(pos.z - z) < 9 + radius && Math.abs(pos.x) < LOOP_ROAD_HALF_X + radius);
      const onLoopRoad =
        (Math.abs(Math.abs(pos.x) - LOOP_ROAD_HALF_X) < LOOP_ROAD_HALF_WIDTH + radius && Math.abs(pos.z) < LOOP_ROAD_HALF_Z + LOOP_ROAD_HALF_WIDTH + radius) ||
        (Math.abs(Math.abs(pos.z) - LOOP_ROAD_HALF_Z) < LOOP_ROAD_HALF_WIDTH + radius && Math.abs(pos.x) < LOOP_ROAD_HALF_X + LOOP_ROAD_HALF_WIDTH + radius);
      return onMainRoad || onSideRoad || onLoopRoad;
    }

    function offRoadPosition(x: number, z: number, radius: number) {
      const pos = new THREE.Vector3(x, 0, z);

      if (Math.abs(pos.x) < 13 + radius && Math.abs(pos.z) < 190) {
        pos.x = (pos.x < 0 ? -1 : 1) * (16 + radius);
      }

      sideRoadZ.forEach((roadZ) => {
        if (Math.abs(pos.z - roadZ) < 9 + radius && Math.abs(pos.x) < LOOP_ROAD_HALF_X + radius) {
          pos.z = roadZ + (pos.z < roadZ ? -1 : 1) * (11 + radius);
        }
      });
      if (Math.abs(Math.abs(pos.x) - LOOP_ROAD_HALF_X) < LOOP_ROAD_HALF_WIDTH + radius && Math.abs(pos.z) < LOOP_ROAD_HALF_Z + LOOP_ROAD_HALF_WIDTH + radius) {
        pos.x = Math.sign(pos.x || 1) * (LOOP_ROAD_HALF_X + LOOP_ROAD_HALF_WIDTH + radius + 2);
      }
      if (Math.abs(Math.abs(pos.z) - LOOP_ROAD_HALF_Z) < LOOP_ROAD_HALF_WIDTH + radius && Math.abs(pos.x) < LOOP_ROAD_HALF_X + LOOP_ROAD_HALF_WIDTH + radius) {
        pos.z = Math.sign(pos.z || 1) * (LOOP_ROAD_HALF_Z + LOOP_ROAD_HALF_WIDTH + radius + 2);
      }

      return pos;
    }

    function openPosition(x: number, z: number, radius: number) {
      const pos = offRoadPosition(x, z, radius);

      for (let attempt = 0; attempt < 8; attempt++) {
        const hit = obstacles.find((obstacle) => {
          const dx = pos.x - obstacle.position.x;
          const dz = pos.z - obstacle.position.z;
          return Math.hypot(dx, dz) < obstacle.radius + radius + 1.8;
        });

        if (!hit && !isOnRoad(pos, radius)) {
          pos.y = terrainHeight(pos.x, pos.z);
          return pos;
        }

        const away = hit
          ? pos.clone().sub(hit.position)
          : new THREE.Vector3(pos.x < 0 ? -1 : 1, 0, 0);
        away.y = 0;
        if (away.lengthSq() < 0.001) away.set(pos.x < 0 ? -1 : 1, 0, 0);
        pos.addScaledVector(away.normalize(), (hit?.radius ?? 3) + radius + 2);
        const fixed = offRoadPosition(pos.x, pos.z, radius);
        pos.copy(fixed);
      }

      pos.y = terrainHeight(pos.x, pos.z);
      return pos;
    }

    function roadVehicleRoute(x: number, z: number) {
      const nearLoop =
        Math.abs(Math.abs(x) - LOOP_ROAD_HALF_X) < 24 ||
        Math.abs(Math.abs(z) - LOOP_ROAD_HALF_Z) < 24;
      if (nearLoop) {
        const lane = x + z > 0 ? LOOP_LANE_OFFSET : -LOOP_LANE_OFFSET;
        const { perimeter } = loopRouteAt(0, lane);
        return {
          axis: "loop" as const,
          lane,
          progress: loopProgressFromPoint(x, z, lane),
          min: 0,
          max: perimeter,
        };
      }

      const nearestSideRoad = sideRoadZ.reduce((nearest, roadZ) => (
        Math.abs(z - roadZ) < Math.abs(z - nearest) ? roadZ : nearest
      ), sideRoadZ[0]);

      if (Math.abs(z - nearestSideRoad) < 18 && Math.abs(x) < LOOP_ROAD_HALF_X - 6) {
        const laneOffset = x >= 0 ? -LOOP_LANE_OFFSET : LOOP_LANE_OFFSET;
        return {
          axis: "x" as const,
          lane: nearestSideRoad + laneOffset,
          progress: THREE.MathUtils.clamp(x, -112, 112),
          min: -112,
          max: 112,
        };
      }

      return {
        axis: "z" as const,
        lane: x < 0 ? -3.8 : 3.8,
        progress: THREE.MathUtils.clamp(z, -178, 178),
        min: -178,
        max: 178,
      };
    }

    const closedPath = (points: [number, number][]) => points.map(([x, z]) => (
      new THREE.Vector3(x, surfaceHeight(x, z) + VEHICLE_CLEARANCE, z)
    ));
    const clockwiseLoop = (left: number, right: number, top: number, bottom: number, lane = LOOP_LANE_OFFSET) => closedPath([
      [left + lane, top + lane],
      [right - lane, top + lane],
      [right - lane, bottom - lane],
      [left + lane, bottom - lane],
    ]);
    const counterClockwiseLoop = (left: number, right: number, top: number, bottom: number, lane = LOOP_LANE_OFFSET) => closedPath([
      [left - lane, top - lane],
      [left - lane, bottom + lane],
      [right + lane, bottom + lane],
      [right + lane, top - lane],
    ]);
    const makeTrafficPath = (points: THREE.Vector3[], direction: 1 | -1 = 1): TrafficPath => ({ points, direction });
    const trafficPaths: TrafficPath[] = [
      makeTrafficPath(clockwiseLoop(-LOOP_ROAD_HALF_X, LOOP_ROAD_HALF_X, -LOOP_ROAD_HALF_Z, LOOP_ROAD_HALF_Z)),
      makeTrafficPath(counterClockwiseLoop(-LOOP_ROAD_HALF_X, LOOP_ROAD_HALF_X, -LOOP_ROAD_HALF_Z, LOOP_ROAD_HALF_Z)),
      makeTrafficPath(clockwiseLoop(-112, 112, -128, -76)),
      makeTrafficPath(counterClockwiseLoop(-112, 112, -128, -76)),
      makeTrafficPath(clockwiseLoop(-112, 112, -34, 31)),
      makeTrafficPath(counterClockwiseLoop(-112, 112, -34, 31)),
      makeTrafficPath(clockwiseLoop(-112, 112, 84, 132)),
      makeTrafficPath(counterClockwiseLoop(-112, 112, 84, 132)),
      makeTrafficPath(clockwiseLoop(-92, 92, -184, -128)),
      makeTrafficPath(clockwiseLoop(-92, 92, 132, 184)),
      makeTrafficPath(closedPath([[-3.8, -178], [-3.8, -128], [-112, -128], [-112, -184], [3.8, -184], [3.8, -76], [112, -76], [112, -128]])),
      makeTrafficPath(closedPath([[3.8, -34], [3.8, 31], [112, 31], [112, 84], [-3.8, 84], [-3.8, 31], [-112, 31], [-112, -34]])),
    ];
    const nearestPathIndex = (path: THREE.Vector3[], x: number, z: number) => path.reduce((best, point, pointIndex) => {
      const bestPoint = path[best];
      return Math.hypot(point.x - x, point.z - z) < Math.hypot(bestPoint.x - x, bestPoint.z - z) ? pointIndex : best;
    }, 0);

    function addObs(obj: THREE.Object3D, pos: THREE.Vector3, radius: number) {
      obj.position.copy(pos);
      scene.add(obj);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3();
      box.getSize(size);
      const halfExtents = size.x > 0.4 && size.z > 0.4
        ? new THREE.Vector2(Math.max(0.25, size.x * 0.5), Math.max(0.25, size.z * 0.5))
        : undefined;
      obstacles.push({
        position: pos.clone(),
        radius,
        halfExtents,
        yaw: obj.rotation.y,
      });
    }

    function addBuildingObs(x: number, z: number, w: number, d: number, h: number, style: number) {
      const scaledW = w * BUILDING_FOOTPRINT_SCALE;
      const scaledD = d * BUILDING_FOOTPRINT_SCALE;
      const scaledH = h * BUILDING_HEIGHT_SCALE;
      const building = createBuilding(scaledW, scaledD, scaledH, style);
      const radius = Math.max(scaledW, scaledD) * 0.72;
      const pos = openPosition(x, z, radius);
      const canHostPad = scaledW > 8.8 && scaledD > 8.4 && scaledH > 18;

      if (canHostPad) {
        const padMat = emissiveMat(0x66ffcc, 0x66ffcc, 1.4);
        const padRing = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.055, 8, 64), padMat);
        padRing.position.set(0, scaledH + 0.24, 0);
        padRing.rotation.x = Math.PI / 2;
        building.add(padRing);

        const padLineMat = emissiveMat(0x00c8ff, 0x00c8ff, 1.1);
        ([0, Math.PI / 2] as number[]).forEach((rot) => {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.035, 0.16), padLineMat);
          stripe.position.set(0, scaledH + 0.26, 0);
          stripe.rotation.y = rot;
          building.add(stripe);
        });

        rooftopPads.push({
          position: new THREE.Vector3(pos.x, pos.y + scaledH + EVTOL_LANDING_CLEARANCE, pos.z),
          yaw: style % 2 === 0 ? 0 : Math.PI / 2,
          kind: "ROOFTOP",
        });
      }

      addObs(building, pos, radius);
    }

    // Buildings
    ([[-22,-156,4.2,5.2,5.5,0],[26,-142,5.4,5.1,7.2,1],[-42,-122,6.8,6.2,10.5,2],
      [46,-106,7.5,6.5,12.4,3],[-22,-72,4.2,5.2,5.5,0],[25,-64,5.4,5.1,7.2,1],
      [-28,-48,4.8,5.6,6.1,2],[30,-24,5.6,4.8,8.4,3],[-30,-8,4.6,5.4,5.8,0],
      [28,8,5.2,5.8,9.2,1],[-52,22,8.5,7.5,13.5,2],[54,44,7.8,7.1,11.2,3],
      [-31,48,5.4,4.9,6.4,2],[25,63,4.8,5.8,7.6,3],[-38,104,6.6,6.1,9.2,0],
      [42,126,7.4,6.8,14.2,1],[-24,158,5.6,6.2,8.3,2],[28,172,6.4,6.4,9.6,3]] as number[][]).forEach(([x,z,w,d,h,s]) => {
      addBuildingObs(x, z, w, d, h, s);
    });
    ([[-86,-154,6.8,5.8,14.5,1],[-88,-101,5.8,6.4,11.2,2],[-84,-52,7.2,5.9,16.8,3],
      [-86,6,6.2,6.2,13.4,0],[-88,58,7.8,6.8,18.5,1],[-86,116,6.4,6.0,12.8,2],
      [86,-150,7.4,6.4,15.2,3],[88,-94,5.9,6.8,10.4,0],[86,-42,6.8,6.1,14.8,1],
      [88,12,7.6,6.6,17.4,2],[86,72,5.8,6.2,12.0,3],[88,140,7.2,6.4,19.0,0],
      [-112,-92,5.8,5.4,9.8,2],[112,-72,6.1,5.8,10.6,1],[-112,74,6.5,6.2,12.2,0],
      [112,102,5.6,5.8,9.2,3],[-62,184,8.5,5.2,13.8,1],[54,-184,7.8,5.5,11.5,2]] as number[][]).forEach(([x,z,w,d,h,s]) => {
      addBuildingObs(x, z, w, d, h, s);
    });

    // Trees
    for (let i = 0; i < 96; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (16 + ((i * 11) % 74));
      const z = -178 + i * 3.75;
      const h = 3.5 + ((i * 7) % 18) * 0.14;
      const radius = 1.1 + (h - 3) * 0.12;
      addObs(createTree(h), openPosition(x, z, radius), radius);
    }
    for (let i = 0; i < 72; i++) {
      const side = i % 4;
      const step = -168 + (i % 18) * 19;
      const x = side < 2 ? (side === 0 ? -107 : 107) : step * 0.62;
      const z = side < 2 ? step : (side === 2 ? -171 : 171);
      const h = 3.8 + (i % 7) * 0.18;
      addObs(createTree(h), openPosition(x, z, 1.5), 1.5);
    }

    // Sensor towers
    ([[-82,-150,9.2],[78,-130,8.6],[-55,-40,7.2],[-48,53,8.4],[52,-54,7.8],[50,46,8.1],[-78,142,9.8],[82,162,9.1]] as number[][]).forEach(([x,z,h]) => {
      addObs(createSensorTower(h), openPosition(x, z, 2.1), 2.1);
    });

    // Utility poles
    for (let z = -174; z < 178; z += 18)
      ([-12.5, 12.5] as number[]).forEach(x => addObs(createUtilityPole(5.5), openPosition(x, z, 0.8), 0.8));
    for (let z = -168; z <= 168; z += 24)
      ([-110, 110] as number[]).forEach(x => addObs(createUtilityPole(6.2), openPosition(x, z, 0.8), 0.8));
    for (let x = -108; x <= 108; x += 24)
      ([-172, 172] as number[]).forEach(z => addObs(createUtilityPole(6.2), openPosition(x, z, 0.8), 0.8));

    const trafficVehicles: TrafficVehicle[] = [];

    // Moving traffic
    ([[-4.2,-154,0x1e4a6e,0.18],[4.1,-118,0x2a3f22,-0.22],[-29,-76,0x4a2a1e,Math.PI/2],
      [28,-34,0x1a2e3a,Math.PI/2],[-4.2,-49,0x1e4a6e,0.18],[4.1,-2,0x2a3f22,-0.22],
      [-29,31,0x4a2a1e,Math.PI/2],[28,84,0x1a2e3a,Math.PI/2],[-15,55,0x3a1a28,0.05],
      [5.8,132,0x553c22,-0.12],[-6.2,168,0x253852,0.2],[-122,-156,0x27495c,0],
      [122,-112,0x5a3226,0],[-122,-44,0x263f2b,0],[122,36,0x253852,0],[-96,184,0x553c22,0],
      [-12,-184,0x4a2a1e,0],[72,184,0x1e4a6e,0],[122,148,0x2a3f22,0]] as number[][]).forEach(([x,z,color], index) => {
      const route = roadVehicleRoute(x, z);
      const car = createSedan(color);
      const trafficPath = trafficPaths[index % trafficPaths.length];
      const direction = trafficPath.direction;
      const path = trafficPath.points.map((point) => point.clone());
      const pathIndex = nearestPathIndex(path, x, z);
      const position = path[pathIndex].clone();
      const nextPoint = path[(pathIndex + direction + path.length) % path.length];
      const initialForward = nextPoint.clone().sub(position);
      initialForward.y = 0;
      car.rotation.y = yawFromVelocity(initialForward);
      car.position.copy(position);
      scene.add(car);

      const obstacle = {
        position: position.clone(),
        radius: 2.18,
        dynamic: true,
        halfExtents: new THREE.Vector2(1.08, 2.18),
        yaw: car.rotation.y,
      };
      obstacles.push(obstacle);
      trafficVehicles.push({
        group: car,
        obstacle,
        axis: route.axis,
        lane: route.lane,
        progress: route.progress,
        min: route.min,
        max: route.max,
        speed: 5.5 + (index % 4) * 1.4,
        direction,
        verticalVelocity: 0,
        velocity: new THREE.Vector3(),
        impactVelocity: new THREE.Vector3(),
        mass: 1250 + (index % 4) * 160,
        path,
        pathIndex,
        yaw: car.rotation.y,
        steerAngle: 0,
        laneOffset: 0,
        yawOffset: 0,
        yawVelocity: 0,
      });
    });

    // Energy and logistics areas
    ([[-70,-104,0.2],[66,-88,-0.3],[-72,92,0.1],[68,116,-0.25]] as number[][]).forEach(([x,z,rot]) => {
      const solar = createSolarArray();
      solar.rotation.y = rot;
      addObs(solar, openPosition(x, z, 6.8), 6.8);
    });
    ([[66,-150,0.1],[-68,-18,-0.35],[72,152,0.2]] as number[][]).forEach(([x,z,rot]) => {
      const stack = createContainerStack();
      stack.rotation.y = rot;
      addObs(stack, openPosition(x, z, 5.8), 5.8);
    });

    // Rocks
    const debMat = stdMat(0x3c4240, 0.92, 0.02);
    ([[-3.2,-170,1.2],[5.4,-132,1.4],[-8.2,-96,1.1],[4.4,-18,1.4],[-5.2,55,1.1],
      [36,31,1.0],[-42,76,1.35],[45,112,1.25],[-8,148,1.2],[7.5,178,1.4]] as number[][]).forEach(([x,z,r]) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), debMat);
      rock.position.y = r * 0.42; rock.scale.y = 0.5; rock.castShadow = true;
      addObs(rock, openPosition(x, z, r + 0.9), r + 0.9);
    });

    // Ground eVTOL landing pads in open areas
    ([
      [-58,-178,0], [61,-132,1], [-74,134,2], [74,178,3], [103,-14,4], [-102,40,5],
      [-154,-132,6], [154,-102,7], [-152,-12,8], [148,54,9], [-138,122,10], [138,142,11],
      [-46,192,12], [42,-196,13], [18,108,14], [-18,-108,15],
    ] as number[][]).forEach(([x, z, style]) => {
      const radius = 6.4;
      const pos = openPosition(x, z, radius);
      const pad = createGroundLandingPad(style);
      pad.rotation.y = (style % 3) * Math.PI / 6;
      addObs(pad, pos, radius);
      rooftopPads.push({
        position: new THREE.Vector3(pos.x, pos.y + EVTOL_LANDING_CLEARANCE, pos.z),
        yaw: pad.rotation.y,
        kind: "GROUND",
      });
    });

    // Scan lines
    const scanMat = new THREE.LineBasicMaterial({ color: 0x00eeff, transparent: true, opacity: 0.55 });
    const scanLines = Array.from({ length: 8 }, () => {
      const ln = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        scanMat
      );
      scene.add(ln); return ln;
    });

    // Rover
    const { rover, wheels } = createRover();
    rover.position.set(0, surfaceHeight(0, 176) + VEHICLE_CLEARANCE, 176);
    scene.add(rover);

    // Drones
    const roles: DroneRig["role"][] = Array.from({ length: 20 }, (_, i) => {
      if (i < 12) return "LOGISTICS";
      if (i % 4 === 0) return "SCOUT";
      if (i % 3 === 0) return "GUARD";
      return "RELAY";
    });
    const drones: DroneRig[] = roles.map((role, i) => {
      const { group, bladePairs, navLightMats } = createDrone(role);
      const rig: DroneRig = {
        group, bladePairs, navLightMats, role,
        logisticState: "PATROL",
        logisticTargetVehicleIndex: -1,
        dockTimer: 0,
        isDocked: false,
        hasTargetLock: false,
        trackedDeck: new THREE.Vector3(),
        trackedDeckVelocity: new THREE.Vector3(),
        departTarget: new THREE.Vector3(),
        phase: (i / roles.length) * Math.PI * 2,
        radius: 24 + (i % 10) * 10,
        speed: 0.22 + (i % 8) * 0.035,
        altitude: 5.2 + (i % 5) * 1.05,
      };
      group.position.set(Math.sin(rig.phase) * rig.radius, surfaceHeight(0, 0) + rig.altitude, Math.cos(rig.phase) * rig.radius);
      scene.add(group);
      return rig;
    });
    const evtolHorizonPoint = (index: number, outbound = false) => {
      const side = outbound ? -1 : 1;
      const angle = -0.95 + index * 0.22 + (outbound ? Math.PI : 0);
      return new THREE.Vector3(
        Math.sin(angle) * 178,
        34 + (index % 4) * 2.4,
        side * (238 + (index % 3) * 18)
      );
    };
    const groundPadIndices = rooftopPads
      .map((pad, index) => ({ pad, index }))
      .filter(({ pad }) => pad.kind === "GROUND")
      .map(({ index }) => index);
    const rooftopPadIndices = rooftopPads
      .map((pad, index) => ({ pad, index }))
      .filter(({ pad }) => pad.kind === "ROOFTOP")
      .map(({ index }) => index);
    const chooseEvtolPadIndex = (evtolIndex: number, cycle = 0) => {
      const useGround = groundPadIndices.length > 0 && ((evtolIndex + cycle) % 8 !== 0 || rooftopPadIndices.length === 0);
      const candidates = useGround ? groundPadIndices : rooftopPadIndices.length > 0 ? rooftopPadIndices : groundPadIndices;
      return candidates[(evtolIndex * 5 + cycle * 3) % Math.max(1, candidates.length)] ?? 0;
    };
    const evtols: EvtolFlightRig[] = Array.from({ length: EVTOL_FLEET_SIZE }, (_, i) => {
      const rig = createLargeEvtol() as EvtolFlightRig;
      const padIndex = chooseEvtolPadIndex(i);
      const pad = rooftopPads[padIndex] ?? { position: new THREE.Vector3(0, 16, 0), yaw: 0 };
      const inbound = evtolHorizonPoint(i);
      const outbound = evtolHorizonPoint(i + 4, true);
      const hoverPoint = pad.position.clone().add(new THREE.Vector3(
        Math.sin(i * 1.7) * 2.6,
        10 + (i % 3) * 1.4,
        Math.cos(i * 1.7) * 2.6
      ));
      const cycle = i % 6;
      rig.state = cycle === 0 ? "INBOUND" : cycle === 1 ? "DESCEND" : cycle === 2 ? "LANDED" : cycle === 3 ? "TAKEOFF" : "OUTBOUND";
      rig.padIndex = padIndex;
      rig.horizonIn = inbound;
      rig.horizonOut = outbound;
      rig.hoverPoint = hoverPoint;
      rig.timer = cycle === 2 ? i * 0.22 : 0;
      rig.phase = i * 0.73;
      rig.cruiseSpeed = 13.5 + (i % 5) * 1.45;
      rig.cycles = 0;

      const start = rig.state === "INBOUND"
        ? inbound.clone().lerp(hoverPoint, 0.25 + (i % 3) * 0.18)
        : rig.state === "DESCEND"
          ? hoverPoint.clone().lerp(pad.position, 0.35)
          : rig.state === "LANDED"
            ? pad.position.clone()
            : rig.state === "TAKEOFF"
              ? pad.position.clone().lerp(hoverPoint, 0.5)
              : hoverPoint.clone().lerp(outbound, 0.3 + (i % 2) * 0.22);
      rig.group.position.copy(start);
      rig.group.rotation.y = pad.yaw;
      rig.group.scale.setScalar(0.69);
      scene.add(rig.group);
      return rig;
    });

    const getVehicleYaw = (vehicle: TrafficVehicle) => {
      return vehicle.yaw;
    };
    const assignLogisticsMission = (droneIndex: number) => {
      if (droneIndex < 0) return;
      const drone = drones[droneIndex];
      const targetPattern = [-1, ...trafficVehicles.map((_, targetIndex) => targetIndex)];
      drone.logisticTargetVehicleIndex = targetPattern[droneIndex % targetPattern.length];
      drone.logisticState = "APPROACH";
      drone.dockTimer = 0;
      drone.isDocked = false;
      drone.hasTargetLock = false;
      drone.trackedDeckVelocity.set(0, 0, 0);
    };
    drones.forEach((drone, index) => {
      if (drone.role === "LOGISTICS") assignLogisticsMission(index);
    });
    const firstRoverDrone = drones.find((drone) => drone.role === "LOGISTICS" && drone.logisticTargetVehicleIndex === -1);
    if (firstRoverDrone) {
      firstRoverDrone.group.position.copy(rover.localToWorld(ROVER_LANDING_PAD_LOCAL.clone())).add(new THREE.Vector3(0, 6.2, -9));
      firstRoverDrone.logisticState = "ALIGN";
      firstRoverDrone.dockTimer = 0;
      firstRoverDrone.isDocked = false;
    }

    // ── Input ────────────────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const onKeyUp   = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const orbit = {
      dragging: false,
      lastX: 0,
      lastY: 0,
      yaw: -0.65,
      pitch: 0.58,
      distance: 34,
    };
    const onPointerDown = (e: PointerEvent) => {
      if (controlsRef.current.cameraMode !== "ORBIT") return;
      orbit.dragging = true;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!orbit.dragging) return;
      const dx = e.clientX - orbit.lastX;
      const dy = e.clientY - orbit.lastY;
      orbit.lastX = e.clientX;
      orbit.lastY = e.clientY;
      orbit.yaw -= dx * 0.006;
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.004, 0.18, 1.25);
    };
    const onPointerUp = (e: PointerEvent) => {
      orbit.dragging = false;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (controlsRef.current.cameraMode !== "ORBIT") return;
      e.preventDefault();
      orbit.distance = THREE.MathUtils.clamp(orbit.distance + e.deltaY * 0.025, 16, 82);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // ── Resize ───────────────────────────────────────────────────────────────
    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const w = Math.max(rect.width,  1);
      const h = Math.max(rect.height, 1);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    // Also call once after a brief delay so the section has painted
    resize();
    setTimeout(resize, 50);

    // ── Loop ─────────────────────────────────────────────────────────────────
    let speed = 0, steering = 0, roverYaw = 0, roverVerticalVelocity = 0, hudTick = 0, frameId = 0;
    const clock = new THREE.Clock();
    const camTarget = new THREE.Vector3();
    const camOff    = new THREE.Vector3();
    const roverVelocity = new THREE.Vector3();
    const previousRoverPosition = new THREE.Vector3();
    const moveDroneToward = (drone: DroneRig, target: THREE.Vector3, maxSpeed: number, dt: number) => {
      const delta = target.clone().sub(drone.group.position);
      const distance = delta.length();
      const step = maxSpeed * dt;

      if (distance <= step) {
        drone.group.position.copy(target);
      } else if (distance > 0.001) {
        drone.group.position.addScaledVector(delta, step / distance);
      }
    };
    const moveDroneLandingAxis = (
      drone: DroneRig,
      target: THREE.Vector3,
      horizontalSpeed: number,
      verticalSpeed: number,
      dt: number
    ) => {
      const dx = target.x - drone.group.position.x;
      const dz = target.z - drone.group.position.z;
      const horizontalDistance = Math.hypot(dx, dz);
      const horizontalStep = horizontalSpeed * dt;

      if (horizontalDistance <= horizontalStep) {
        drone.group.position.x = target.x;
        drone.group.position.z = target.z;
      } else if (horizontalDistance > 0.001) {
        drone.group.position.x += (dx / horizontalDistance) * horizontalStep;
        drone.group.position.z += (dz / horizontalDistance) * horizontalStep;
      }

      const dy = target.y - drone.group.position.y;
      drone.group.position.y += THREE.MathUtils.clamp(dy, -verticalSpeed * dt, verticalSpeed * dt);
    };
    const setDroneLevelHeading = (drone: DroneRig, target: THREE.Vector3, dt: number) => {
      const dx = target.x - drone.group.position.x;
      const dz = target.z - drone.group.position.z;
      if (Math.hypot(dx, dz) > 0.05) {
        const desiredYaw = Math.atan2(dx, dz);
        const yawDelta = THREE.MathUtils.euclideanModulo(desiredYaw - drone.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        drone.group.rotation.y += yawDelta * THREE.MathUtils.clamp(dt * 7, 0, 1);
      }

      drone.group.rotation.x = THREE.MathUtils.lerp(drone.group.rotation.x, 0, THREE.MathUtils.clamp(dt * 8, 0, 1));
      drone.group.rotation.z = THREE.MathUtils.lerp(drone.group.rotation.z, 0, THREE.MathUtils.clamp(dt * 8, 0, 1));
    };
    const updateDeckTracker = (drone: DroneRig, measuredDeck: THREE.Vector3, measuredVelocity: THREE.Vector3, dt: number) => {
      if (!drone.hasTargetLock) {
        drone.trackedDeck.copy(measuredDeck);
        drone.trackedDeckVelocity.copy(measuredVelocity);
        drone.hasTargetLock = true;
        return;
      }

      const predicted = drone.trackedDeck.clone().addScaledVector(drone.trackedDeckVelocity, dt);
      const residual = measuredDeck.clone().sub(predicted);
      const alpha = 0.72;
      const beta = 0.38;

      drone.trackedDeck.copy(predicted).addScaledVector(residual, alpha);
      drone.trackedDeckVelocity
        .addScaledVector(residual, beta / Math.max(dt, 0.001))
        .lerp(measuredVelocity, 0.18);
    };
    const trafficRouteVelocity = (vehicle: TrafficVehicle) => {
      return new THREE.Vector3(-Math.sin(vehicle.yaw), 0, -Math.cos(vehicle.yaw)).multiplyScalar(vehicle.speed);
    };
    const applyTrafficImpulse = (
      vehicle: TrafficVehicle,
      impulse: THREE.Vector3,
      contactNormal: THREE.Vector3,
      contactOffset: THREE.Vector3
    ) => {
      const invMass = 1 / vehicle.mass;
      vehicle.impactVelocity.addScaledVector(impulse, invMass);

      const laneNormal = new THREE.Vector3(Math.cos(vehicle.yaw), 0, -Math.sin(vehicle.yaw));
      vehicle.laneOffset += laneNormal.dot(impulse) * invMass * 0.16;
      vehicle.yawVelocity += contactOffset.cross(impulse).y * invMass * 0.09;

    };
    const vehicleRoverContact = (vehicle: TrafficVehicle, roverPosition: THREE.Vector3, roverRadius: number) => {
      const toRover = roverPosition.clone().sub(vehicle.group.position);
      toRover.y = 0;
      const yaw = vehicle.yaw + vehicle.yawOffset;
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const localX = toRover.dot(right);
      const localZ = toRover.dot(forward);
      const halfWidth = 1.08;
      const halfLength = 2.18;
      const closestX = THREE.MathUtils.clamp(localX, -halfWidth, halfWidth);
      const closestZ = THREE.MathUtils.clamp(localZ, -halfLength, halfLength);
      const dx = localX - closestX;
      const dz = localZ - closestZ;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq > roverRadius * roverRadius) return null;

      let normal: THREE.Vector3;
      let distance = Math.sqrt(distanceSq);
      let penetration = roverRadius - distance;
      if (distance > 0.001) {
        normal = right.clone().multiplyScalar(dx / distance).addScaledVector(forward, dz / distance).normalize();
      } else {
        const sideGap = halfWidth - Math.abs(localX);
        const endGap = halfLength - Math.abs(localZ);
        if (sideGap < endGap) {
          normal = right.clone().multiplyScalar(localX >= 0 ? 1 : -1);
          distance = -sideGap;
          penetration = roverRadius + sideGap;
        } else {
          normal = forward.clone().multiplyScalar(localZ >= 0 ? 1 : -1);
          distance = -endGap;
          penetration = roverRadius + endGap;
        }
      }

      return {
        distance: Math.max(distance, 0),
        normal,
        penetration,
      };
    };
    const updateTrafficVehicle = (vehicle: TrafficVehicle, dt: number, updateVelocity = true) => {
      const previousPosition = vehicle.group.position.clone();
      const laneNormal = new THREE.Vector3(Math.cos(vehicle.yaw), 0, -Math.sin(vehicle.yaw));
      vehicle.impactVelocity.multiplyScalar(Math.max(0, 1 - dt * 1.65));
      vehicle.laneOffset += laneNormal.dot(vehicle.impactVelocity) * dt;
      vehicle.laneOffset += -vehicle.laneOffset * Math.min(1, dt * 1.25);
      vehicle.laneOffset = THREE.MathUtils.clamp(vehicle.laneOffset, -5.8, 5.8);
      vehicle.yawVelocity *= Math.max(0, 1 - dt * 2.1);
      vehicle.yawVelocity += -vehicle.yawOffset * dt * 4.2;
      vehicle.yawOffset += vehicle.yawVelocity * dt;
      vehicle.yawOffset = THREE.MathUtils.clamp(vehicle.yawOffset, -0.72, 0.72);

      const targetIndex = (vehicle.pathIndex + vehicle.direction + vehicle.path.length) % vehicle.path.length;
      const target = vehicle.path[targetIndex];
      const toTarget = target.clone().sub(vehicle.group.position);
      toTarget.y = 0;
      if (toTarget.length() < 5.5) {
        vehicle.pathIndex = targetIndex;
      }
      const nextTarget = vehicle.path[(vehicle.pathIndex + vehicle.direction + vehicle.path.length) % vehicle.path.length];
      const desired = nextTarget.clone().sub(vehicle.group.position);
      desired.y = 0;
      const desiredYaw = yawFromVelocity(desired);
      const yawError = THREE.MathUtils.euclideanModulo(desiredYaw - vehicle.yaw + Math.PI, Math.PI * 2) - Math.PI;
      const maxSteer = 0.52;
      const wheelBase = 2.65;
      vehicle.steerAngle += (THREE.MathUtils.clamp(yawError * 0.85, -maxSteer, maxSteer) - vehicle.steerAngle) * Math.min(1, dt * 4.8);
      const turnSlowdown = 1 - Math.min(0.42, Math.abs(vehicle.steerAngle) / maxSteer * 0.34);
      const forwardSpeed = vehicle.speed * turnSlowdown;
      if (Math.abs(yawError) > Math.PI * 0.58 && toTarget.length() < 8.5) {
        vehicle.pathIndex = targetIndex;
      }
      vehicle.yaw += (forwardSpeed / wheelBase) * Math.tan(vehicle.steerAngle) * dt;
      const forward = new THREE.Vector3(-Math.sin(vehicle.yaw), 0, -Math.cos(vehicle.yaw));
      vehicle.group.position.addScaledVector(forward, forwardSpeed * dt);
      vehicle.group.position.addScaledVector(vehicle.impactVelocity, dt);
      vehicle.group.position.addScaledVector(new THREE.Vector3(Math.cos(vehicle.yaw), 0, -Math.sin(vehicle.yaw)), vehicle.laneOffset * 0.08 * dt);
      const surface = stepSuspension(
        vehicle.group.position.y,
        vehicle.verticalVelocity,
        surfaceHeight(vehicle.group.position.x, vehicle.group.position.z) + VEHICLE_CLEARANCE,
        dt
      );
      vehicle.group.position.y = surface.y;
      vehicle.verticalVelocity = surface.verticalVelocity;
      vehicle.group.rotation.copy(terrainAdjustedEuler(vehicle.yaw + vehicle.yawOffset, vehicle.group.position.x, vehicle.group.position.z));

      vehicle.obstacle.position.copy(vehicle.group.position);
      vehicle.obstacle.yaw = vehicle.yaw + vehicle.yawOffset;
      if (updateVelocity) {
        vehicle.velocity.copy(vehicle.group.position).sub(previousPosition).divideScalar(Math.max(dt, 0.001));
      }
    };

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const rawDt = Math.min(clock.getDelta(), 0.04);
      const activeControls = controlsRef.current;
      const dt = activeControls.paused ? 0 : rawDt * activeControls.simSpeed;
      const t  = clock.elapsedTime;

      if (commandsRef.current.resetRover) {
        speed = 0;
        steering = 0;
        roverYaw = 0;
        roverVerticalVelocity = 0;
        rover.position.set(0, surfaceHeight(0, 176) + VEHICLE_CLEARANCE, 176);
        rover.rotation.copy(terrainAdjustedEuler(roverYaw, rover.position.x, rover.position.z));
        commandsRef.current.resetRover = false;
      }

      if (commandsRef.current.reassignMissions) {
        drones.forEach((drone, index) => {
          if (drone.role === "LOGISTICS") assignLogisticsMission(index);
        });
        commandsRef.current.reassignMissions = false;
      }

      const fwd = keys.has("w") || keys.has("arrowup");
      const bwd = keys.has("s") || keys.has("arrowdown");
      const lft = keys.has("a") || keys.has("arrowleft");
      const rgt = keys.has("d") || keys.has("arrowright");

      speed += ((fwd ? 1 : 0) - (bwd ? 0.72 : 0)) * dt * 26 * activeControls.roverPower;
      speed *= 1 - Math.min(0.07, 0.036 / Math.max(activeControls.roverPower, 0.4));
      speed = Math.max(-activeControls.roverMaxSpeed * 0.45, Math.min(activeControls.roverMaxSpeed, speed));

      const st = (lft ? 1 : 0) - (rgt ? 1 : 0);
      steering += (st - steering) * dt * 7 * activeControls.roverSteering;
      roverYaw += steering * speed * dt * 0.13 * activeControls.roverSteering;

      trafficVehicles.forEach((vehicle) => {
        if (!activeControls.trafficEnabled) {
          vehicle.velocity.set(0, 0, 0);
          return;
        }
        updateTrafficVehicle(vehicle, dt);
      });

      if (activeControls.trafficEnabled) {
        for (let i = 0; i < trafficVehicles.length; i++) {
          for (let j = i + 1; j < trafficVehicles.length; j++) {
            const a = trafficVehicles[i];
            const b = trafficVehicles[j];
            const distance = a.obstacle.position.distanceTo(b.obstacle.position);
            const minDistance = a.obstacle.radius + b.obstacle.radius + 0.9;

          if (distance < minDistance) {
            const normal = a.obstacle.position.clone().sub(b.obstacle.position);
            normal.y = 0;
            if (normal.lengthSq() < 0.001) normal.set(1, 0, 0);
            normal.normalize();

            const penetration = minDistance - distance;
            const relativeVelocity = trafficRouteVelocity(a).add(a.impactVelocity)
              .sub(trafficRouteVelocity(b).add(b.impactVelocity));
            const closingVelocity = relativeVelocity.dot(normal);
            const inverseMassSum = (1 / a.mass) + (1 / b.mass);

            if (closingVelocity < 0) {
              const restitution = 0.08;
              const normalImpulseMagnitude = -(1 + restitution) * closingVelocity / inverseMassSum;
              const normalImpulse = normal.clone().multiplyScalar(normalImpulseMagnitude);
              const tangent = relativeVelocity.clone().sub(normal.clone().multiplyScalar(closingVelocity));
              if (tangent.lengthSq() > 0.001) tangent.normalize();
              const frictionImpulse = tangent.multiplyScalar(-Math.min(normalImpulseMagnitude * 0.42, Math.abs(relativeVelocity.dot(tangent)) / inverseMassSum));
              const impulse = normalImpulse.add(frictionImpulse);

              applyTrafficImpulse(a, impulse, normal, a.group.position.clone().sub(b.group.position));
              applyTrafficImpulse(b, impulse.clone().negate(), normal.clone().negate(), b.group.position.clone().sub(a.group.position));
            }

            a.group.position.addScaledVector(normal, penetration * 0.35);
            b.group.position.addScaledVector(normal, -penetration * 0.35);
            updateTrafficVehicle(a, dt, false);
            updateTrafficVehicle(b, dt, false);
          }
          }
        }
      }

      previousRoverPosition.copy(rover.position);
      const dir = new THREE.Vector3(-Math.sin(roverYaw), 0, -Math.cos(roverYaw));
      rover.position.addScaledVector(dir, speed * dt);
      const fix = resolveCollision(rover.position, obstacles, 1.32);
      if (fix.lengthSq() > 0) { rover.position.add(fix); speed *= -0.28; }
      if (activeControls.trafficEnabled) {
        trafficVehicles.forEach((vehicle) => {
          const contact = vehicleRoverContact(vehicle, rover.position, 1.18);

          if (contact) {
            const normal = contact.normal;
            const penetration = contact.penetration;
            const roverForward = new THREE.Vector3(-Math.sin(roverYaw), 0, -Math.cos(roverYaw));
            const roverVelocity = roverForward.clone().multiplyScalar(speed);
            const vehicleVelocity = trafficRouteVelocity(vehicle).add(vehicle.impactVelocity);
            const relativeVelocity = roverVelocity.clone().sub(vehicleVelocity);
            const closingVelocity = relativeVelocity.dot(normal);
            const vehicleInvMass = 1 / vehicle.mass;
            const roverInvMass = 1 / ROVER_MASS;
            const inverseMassSum = vehicleInvMass + roverInvMass;
            const correction = Math.max(0, penetration + 0.08);

            rover.position.addScaledVector(normal, correction * (roverInvMass / inverseMassSum));
            vehicle.group.position.addScaledVector(normal, -correction * (vehicleInvMass / inverseMassSum));
            vehicle.impactVelocity.addScaledVector(normal, -Math.min(4.2, penetration * 2.8));
            if (closingVelocity < 0) {
              const restitution = 0.06;
              const normalImpulseMagnitude = -(1 + restitution) * closingVelocity / inverseMassSum;
              const normalImpulse = normal.clone().multiplyScalar(normalImpulseMagnitude);
              const tangent = relativeVelocity.clone().sub(normal.clone().multiplyScalar(closingVelocity));
              if (tangent.lengthSq() > 0.001) tangent.normalize();
              const frictionImpulse = tangent.multiplyScalar(-Math.min(normalImpulseMagnitude * 0.55, Math.abs(relativeVelocity.dot(tangent)) / inverseMassSum));
              const impulse = normalImpulse.add(frictionImpulse);

              applyTrafficImpulse(vehicle, impulse.clone().negate(), normal.clone().negate(), vehicle.group.position.clone().sub(rover.position));
              const newRoverVelocity = roverVelocity.addScaledVector(impulse, roverInvMass);
              speed = THREE.MathUtils.clamp(newRoverVelocity.dot(roverForward), -activeControls.roverMaxSpeed * 0.45, activeControls.roverMaxSpeed);
              steering += THREE.MathUtils.clamp(newRoverVelocity.cross(normal).y * 0.018, -0.35, 0.35);
            } else {
              const intoContactSpeed = speed * roverForward.dot(normal);
              if (intoContactSpeed < 0) speed -= intoContactSpeed * 0.85;
            }
            updateTrafficVehicle(vehicle, dt, false);
          }
        });
      }
      rover.position.x = Math.max(-205, Math.min(205, rover.position.x));
      rover.position.z = Math.max(-205, Math.min(205, rover.position.z));
      const roverSurface = stepSuspension(
        rover.position.y,
        roverVerticalVelocity,
        surfaceHeight(rover.position.x, rover.position.z) + VEHICLE_CLEARANCE,
        dt
      );
      rover.position.y = roverSurface.y;
      roverVerticalVelocity = roverSurface.verticalVelocity;
      rover.rotation.copy(terrainAdjustedEuler(roverYaw, rover.position.x, rover.position.z));
      roverVelocity.copy(rover.position).sub(previousRoverPosition).divideScalar(Math.max(dt, 0.001));
      wheels.forEach(w => { w.rotation.x += speed * dt * 2.4; });

      let dockingSlotOwner = drones.findIndex(
        (candidate) => candidate.role === "LOGISTICS" && candidate.logisticState === "DOCK"
      );

      evtols.forEach((evtol, evtolIndex) => {
        const pad = rooftopPads[evtol.padIndex] ?? { position: new THREE.Vector3(0, 16, 0), yaw: 0 };
        let target = evtol.hoverPoint;
        let speedLimit = evtol.cruiseSpeed;
        let targetBank = 0;

        if (evtol.state === "INBOUND") {
          target = evtol.hoverPoint;
          speedLimit = evtol.cruiseSpeed;
          if (evtol.group.position.distanceTo(target) < 3.4) {
            evtol.state = "DESCEND";
            evtol.timer = 0;
          }
        } else if (evtol.state === "DESCEND") {
          target = pad.position;
          speedLimit = 4.2;
          if (evtol.group.position.distanceTo(target) < 0.55) {
            evtol.group.position.copy(target);
            evtol.state = "LANDED";
            evtol.timer = 0;
          }
        } else if (evtol.state === "LANDED") {
          target = pad.position;
          speedLimit = 0;
          evtol.group.position.copy(target);
          evtol.group.rotation.y = THREE.MathUtils.lerp(evtol.group.rotation.y, pad.yaw, THREE.MathUtils.clamp(dt * 3, 0, 1));
          evtol.timer += dt;
          if (evtol.timer > 4.6 + (evtolIndex % 4) * 0.7) {
            evtol.state = "TAKEOFF";
            evtol.timer = 0;
          }
        } else if (evtol.state === "TAKEOFF") {
          target = evtol.hoverPoint;
          speedLimit = 5.8;
          if (evtol.group.position.distanceTo(target) < 2.2) {
            evtol.state = "OUTBOUND";
            evtol.timer = 0;
          }
        } else {
          target = evtol.horizonOut;
          speedLimit = evtol.cruiseSpeed + 2.2;
          if (evtol.group.position.distanceTo(target) < 9) {
            evtol.cycles += 1;
            const nextPadIndex = chooseEvtolPadIndex(evtolIndex, evtol.cycles);
            const nextPad = rooftopPads[nextPadIndex] ?? pad;
            evtol.padIndex = nextPadIndex;
            evtol.horizonIn.copy(evtolHorizonPoint(evtolIndex + Math.floor(t), false));
            evtol.horizonOut.copy(evtolHorizonPoint(evtolIndex + 4 + Math.floor(t * 0.5), true));
            evtol.hoverPoint.copy(nextPad.position).add(new THREE.Vector3(
              Math.sin(t + evtolIndex) * 2.6,
              10 + (evtolIndex % 3) * 1.4,
              Math.cos(t + evtolIndex) * 2.6
            ));
            evtol.group.position.copy(evtol.horizonIn);
            evtol.state = "INBOUND";
            evtol.timer = 0;
          }
        }

        const delta = target.clone().sub(evtol.group.position);
        if (speedLimit > 0 && delta.lengthSq() > 0.0001) {
          const step = Math.min(delta.length(), speedLimit * dt);
          evtol.group.position.addScaledVector(delta.normalize(), step);
          const heading = Math.atan2(-delta.x, -delta.z);
          const yawError = THREE.MathUtils.euclideanModulo(heading - evtol.group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
          evtol.group.rotation.y += yawError * THREE.MathUtils.clamp(dt * 2.8, 0, 1);
          targetBank = THREE.MathUtils.clamp(-yawError * 0.34, -0.22, 0.22);
        }

        const liftPulse = evtol.state === "LANDED" ? 0 : Math.sin(t * 1.25 + evtol.phase) * 0.04;
        evtol.group.rotation.x = THREE.MathUtils.lerp(evtol.group.rotation.x, liftPulse, THREE.MathUtils.clamp(dt * 2.2, 0, 1));
        evtol.group.rotation.z = THREE.MathUtils.lerp(evtol.group.rotation.z, targetBank, THREE.MathUtils.clamp(dt * 2.6, 0, 1));
        evtol.rotors.forEach((rotor, rotorIndex) => {
          const spin = evtol.state === "LANDED" ? 12 : 46;
          rotor.rotation.y += dt * (rotorIndex % 2 === 0 ? spin : -spin * 1.08);
        });
        evtol.navLightMats.forEach((mat, lightIndex) => {
          mat.emissiveIntensity = 1.8 + 1.4 * (0.5 + 0.5 * Math.sin(t * 3.2 + lightIndex * Math.PI + evtolIndex));
        });
        evtol.beaconMat.emissiveIntensity = 1.8 + 4.4 * Math.max(0, Math.sin(t * 5.8 + evtolIndex * 0.45));
        const beamActive = evtol.state === "DESCEND" || evtol.state === "LANDED";
        evtol.beam.visible = beamActive;
        evtol.beam.material.opacity = beamActive ? 0.18 : 0.08;
      });

      drones.forEach((drone, i) => {
        const ph  = t * drone.speed + drone.phase;
        const pz  = ((t * 10 + i * 58) % 370) - 185;
        const side = i % 2 === 0 ? 1 : -1;
        let tx = 0, tz = 0;
        let altitudeOffset = drone.altitude;

        if (drone.role === "LOGISTICS" && !activeControls.logisticsEnabled) {
          if (drone.logisticState !== "PATROL") drone.logisticState = "PATROL";
          tx = side * (42 + (i % 4) * 12 + Math.sin(ph * 0.6) * 8);
          tz = ((t * 4.8 + i * 41) % 360) - 180;
          altitudeOffset = drone.altitude + 2.5 + Math.sin(t * 1.4 + i) * 0.5;
        } else if (drone.role === "LOGISTICS" && drone.logisticState !== "PATROL") {
          const targetVehicle = drone.logisticTargetVehicleIndex >= 0
            ? trafficVehicles[drone.logisticTargetVehicleIndex]
            : null;
          const targetPosition = targetVehicle?.group.position ?? rover.position;
          const targetVelocity = targetVehicle?.velocity ?? roverVelocity;
          const targetYaw = targetVehicle ? getVehicleYaw(targetVehicle) : roverYaw;
          const forward = new THREE.Vector3(Math.sin(targetYaw), 0, Math.cos(targetYaw));
          const deck = targetVehicle
            ? new THREE.Vector3(
                targetPosition.x + forward.x * -0.35,
                targetPosition.y + 1.55,
                targetPosition.z + forward.z * -0.35
              )
            : rover.localToWorld(ROVER_LANDING_PAD_LOCAL.clone());
          updateDeckTracker(drone, deck, targetVelocity, dt);
          const distanceToDeck = drone.group.position.distanceTo(drone.trackedDeck);
          const interceptLead = THREE.MathUtils.clamp(distanceToDeck / 12, 0.08, 0.95);
          const leadTime = drone.logisticState === "DOCK" ? 0.02 : drone.logisticState === "ALIGN" ? Math.min(interceptLead, 0.42) : interceptLead;
          const settledDeck = drone.trackedDeck.clone().addScaledVector(drone.trackedDeckVelocity, 0.015);
          const predictedDeck = drone.trackedDeck.clone().addScaledVector(drone.trackedDeckVelocity, leadTime);
          const approach = predictedDeck.clone().add(new THREE.Vector3(
            forward.x * -4,
            6,
            forward.z * -4
          ));
          const approachDistance = drone.group.position.distanceTo(approach);
          if (drone.logisticState === "APPROACH") {
            drone.dockTimer += dt;
            drone.group.position.addScaledVector(drone.trackedDeckVelocity, dt * 0.25);
            moveDroneToward(drone, approach, 12, dt);
            if (approachDistance < 2.4) {
              drone.logisticState = "ALIGN";
              drone.dockTimer = 0;
            }
          } else if (drone.logisticState === "ALIGN") {
            drone.dockTimer += dt;
            const slotAvailable = dockingSlotOwner === -1 || dockingSlotOwner === i;
            const hoverHeight = slotAvailable ? 2.35 : 5.25;
            const captureRadius = targetVehicle ? 2.6 : 2.1;
            const horizontalError = Math.hypot(
              predictedDeck.x - drone.group.position.x,
              predictedDeck.z - drone.group.position.z
            );
            const centerPoint = new THREE.Vector3(
              predictedDeck.x,
              predictedDeck.y + hoverHeight,
              predictedDeck.z
            );
            const descendPoint = new THREE.Vector3(
              predictedDeck.x,
              predictedDeck.y + 0.42,
              predictedDeck.z
            );
            const isInCaptureCone = slotAvailable && (horizontalError < captureRadius || drone.dockTimer > 1.4);
            const alignTarget = isInCaptureCone ? descendPoint : centerPoint;

            drone.group.position.addScaledVector(drone.trackedDeckVelocity, dt * (slotAvailable ? 1 : 0.25));
            moveDroneLandingAxis(drone, alignTarget, slotAvailable ? 7.2 : 3.8, isInCaptureCone ? 1.8 : 2.2, dt);

            const postHorizontalError = Math.hypot(
              settledDeck.x - drone.group.position.x,
              settledDeck.z - drone.group.position.z
            );
            const verticalError = Math.abs(drone.group.position.y - descendPoint.y);
            if (slotAvailable && postHorizontalError < captureRadius && (verticalError < 0.55 || drone.dockTimer > 3.2)) {
              drone.logisticState = "DOCK";
              drone.dockTimer = 0;
              dockingSlotOwner = i;
            }
          } else if (drone.logisticState === "DOCK") {
            if (drone.isDocked) {
              drone.dockTimer += dt;
              drone.group.position.copy(deck);
              if (drone.dockTimer > (targetVehicle ? 4.2 : 6.5)) {
                drone.logisticState = "DEPART";
                drone.isDocked = false;
                drone.departTarget.copy(settledDeck).add(new THREE.Vector3(
                  Math.sin(ph) * 26,
                  11,
                  Math.cos(ph) * 26
                ));
                drone.dockTimer = 0;
              }
            } else {
              const magneticDistance = drone.group.position.distanceTo(settledDeck);
              const finalDockPoint = magneticDistance < 1.2
                ? settledDeck
                : settledDeck.clone().add(new THREE.Vector3(0, 0.28, 0));
              drone.group.position.addScaledVector(drone.trackedDeckVelocity, dt);
              moveDroneLandingAxis(drone, finalDockPoint, targetVehicle ? 4.4 : 3.2, 1.75, dt);
              const dockHorizontalError = Math.hypot(
                settledDeck.x - drone.group.position.x,
                settledDeck.z - drone.group.position.z
              );
              const dockVerticalError = Math.abs(settledDeck.y - drone.group.position.y);
              const isSettled = dockHorizontalError < (targetVehicle ? 0.7 : 0.46) && dockVerticalError < 0.38;
              if (isSettled) {
                drone.group.position.copy(settledDeck);
                drone.isDocked = true;
                drone.dockTimer = 0;
              }
            }
          } else if (drone.logisticState === "DEPART") {
            moveDroneToward(drone, drone.departTarget, 10, dt);
            if (drone.group.position.distanceTo(drone.departTarget) < 2.5) {
              drone.logisticState = "PATROL";
              assignLogisticsMission(i);
            }
          }

          if (drone.logisticState === "DOCK") {
            if (targetVehicle) {
              setDroneLevelHeading(drone, settledDeck, dt);
            } else {
              drone.group.rotation.y = THREE.MathUtils.lerp(drone.group.rotation.y, rover.rotation.y, THREE.MathUtils.clamp(dt * 7, 0, 1));
              drone.group.rotation.x = THREE.MathUtils.lerp(drone.group.rotation.x, 0, THREE.MathUtils.clamp(dt * 8, 0, 1));
              drone.group.rotation.z = THREE.MathUtils.lerp(drone.group.rotation.z, 0, THREE.MathUtils.clamp(dt * 8, 0, 1));
            }
          } else {
            setDroneLevelHeading(drone, predictedDeck, dt);
          }
        } else if (drone.role === "SCOUT") {
          tx = side * (24 + Math.sin(ph * 0.8) * 38);
          tz = pz;
          altitudeOffset = drone.altitude + Math.sin(t * 1.6 + i) * 0.5;
        } else if (drone.role === "LOGISTICS") {
          tx = side * (42 + (i % 4) * 12 + Math.sin(ph * 0.6) * 8);
          tz = ((t * 4.8 + i * 41) % 360) - 180;
          altitudeOffset = drone.altitude + 2.5 + Math.sin(t * 1.4 + i) * 0.5;
        } else if (drone.role === "RELAY") {
          tx = side * (18 + Math.sin(ph) * 34);
          altitudeOffset = drone.altitude + Math.sin(t * 1.8 + i) * 0.6;
          tz = pz;
        } else {
          tx = side * 68 + Math.sin(t * 0.6 + i) * 16;
          altitudeOffset = drone.altitude + Math.sin(t * 2.2 + i) * 0.7;
          tz = pz;
        }

        const ty = surfaceHeight(tx, tz) + altitudeOffset;
        const target = new THREE.Vector3(tx, ty, tz);
        target.addScaledVector(avoidanceForce(target, obstacles, 5.5), 7);
        if (!(drone.role === "LOGISTICS" && drone.logisticState !== "PATROL")) {
          moveDroneToward(drone, target, drone.role === "LOGISTICS" ? 8 : 9.5, dt);
          drone.group.position.y = surfaceHeight(drone.group.position.x, drone.group.position.z) + drone.altitude + Math.sin(t * 2 + i) * 0.5;
          if (drone.role === "SCOUT") {
            drone.group.lookAt(tx, drone.group.position.y, tz + side * 6);
          } else if (drone.role === "LOGISTICS") {
            drone.group.lookAt(tx, drone.group.position.y, tz);
          }
        }

        drone.bladePairs.forEach((pair, bi) => {
          const spin = bi % 2 === 0 ? 1 : -1;
          pair.forEach(b => { b.rotation.y += spin * dt * (22 + bi * 2); });
        });
        drone.navLightMats.forEach((nm, li) => {
          if (li < 2) nm.emissiveIntensity = 0.5 + 2.5 * (0.5 + 0.5 * Math.sin(t * 4 + li * Math.PI + i));
        });
      });

      const near = obstacles
        .map(o => ({ o, d: o.position.distanceTo(rover.position) }))
        .filter(x => x.d < 32)
        .sort((a, b) => a.d - b.d)
        .slice(0, scanLines.length);

      let activeBeams = 0;
      scanLines.forEach((ln, idx) => {
        const hit = near[idx];
        const geo = ln.geometry as THREE.BufferGeometry;
        const s = rover.position.clone().add(new THREE.Vector3(0, 1.55, 0));
        const e = hit ? hit.o.position.clone().add(new THREE.Vector3(0, 1.1, 0)) : s.clone();
        geo.setFromPoints([s, e]);
        ln.visible = Boolean(hit);
        if (hit) activeBeams++;
      });

      if (activeControls.cameraMode === "TOP") {
        camTarget.set(rover.position.x, rover.position.y + 62, rover.position.z + 0.01);
      } else if (activeControls.cameraMode === "ORBIT") {
        const horizontalDistance = Math.cos(orbit.pitch) * orbit.distance;
        camOff.set(
          Math.sin(orbit.yaw) * horizontalDistance,
          Math.sin(orbit.pitch) * orbit.distance,
          Math.cos(orbit.yaw) * horizontalDistance
        );
        camTarget.copy(rover.position).add(camOff);
      } else {
        camOff.set(0, 9.2, 16).applyAxisAngle(new THREE.Vector3(0, 1, 0), roverYaw);
        camTarget.copy(rover.position).add(camOff);
      }
      camera.position.lerp(camTarget, 1 - Math.pow(0.001, rawDt));
      camera.lookAt(rover.position.x, rover.position.y + 1.3, rover.position.z);

      renderer.render(scene, camera);

      if (++hudTick % 10 === 0) {
        setHud({ speed: activeControls.paused ? 0 : speed, beams: activeBeams, nearest: near[0]?.d ?? 99 });
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      ro.disconnect();
      scene.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
        else (mesh.material as THREE.Material)?.dispose();
      });
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-label="Interactive autonomous systems WebGL scene"
      className="absolute inset-0 h-full w-full"
      role="img"
    >
      <HUD
        {...hud}
        controls={controls}
        onControlsChange={setControls}
        onResetRover={() => {
          commandsRef.current.resetRover = true;
        }}
        onReassignMissions={() => {
          commandsRef.current.reassignMissions = true;
        }}
      />
    </div>
  );
}

function loopProgressFromPoint(x: number, z: number, laneOffset = 0) {
  const halfX = LOOP_ROAD_HALF_X + laneOffset;
  const halfZ = LOOP_ROAD_HALF_Z + laneOffset;
  const width = halfX * 2;
  const depth = halfZ * 2;

  if (Math.abs(z + halfZ) <= Math.abs(x - halfX) && Math.abs(z + halfZ) <= Math.abs(z - halfZ)) {
    return THREE.MathUtils.clamp(x + halfX, 0, width);
  }
  if (Math.abs(x - halfX) < Math.abs(x + halfX) && Math.abs(x - halfX) <= Math.abs(z - halfZ)) {
    return width + THREE.MathUtils.clamp(z + halfZ, 0, depth);
  }
  if (Math.abs(z - halfZ) < Math.abs(z + halfZ)) {
    return width + depth + THREE.MathUtils.clamp(halfX - x, 0, width);
  }
  return width + depth + width + THREE.MathUtils.clamp(halfZ - z, 0, depth);
}

function yawFromVelocity(velocity: THREE.Vector3) {
  if (velocity.lengthSq() < 0.0001) return 0;
  return Math.atan2(-velocity.x, -velocity.z);
}

function loopRouteAt(progress: number, laneOffset = 0) {
  const halfX = LOOP_ROAD_HALF_X + laneOffset;
  const halfZ = LOOP_ROAD_HALF_Z + laneOffset;
  const width = halfX * 2;
  const depth = halfZ * 2;
  const perimeter = width * 2 + depth * 2;
  let p = THREE.MathUtils.euclideanModulo(progress, perimeter);
  const position = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  if (p < width) {
    position.set(-halfX + p, ROAD_SURFACE_Y + VEHICLE_CLEARANCE, -halfZ);
    tangent.set(1, 0, 0);
  } else if ((p -= width) < depth) {
    position.set(halfX, ROAD_SURFACE_Y + VEHICLE_CLEARANCE, -halfZ + p);
    tangent.set(0, 0, 1);
  } else if ((p -= depth) < width) {
    position.set(halfX - p, ROAD_SURFACE_Y + VEHICLE_CLEARANCE, halfZ);
    tangent.set(-1, 0, 0);
  } else {
    p -= width;
    position.set(-halfX, ROAD_SURFACE_Y + VEHICLE_CLEARANCE, halfZ - p);
    tangent.set(0, 0, -1);
  }

  return { position, tangent, perimeter };
}
