"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SIDE_ROAD_Z = [-128, -76, -34, 31, 84, 132];
const ROAD_SURFACE_Y = 0.04;
const VEHICLE_CLEARANCE = 0.015;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Obstacle {
  position: THREE.Vector3;
  radius: number;
}

interface TrafficVehicle {
  group: THREE.Group;
  obstacle: Obstacle;
  axis: "x" | "z";
  lane: number;
  progress: number;
  speed: number;
  min: number;
  max: number;
  direction: 1 | -1;
  verticalVelocity: number;
}

interface DroneRig {
  group: THREE.Group;
  bladePairs: [THREE.Mesh, THREE.Mesh][];
  navLightMats: THREE.MeshStandardMaterial[];
  role: "SCOUT" | "RELAY" | "GUARD";
  phase: number;
  radius: number;
  speed: number;
  altitude: number;
}

interface HudState {
  speed: number;
  beams: number;
  nearest: number;
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
  const sideRoadCore = SIDE_ROAD_Z.some((roadZ) => Math.abs(z - roadZ) <= 9 && Math.abs(x) <= 92);

  if (mainRoadCore || sideRoadCore) return ROAD_SURFACE_Y;

  const sideRoadFlatten = SIDE_ROAD_Z.reduce((max, roadZ) => {
    const shoulder = Math.abs(x) <= 96 ? Math.max(0, 1 - (Math.abs(z - roadZ) - 9) / 8) : 0;
    return Math.max(max, shoulder);
  }, 0);
  const mainRoadFlatten = Math.abs(z) <= 194 ? Math.max(0, 1 - (Math.abs(x) - 13) / 8) : 0;
  const flatten = Math.max(mainRoadFlatten, sideRoadFlatten);

  return THREE.MathUtils.lerp(rawHeight, ROAD_SURFACE_Y, THREE.MathUtils.clamp(flatten, 0, 1));
}

function isRoadSurface(x: number, z: number) {
  const onMainRoad = Math.abs(x) < 13 && Math.abs(z) < 190;
  const onSideRoad = SIDE_ROAD_Z.some((roadZ) => Math.abs(z - roadZ) < 9 && Math.abs(x) < 92);
  return onMainRoad || onSideRoad;
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

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(520, 64, 32),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.BackSide, fog: false })
  );
  dome.rotation.x = Math.PI;
  dome.scale.y = -1;
  scene.add(dome);

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
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0.85, fog: false,
  })));

  // Moon
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(3.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xccddef, side: THREE.DoubleSide, fog: false })
  );
  moon.position.set(-75, 125, -155);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  // Horizon haze
  const hz = new THREE.Mesh(
    new THREE.CylinderGeometry(500, 500, 30, 80, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x1a4a6a, transparent: true, opacity: 0.22,
      side: THREE.BackSide, fog: false, depthWrite: false,
    })
  );
  hz.position.y = 3;
  scene.add(hz);
}

// ── Lighting ──────────────────────────────────────────────────────────────────

function buildLighting(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0x2a5080, 0x061018, 1.15));

  const key = new THREE.DirectionalLight(0xb0ccf0, 2.6);
  key.position.set(-40, 55, -100);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
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
  ([-128, -76, -34, 31, 84, 132] as number[]).forEach(z => addPlane(178, 12, 0.025, 0, z, roadMat));

  for (let z = -184; z < 185; z += 8) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.8), laneMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(0, 0.045, z);
    scene.add(d);
  }
  ([-128, -76, -34, 31, 84, 132] as number[]).forEach(z => {
    for (let x = -84; x < 85; x += 8) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.2), laneMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.047, z);
      scene.add(d);
    }
  });

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

  ([-0.72, 0.72] as number[]).forEach(x => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.05), emissiveMat(0xfff4d0, 0xfff4d0, 4));
    hl.position.set(x, 0.88, -2.34); g.add(hl);
    const sl = new THREE.SpotLight(0xfff0cc, 14, 20, Math.PI / 8, 0.55);
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

function createDrone(role: "SCOUT" | "RELAY" | "GUARD"): {
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

  const roleColor = role === "SCOUT" ? 0x00c8ff : role === "RELAY" ? 0xffaa00 : 0xff2266;
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
  const rows = Math.floor(h / 1.4);
  const cols = Math.floor(w / 1.2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() > 0.38) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.62), winMat);
        win.position.set(-w / 2 + 0.85 + c * 1.2, 1.1 + r * 1.4, d / 2 + 0.01);
        g.add(win);
      }
    }
  }

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

function resolveCollision(pos: THREE.Vector3, obs: Obstacle[], radius: number): THREE.Vector3 {
  const c = new THREE.Vector3();
  obs.forEach(o => {
    const off = pos.clone().sub(o.position); off.y = 0;
    const d = Math.max(off.length(), 0.001);
    const mn = o.radius + radius;
    if (d < mn) c.addScaledVector(off.normalize(), mn - d);
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

function HUD({ speed, beams, nearest }: HudState) {
  const nearColor = nearest < 7 ? "#ff3333" : nearest < 14 ? "#ff8844" : "#00ff88";
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {/* Status */}
      <div style={{ ...panel, top: 16, left: 16, minWidth: 200 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.55, marginBottom: 6 }}>
          AUTONOMOUS SYSTEMS DEMO
        </div>
        <div>Speed: <span style={{ color: "#fff" }}>{Math.abs(speed).toFixed(1)} m/s</span></div>
        <div>Drones Active: <span style={{ color: "#fff" }}>7</span></div>
        <div>Scan Beams: <span style={{ color: "#00ff88" }}>{beams}</span></div>
        <div>Nearest Object: <span style={{ color: nearColor }}>
          {nearest < 99 ? `${nearest.toFixed(1)} m` : "— m"}
        </span></div>
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
        {([ ["#00c8ff","SCOUT","Rover escort"], ["#ffaa00","RELAY","Grid patrol"], ["#ff2266","GUARD","Zone coverage"] ] as [string,string,string][]).map(([color, role, desc]) => (
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

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene setup ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040a10, 0.0032);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 560);
    camera.position.set(0, 9, 15);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Canvas must fill the mount div — set style before appending
    mount.appendChild(renderer.domElement);

    // ── Build world ──────────────────────────────────────────────────────────
    buildSky(scene);
    buildLighting(scene);
    buildGround(scene);

    const obstacles: Obstacle[] = [];
    const sideRoadZ = SIDE_ROAD_Z;

    function isOnRoad(pos: THREE.Vector3, radius: number) {
      const onMainRoad = Math.abs(pos.x) < 13 + radius && Math.abs(pos.z) < 190;
      const onSideRoad = sideRoadZ.some((z) => Math.abs(pos.z - z) < 9 + radius && Math.abs(pos.x) < 92);
      return onMainRoad || onSideRoad;
    }

    function offRoadPosition(x: number, z: number, radius: number) {
      const pos = new THREE.Vector3(x, 0, z);

      if (Math.abs(pos.x) < 13 + radius && Math.abs(pos.z) < 190) {
        pos.x = (pos.x < 0 ? -1 : 1) * (16 + radius);
      }

      sideRoadZ.forEach((roadZ) => {
        if (Math.abs(pos.z - roadZ) < 9 + radius && Math.abs(pos.x) < 92) {
          pos.z = roadZ + (pos.z < roadZ ? -1 : 1) * (11 + radius);
        }
      });

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
      const nearestSideRoad = sideRoadZ.reduce((nearest, roadZ) => (
        Math.abs(z - roadZ) < Math.abs(z - nearest) ? roadZ : nearest
      ), sideRoadZ[0]);

      if (Math.abs(z - nearestSideRoad) < 18 && Math.abs(x) < 86) {
        return {
          axis: "x" as const,
          lane: nearestSideRoad,
          progress: THREE.MathUtils.clamp(x, -78, 78),
          min: -78,
          max: 78,
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

    function addObs(obj: THREE.Object3D, pos: THREE.Vector3, radius: number) {
      obj.position.copy(pos); scene.add(obj);
      obstacles.push({ position: pos.clone(), radius });
    }

    // Buildings
    ([[-22,-156,4.2,5.2,5.5,0],[26,-142,5.4,5.1,7.2,1],[-42,-122,6.8,6.2,10.5,2],
      [46,-106,7.5,6.5,12.4,3],[-22,-72,4.2,5.2,5.5,0],[25,-64,5.4,5.1,7.2,1],
      [-28,-48,4.8,5.6,6.1,2],[30,-24,5.6,4.8,8.4,3],[-30,-8,4.6,5.4,5.8,0],
      [28,8,5.2,5.8,9.2,1],[-52,22,8.5,7.5,13.5,2],[54,44,7.8,7.1,11.2,3],
      [-31,48,5.4,4.9,6.4,2],[25,63,4.8,5.8,7.6,3],[-38,104,6.6,6.1,9.2,0],
      [42,126,7.4,6.8,14.2,1],[-24,158,5.6,6.2,8.3,2],[28,172,6.4,6.4,9.6,3]] as number[][]).forEach(([x,z,w,d,h,s]) => {
      const radius = Math.max(w,d) * 0.72;
      addObs(createBuilding(w,d,h,s), openPosition(x, z, radius), radius);
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

    // Sensor towers
    ([[-82,-150,9.2],[78,-130,8.6],[-55,-40,7.2],[-48,53,8.4],[52,-54,7.8],[50,46,8.1],[-78,142,9.8],[82,162,9.1]] as number[][]).forEach(([x,z,h]) => {
      addObs(createSensorTower(h), openPosition(x, z, 2.1), 2.1);
    });

    // Utility poles
    for (let z = -174; z < 178; z += 18)
      ([-12.5, 12.5] as number[]).forEach(x => addObs(createUtilityPole(5.5), openPosition(x, z, 0.8), 0.8));

    const trafficVehicles: TrafficVehicle[] = [];

    // Moving traffic
    ([[-4.2,-154,0x1e4a6e,0.18],[4.1,-118,0x2a3f22,-0.22],[-29,-76,0x4a2a1e,Math.PI/2],
      [28,-34,0x1a2e3a,Math.PI/2],[-4.2,-49,0x1e4a6e,0.18],[4.1,-2,0x2a3f22,-0.22],
      [-29,31,0x4a2a1e,Math.PI/2],[28,84,0x1a2e3a,Math.PI/2],[-15,55,0x3a1a28,0.05],
      [5.8,132,0x553c22,-0.12],[-6.2,168,0x253852,0.2]] as number[][]).forEach(([x,z,color,rot], index) => {
      const route = roadVehicleRoute(x, z);
      const car = createSedan(color);
      car.rotation.y = route.axis === "x" ? Math.PI / 2 : rot;

      const position = route.axis === "x"
        ? new THREE.Vector3(route.progress, surfaceHeight(route.progress, route.lane) + VEHICLE_CLEARANCE, route.lane)
        : new THREE.Vector3(route.lane, surfaceHeight(route.lane, route.progress) + VEHICLE_CLEARANCE, route.progress);
      car.position.copy(position);
      scene.add(car);

      const obstacle = { position: position.clone(), radius: 2.6 };
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
        direction: index % 2 === 0 ? 1 : -1,
        verticalVelocity: 0,
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
    const roles: Array<"SCOUT" | "RELAY" | "GUARD"> = ["SCOUT","RELAY","GUARD","RELAY","GUARD","SCOUT","RELAY"];
    const drones: DroneRig[] = roles.map((role, i) => {
      const { group, bladePairs, navLightMats } = createDrone(role);
      const rig: DroneRig = {
        group, bladePairs, navLightMats, role,
        phase: (i / roles.length) * Math.PI * 2,
        radius: 30 + i * 13,
        speed: 0.3 + i * 0.07,
        altitude: 4.5 + (i % 3) * 1.4,
      };
      group.position.set(Math.sin(rig.phase) * rig.radius, rig.altitude, Math.cos(rig.phase) * rig.radius);
      scene.add(group);
      return rig;
    });

    // ── Input ────────────────────────────────────────────────────────────────
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const onKeyUp   = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);

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
    const placeTrafficVehicle = (vehicle: TrafficVehicle, index: number, t: number, dt: number) => {
      const wobble = Math.sin(t * 1.4 + index) * 0.08;

      if (vehicle.axis === "x") {
        const x = vehicle.progress;
        const z = vehicle.lane + wobble;
        const yaw = vehicle.direction > 0 ? Math.PI / 2 : -Math.PI / 2;
        const surface = stepSuspension(
          vehicle.group.position.y,
          vehicle.verticalVelocity,
          surfaceHeight(x, z) + VEHICLE_CLEARANCE,
          dt
        );
        vehicle.verticalVelocity = surface.verticalVelocity;
        vehicle.group.position.set(x, surface.y, z);
        vehicle.group.rotation.copy(terrainAdjustedEuler(yaw, x, z));
      } else {
        const x = vehicle.lane + wobble;
        const z = vehicle.progress;
        const yaw = vehicle.direction > 0 ? 0 : Math.PI;
        const surface = stepSuspension(
          vehicle.group.position.y,
          vehicle.verticalVelocity,
          surfaceHeight(x, z) + VEHICLE_CLEARANCE,
          dt
        );
        vehicle.verticalVelocity = surface.verticalVelocity;
        vehicle.group.position.set(x, surface.y, z);
        vehicle.group.rotation.copy(terrainAdjustedEuler(yaw, x, z));
      }

      vehicle.obstacle.position.copy(vehicle.group.position);
    };

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04);
      const t  = clock.elapsedTime;

      const fwd = keys.has("w") || keys.has("arrowup");
      const bwd = keys.has("s") || keys.has("arrowdown");
      const lft = keys.has("a") || keys.has("arrowleft");
      const rgt = keys.has("d") || keys.has("arrowright");

      speed += ((fwd ? 1 : 0) - (bwd ? 0.72 : 0)) * dt * 26;
      speed *= 0.964;
      speed = Math.max(-9, Math.min(20, speed));

      const st = (lft ? 1 : 0) - (rgt ? 1 : 0);
      steering += (st - steering) * dt * 7;
      roverYaw += steering * speed * dt * 0.13;

      trafficVehicles.forEach((vehicle, index) => {
        vehicle.progress += vehicle.direction * vehicle.speed * dt;
        if (vehicle.progress > vehicle.max) {
          vehicle.progress = vehicle.max;
          vehicle.direction = -1;
        } else if (vehicle.progress < vehicle.min) {
          vehicle.progress = vehicle.min;
          vehicle.direction = 1;
        }

        placeTrafficVehicle(vehicle, index, t, dt);
      });

      for (let i = 0; i < trafficVehicles.length; i++) {
        for (let j = i + 1; j < trafficVehicles.length; j++) {
          const a = trafficVehicles[i];
          const b = trafficVehicles[j];
          const distance = a.obstacle.position.distanceTo(b.obstacle.position);
          const minDistance = a.obstacle.radius + b.obstacle.radius + 0.9;

          if (distance < minDistance) {
            a.direction = a.direction === 1 ? -1 : 1;
            b.direction = b.direction === 1 ? -1 : 1;
            a.progress = THREE.MathUtils.clamp(a.progress + a.direction * 2.2, a.min, a.max);
            b.progress = THREE.MathUtils.clamp(b.progress + b.direction * 2.2, b.min, b.max);
            placeTrafficVehicle(a, i, t, dt);
            placeTrafficVehicle(b, j, t, dt);
          }
        }
      }

      const dir = new THREE.Vector3(-Math.sin(roverYaw), 0, -Math.cos(roverYaw));
      rover.position.addScaledVector(dir, speed * dt);
      const fix = resolveCollision(rover.position, obstacles, 1.72);
      if (fix.lengthSq() > 0) { rover.position.add(fix); speed *= -0.28; }
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
      wheels.forEach(w => { w.rotation.x += speed * dt * 2.4; });

      drones.forEach((drone, i) => {
        const ph  = t * drone.speed + drone.phase;
        const pz  = ((t * 10 + i * 58) % 370) - 185;
        const side = i % 2 === 0 ? 1 : -1;
        let tx = 0, tz = 0;
        let altitudeOffset = drone.altitude;

        if (drone.role === "SCOUT") {
          tx = rover.position.x + Math.sin(ph) * 5.5;
          tz = rover.position.z + Math.cos(ph) * 5.5;
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
        drone.group.position.lerp(target, 1 - Math.pow(0.014, dt));
        drone.group.position.y = surfaceHeight(drone.group.position.x, drone.group.position.z) + drone.altitude + Math.sin(t * 2 + i) * 0.5;
        if (drone.role === "SCOUT") drone.group.lookAt(rover.position.x, drone.group.position.y, rover.position.z);

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

      camOff.set(0, 9.2, 16).applyAxisAngle(new THREE.Vector3(0, 1, 0), roverYaw);
      camTarget.copy(rover.position).add(camOff);
      camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
      camera.lookAt(rover.position.x, rover.position.y + 1.3, rover.position.z);

      renderer.render(scene, camera);

      if (++hudTick % 10 === 0) {
        setHud({ speed, beams: activeBeams, nearest: near[0]?.d ?? 99 });
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
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
      <HUD {...hud} />
    </div>
  );
}
