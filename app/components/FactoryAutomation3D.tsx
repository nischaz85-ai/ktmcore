"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

type CameraMode = "OVERVIEW" | "FOLLOW" | "FLOOR";
type PackageKind = "ELECTRONICS" | "MEDICAL" | "INDUSTRIAL";
type RobotState = "IDLE" | "TO_PICKUP" | "LOADING" | "TO_STAGING" | "QUEUED_HANDOFF" | "TO_DROPOFF" | "WAITING_ARM" | "CHARGING";
type PackageStage = "QUEUED" | "ON_ROBOT" | "AT_INFEED" | "ARM_LOADING" | "ON_LOOP" | "ARM_UNLOADING" | "DELIVERED";
type ArmState = "IDLE" | "PICKING" | "PLACING";

interface Controls {
  paused: boolean;
  speed: number;
  camera: CameraMode;
  traffic: boolean;
  paths: boolean;
}

interface FactoryPackage {
  id: number;
  kind: PackageKind;
  mesh: THREE.Group;
  station: number;
  assigned: boolean;
  delivered: boolean;
  stage: PackageStage;
  loopProgress: number;
  body: RAPIER.RigidBody | null;
  // Real dynamics (gravity/contact) only run for a brief settle window after a
  // drop; once settled the package is locked to follow its carrier exactly,
  // at whatever offset physics actually settled it at. This avoids relying on
  // friction alone to hold cargo against a moving/accelerating carrier, which
  // is unstable to tune (slips under acceleration, or worse, can pump energy
  // in via a forced-velocity correction and "climb").
  physicsTimer: number;
  locked: boolean;
  lockedOffset: THREE.Vector3 | null;
  lockedYaw: number;
}

interface BeltSegment {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  dir: THREE.Vector2;
  topY: number;
}

interface MobileRobot {
  id: number;
  group: THREE.Group;
  body: THREE.Mesh;
  wheels: THREE.Mesh[];
  beacon: THREE.MeshStandardMaterial;
  state: RobotState;
  package: FactoryPackage | null;
  path: THREE.Vector3[];
  pathIndex: number;
  velocity: THREE.Vector3;
  battery: number;
  timer: number;
  distance: number;
  physicsBody: RAPIER.RigidBody;
  handoffSlot: number;
  assignedArm: number;
}

interface RobotArm {
  group: THREE.Group;
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  gripper: THREE.Group;
  fingers: THREE.Mesh[];
  payload: THREE.Mesh;
  phase: number;
  side: number;
  role: "INFEED" | "OUTFEED";
  state: ArmState;
  timer: number;
  package: FactoryPackage | null;
  robot: MobileRobot | null;
  index: number;
  transferStart: THREE.Vector3;
  releaseStart: THREE.Vector3;
  transferCaptured: boolean;
  releaseCaptured: boolean;
  poseChannels: [number, number, number, number];
}

interface Telemetry {
  delivered: number;
  active: number;
  queued: number;
  throughput: number;
  efficiency: number;
}

// Single geometric source of truth for the straight powered conveyor.
const CONVEYOR_START_X = -38;
const CONVEYOR_END_X = 42;
const CONVEYOR_Z = -8;
const LOOP_WIDTH = 6;
const LOOP_Y_CENTER = 1.45;
const LOOP_HEIGHT = 1.15;
const LOOP_TOP_Y = LOOP_Y_CENTER + LOOP_HEIGHT / 2;
const LOOP_STRAIGHT_LEN = CONVEYOR_END_X - CONVEYOR_START_X;
const LOOP_BELT_SPEED = 6;

const KINDS: PackageKind[] = ["ELECTRONICS", "MEDICAL", "INDUSTRIAL"];
const KIND_COLORS: Record<PackageKind, number> = {
  ELECTRONICS: 0x38bdf8,
  MEDICAL: 0x34d399,
  INDUSTRIAL: 0xf59e0b,
};
const PICKUPS = [
  new THREE.Vector3(-40, 0, -24),
  new THREE.Vector3(-40, 0, 0),
  new THREE.Vector3(-40, 0, 24),
];
const DROPS = [
  new THREE.Vector3(43, 0, -24),
  new THREE.Vector3(43, 0, 0),
  new THREE.Vector3(43, 0, 24),
];
// Single intake arm: it is the only thing that ever loads the belt, so every
// AMR from all three pickup lanes converges on this one pedestal.
// INFEED_STOP is solved, not guessed: it's exactly where the INFEED arm's grab
// pose (ARM_GRAB_POSE below) actually places its gripper, verified by forward-
// kinematics against the arm's real link lengths (see ARM_GRAB_POSE comment).
// Kept 8.6 units from the arm's base (ARM_OBSTACLE) so the AMR's final approach
// doesn't bring its body into contact with the arm's pedestal. z=-17 (not 0) is
// load-bearing, not cosmetic: it keeps INFEED_STOP (z=-22) well clear of the
// conveyor belt's own collider, which spans z -11..-5 — centering this arm at
// z=0 would put INFEED_STOP at z=-5, exactly on the belt's edge, permanently
// stranding every AMR trying to dock there.
const INFEED_ARM_POSITION = new THREE.Vector3(-28, 0, -17);
const INFEED_STOPS = [INFEED_ARM_POSITION.clone().add(new THREE.Vector3(7, 0, -5))];
// Three dedicated sort arms downstream on the belt, one per material class
// (index matches KINDS/PICKUPS/DROPS station order). Each sits between the
// belt and its own finished-goods bay so its pick-from-belt / place-in-bin
// throw reads as a short, deliberate motion rather than a teleport.
const OUTFEED_ARM_POSITIONS = [-24, 0, 24].map((z) => new THREE.Vector3(34, 0, z));
const CHARGERS = [
  new THREE.Vector3(6, 0, 28),
  new THREE.Vector3(14, 0, 28),
  new THREE.Vector3(22, 0, 28),
];
const ROBOT_STARTS = [
  new THREE.Vector3(-12, 0, -34),
  new THREE.Vector3(0, 0, -34),
  new THREE.Vector3(12, 0, -34),
  new THREE.Vector3(-12, 0, 34),
  new THREE.Vector3(0, 0, 34),
  new THREE.Vector3(12, 0, 34),
];
const HANDOFF_QUEUE = [
  new THREE.Vector3(-16, 0, -29),
  new THREE.Vector3(-8, 0, -29),
  new THREE.Vector3(0, 0, -29),
  new THREE.Vector3(8, 0, -29),
  new THREE.Vector3(16, 0, -29),
  new THREE.Vector3(24, 0, -29),
];

// The arm's two end poses: [shoulderYaw, shoulderPitch, elbowPitch, wristPitch].
// IDLE is a cosmetic retracted pose (no reach requirement). GRAB is solved by
// forward-kinematics (link lengths 6.05 / 5.0 / 3.15, matching createRobotArm)
// against the real AMR pickup point so the gripper actually closes on the
// package's center resting on the robot deck, not an eyeballed approximation.
const ARM_IDLE_POSE = [-0.28, -0.76, -0.96, 0.58] as const;
const ARM_GRAB_POSE = [1.343, -0.774, -1.534, 0.074] as const;

function material(color: number, roughness = 0.65, metalness = 0.18) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function glow(color: number, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.22,
    metalness: 0.08,
  });
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  mat: THREE.Material,
  cast = true
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createRobot(id: number, position: THREE.Vector3, world: RAPIER.World): MobileRobot {
  const group = new THREE.Group();
  const shell = material(0x16283a, 0.38, 0.62);
  const dark = material(0x07111a, 0.72, 0.35);
  const body = addBox(group, [4.3, 1.15, 3.25], [0, 0.95, 0], shell);
  addBox(group, [3.5, 0.35, 2.55], [0, 1.7, 0], dark);
  addBox(group, [2.55, 0.12, 2.0], [0, 1.94, 0], material(0x35495d, 0.5, 0.5));
  const bumper = material(0x05090d, 0.92, 0.1);
  addBox(group, [4.55, 0.38, 0.32], [0, 0.62, -1.7], bumper);
  addBox(group, [4.55, 0.38, 0.32], [0, 0.62, 1.7], bumper);

  const wheels: THREE.Mesh[] = [];
  [-1, 1].forEach((side) => {
    [-1, 1].forEach((end) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.34, 16), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.72, 0.5, end * 1.05);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    });
  });

  const beacon = glow(id % 2 ? 0x22d3ee : 0x60a5fa, 2.2);
  const light = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.09, 0.16), beacon);
  light.position.set(0, 1.76, -1.38);
  group.add(light);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.65, 10), dark);
  mast.position.set(1.35, 2.15, 0.75);
  group.add(mast);
  const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 18), glow(0x67e8f9, 1.8));
  lidar.position.set(1.35, 2.52, 0.75);
  group.add(lidar);
  group.position.copy(position);

  const physicsBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z)
  );
  world.createCollider(
    // High friction: a real AMR deck would have a raised lip/latch, not just
    // friction, to keep cargo from sliding off under acceleration. Friction
    // alone needs real margin over the robot's accel (~7 units/s^2) to hold.
    RAPIER.ColliderDesc.cuboid(2.15, 0.575, 1.625).setTranslation(0, 0.95, 0).setFriction(1.6),
    physicsBody
  );

  return {
    id, group, body, wheels, beacon,
    state: "IDLE", package: null, path: [], pathIndex: 0,
    velocity: new THREE.Vector3(), battery: 62 + (id * 7) % 38,
    timer: 0, distance: 0, physicsBody, handoffSlot: -1, assignedArm: -1,
  };
}

function createPackage(id: number, kind: PackageKind, station: number) {
  const group = new THREE.Group();
  const box = addBox(group, [2.05, 1.35, 1.65], [0, 0.72, 0], material(0xb7834e, 0.92, 0.01));
  addBox(group, [2.1, 0.14, 0.25], [0, 0.76, 0], material(KIND_COLORS[kind], 0.58, 0.05), false);
  addBox(group, [0.24, 1.39, 1.68], [0, 0.72, 0], material(0xd6aa73, 0.88, 0.01), false);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  label.position.set(0, 0.82, 0.831);
  group.add(label);
  box.castShadow = true;
  return {
    id, kind, mesh: group, station, assigned: false, delivered: false, stage: "QUEUED", loopProgress: 0,
    body: null, physicsTimer: 0, locked: false, lockedOffset: null, lockedYaw: 0,
  } satisfies FactoryPackage;
}

function createRobotArm(position: THREE.Vector3, rotation: number, phase: number, side: number, role: RobotArm["role"], index: number): RobotArm {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = rotation;
  const orange = material(0xf59e0b, 0.32, 0.42);
  const orangeDark = material(0xb45309, 0.42, 0.38);
  const graphite = material(0x111923, 0.3, 0.76);
  const steel = material(0x94a3b8, 0.24, 0.82);
  const rubber = material(0x05090d, 0.88, 0.1);

  const addCylinder = (
    parent: THREE.Object3D,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    y: number,
    mat: THREE.Material,
    rotateZ = 0
  ) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32), mat);
    mesh.position.y = y;
    mesh.rotation.z = rotateZ;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const addLink = (parent: THREE.Object3D, radius: number, straightLength: number, y: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, straightLength, 10, 20), mat);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Fixed pedestal and axis-one turntable.
  addCylinder(group, 2.75, 2.75, 0.28, 0.14, graphite);
  addCylinder(group, 2.18, 2.48, 1.35, 0.82, orangeDark);
  addCylinder(group, 1.82, 1.82, 0.32, 1.57, steel);
  const statusRing = new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.1, 10, 40), glow(0x22d3ee, 1.25));
  statusRing.rotation.x = Math.PI / 2;
  statusRing.position.y = 1.75;
  group.add(statusRing);

  // Shoulder pivot, yoke and upper-arm link.
  const shoulder = new THREE.Group();
  shoulder.position.y = 1.75;
  group.add(shoulder);
  addBox(shoulder, [0.55, 1.9, 2.4], [-1.32, 0.42, 0], graphite);
  addBox(shoulder, [0.55, 1.9, 2.4], [1.32, 0.42, 0], graphite);
  addCylinder(shoulder, 1.22, 1.22, 3.05, 0.25, steel, Math.PI / 2);
  addCylinder(shoulder, 0.76, 0.76, 3.18, 0.25, graphite, Math.PI / 2);
  addLink(shoulder, 0.92, 4.15, 3.05, orange);
  addBox(shoulder, [0.32, 3.25, 1.88], [0, 3.05, 0], orangeDark);

  // Elbow pivot and slimmer forearm.
  const elbow = new THREE.Group();
  elbow.position.y = 6.05;
  shoulder.add(elbow);
  addCylinder(elbow, 1.08, 1.08, 2.42, 0, steel, Math.PI / 2);
  addCylinder(elbow, 0.68, 0.68, 2.58, 0, graphite, Math.PI / 2);
  addLink(elbow, 0.7, 3.6, 2.5, orange);
  addBox(elbow, [0.24, 2.75, 1.42], [0, 2.5, 0], orangeDark);

  // Three-piece wrist stack and tool flange.
  const wrist = new THREE.Group();
  wrist.position.y = 5.0;
  elbow.add(wrist);
  addCylinder(wrist, 0.88, 0.88, 1.65, 0, graphite, Math.PI / 2);
  addCylinder(wrist, 0.72, 0.84, 1.0, 0.62, orangeDark);
  addCylinder(wrist, 0.58, 0.7, 0.72, 1.42, steel);
  addCylinder(wrist, 0.64, 0.64, 0.22, 1.83, graphite);

  // Compact, readable parallel-jaw end effector.
  const gripper = new THREE.Group();
  gripper.position.y = 2.0;
  wrist.add(gripper);
  addBox(gripper, [2.85, 0.62, 1.72], [0, 0, 0], graphite);
  addBox(gripper, [2.45, 0.16, 1.8], [0, -0.38, 0], glow(0x22d3ee, 1.1));
  const fingers = [-1, 1].map((fingerSide) => {
    const finger = addBox(gripper, [0.42, 1.8, 0.62], [fingerSide * 1.32, -1.08, 0], steel);
    addBox(finger, [0.54, 0.42, 0.82], [-fingerSide * 0.08, -0.72, 0], rubber);
    return finger;
  });
  const payload = addBox(gripper, [1.75, 1.15, 1.45], [0, -1.02, 0], material(KIND_COLORS[KINDS[Math.floor(phase) % 3]], 0.7, 0.08));
  const gripLight = new THREE.PointLight(0x67e8f9, 1.5, 7, 2);
  gripLight.position.set(0, -0.9, 0);
  gripper.add(gripLight);

  // External service loop makes the silhouette read like a real routed arm.
  const cable = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.09, 8, 30, Math.PI * 1.25), rubber);
  cable.rotation.z = Math.PI / 2;
  cable.position.set(0, 4.9, -0.85);
  shoulder.add(cable);
  payload.visible = false;
  return {
    group, shoulder, elbow, wrist, gripper, fingers, payload, phase, side, role,
    state: "IDLE", timer: 0, package: null, robot: null, index,
    transferStart: new THREE.Vector3(), releaseStart: new THREE.Vector3(),
    transferCaptured: false, releaseCaptured: false,
    poseChannels: [ARM_IDLE_POSE[0], ARM_IDLE_POSE[1], ARM_IDLE_POSE[2], ARM_IDLE_POSE[3]],
  };
}

function buildAssemblyLoop(scene: THREE.Scene, world: RAPIER.World) {
  const beltMat = material(0x30383d, 0.72, 0.35);
  const railMat = material(0xb3bdc2, 0.28, 0.8);
  const safetyMat = material(0xfacc15, 0.58, 0.28);
  const loop = new THREE.Group();
  scene.add(loop);

  // One continuous powered conveyor with a matching fixed physics surface.
  const beltSegments: BeltSegment[] = [];
  function addBeltSegment(size: [number, number, number], position: [number, number, number], dir: [number, number]) {
    addBox(loop, size, position, beltMat);
    const [sx, sy, sz] = size;
    const [px, py, pz] = position;
    const fixedBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz));
    world.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setFriction(0.9), fixedBody);
    beltSegments.push({
      minX: px - sx / 2, maxX: px + sx / 2,
      minZ: pz - sz / 2, maxZ: pz + sz / 2,
      dir: new THREE.Vector2(dir[0], dir[1]),
      topY: py + sy / 2,
    });
  }
  const centerX = (CONVEYOR_START_X + CONVEYOR_END_X) / 2;
  addBeltSegment([LOOP_STRAIGHT_LEN, LOOP_HEIGHT, LOOP_WIDTH], [centerX, LOOP_Y_CENTER, CONVEYOR_Z], [1, 0]);
  [-1, 1].forEach((side) => addBox(loop, [LOOP_STRAIGHT_LEN + 1, 0.22, 0.22], [centerX, 2.28, CONVEYOR_Z + side * 3.18], railMat));
  for (let x = CONVEYOR_START_X + 1; x < CONVEYOR_END_X; x += 2.2) addBox(loop, [0.34, 0.09, LOOP_WIDTH - 0.5], [x, 2.07, CONVEYOR_Z], railMat, false);
  for (let x = CONVEYOR_START_X + 3; x < CONVEYOR_END_X; x += 10) {
    [-1, 1].forEach((side) => addBox(loop, [0.5, 2, 0.5], [x, 0.85, CONVEYOR_Z + side * 2.25], railMat));
    addBox(loop, [3.6, 0.18, 7], [x, 0.12, CONVEYOR_Z], material(0x4b5357, 0.72, 0.38));
  }
  addBox(loop, [LOOP_STRAIGHT_LEN, 0.08, 0.16], [centerX, 2.35, CONVEYOR_Z - 3.5], safetyMat, false);

  // Arm index 0 is the single infeed arm (loads the belt from AMRs); indices
  // 1-3 are the outfeed sort arms, one per material class, index - 1 maps
  // directly to the KINDS/PICKUPS/DROPS station order.
  const infeedArm = createRobotArm(INFEED_ARM_POSITION.clone(), -0.72, 0, 1, "INFEED", 0);
  const outfeedArms = OUTFEED_ARM_POSITIONS.map((position, station) =>
    createRobotArm(position.clone(), 0, (station + 1) * 1.7, station % 2 ? -1 : 1, "OUTFEED", station + 1)
  );
  const arms = [infeedArm, ...outfeedArms];
  arms.forEach((arm) => {
    scene.add(arm.group);
    const fence = new THREE.Group();
    fence.position.copy(arm.group.position);
    [-8.5, 8.5].forEach((x) => [-7.5, 7.5].forEach((z) => addBox(fence, [0.18, 2.8, 0.18], [x, 1.4, z], safetyMat)));
    [-7.5, 7.5].forEach((z) => {
      addBox(fence, [17.2, 0.16, 0.16], [0, 2.75, z], safetyMat);
      addBox(fence, [17.2, 0.16, 0.16], [0, 0.72, z], safetyMat);
    });
    scene.add(fence);
  });

  return { arms, beltSegments };
}

// The path centerline is the rectangle joining the 4 belt segments' own centerlines
// (back/front at z=±LOOP_HALF_Z, left/right at x=±LOOP_HALF_X) — its corners are
// exactly where two physical belt boxes overlap, so the path never leaves a collider.
const LOOP_PERIMETER = LOOP_STRAIGHT_LEN;

function loopPosition(progress: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  return { position: new THREE.Vector3(THREE.MathUtils.lerp(CONVEYOR_START_X, CONVEYOR_END_X, p), 0, CONVEYOR_Z), yaw: Math.PI / 2 };
}

function armDropProgress(arm: RobotArm) {
  return THREE.MathUtils.clamp((arm.group.position.x + 6 - CONVEYOR_START_X) / LOOP_STRAIGHT_LEN, 0.02, 0.95);
}

function buildFactory(scene: THREE.Scene, world: RAPIER.World) {
  scene.background = new THREE.Color(0x9aa8b2);
  scene.fog = new THREE.Fog(0xaeb8bf, 115, 205);
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x59636a, 2.05));

  const sun = new THREE.DirectionalLight(0xfff4dc, 3.1);
  sun.position.set(-38, 54, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.bias = -0.00025;
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(128, 86), material(0x7f8588, 0.93, 0.04));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Real ground collider: without this, any package that ever loses contact
  // with a belt/deck collider (a brief miss, a nudge off the side) free-falls
  // forever with nothing to catch it, then "teleports" back when some later
  // stage explicitly repositions it. This is the floor of last resort.
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(64, 0.5, 43).setFriction(0.8), floorBody);

  // Sealed concrete bays and painted traffic lanes.
  const seamMat = material(0x666d70, 0.96, 0.01);
  for (let x = -56; x <= 56; x += 14) addBox(scene, [0.075, 0.025, 84], [x, 0.018, 0], seamMat, false);
  for (let z = -35; z <= 35; z += 14) addBox(scene, [126, 0.025, 0.075], [0, 0.019, z], seamMat, false);
  const yellowPaint = material(0xfbbf24, 0.7, 0.04);
  addBox(scene, [90, 0.035, 0.22], [-3, 0.038, -32.5], yellowPaint, false);
  addBox(scene, [90, 0.035, 0.22], [-3, 0.038, -27.5], yellowPaint, false);
  for (let x = -46; x <= 40; x += 6) addBox(scene, [2.7, 0.036, 0.18], [x, 0.04, -30], yellowPaint, false);

  // Bright insulated warehouse shell with corrugated wall ribs.
  const wallMat = material(0xcbd2d6, 0.76, 0.12);
  const ribMat = material(0x8d989e, 0.54, 0.3);
  addBox(scene, [128, 24, 1], [0, 12, -43], wallMat);
  addBox(scene, [1, 24, 86], [-64, 12, 0], wallMat);
  addBox(scene, [1, 24, 86], [64, 12, 0], wallMat);
  for (let x = -62; x <= 62; x += 4) addBox(scene, [0.12, 23, 0.1], [x, 12, -42.42], ribMat, false);
  for (let z = -40; z <= 40; z += 4) {
    addBox(scene, [0.1, 23, 0.12], [-63.42, 12, z], ribMat, false);
    addBox(scene, [0.1, 23, 0.12], [63.42, 12, z], ribMat, false);
  }

  // Steel portal frame, roof trusses, skylight strips and high-bay luminaires.
  const steelBlue = material(0x334b5d, 0.42, 0.68);
  for (let x = -60; x <= 60; x += 20) {
    addBox(scene, [0.65, 23, 0.65], [x, 11.5, -41], steelBlue);
    addBox(scene, [0.65, 23, 0.65], [x, 11.5, 41], steelBlue);
    addBox(scene, [0.65, 0.65, 82], [x, 22.2, 0], steelBlue);
    for (const z of [-26, 0, 26]) {
      const fixture = addBox(scene, [8.5, 0.18, 1.0], [x, 20.6, z], glow(0xf5fbff, 1.35), false);
      fixture.castShadow = false;
      const light = new THREE.PointLight(0xeaf7ff, 0.72, 35, 2);
      light.position.set(x, 19.8, z);
      scene.add(light);
    }
  }
  // Realistic pallet-rack modules with wood pallets and mixed cartons.
  const rackBlue = material(0x1d4f73, 0.48, 0.58);
  const rackOrange = material(0xe87920, 0.5, 0.38);
  const cartonMats = [material(0xa97745, 0.9, 0.02), material(0xc39763, 0.88, 0.02), material(0x8c623b, 0.92, 0.01)];
  function addRack(x: number, z: number, yaw = 0) {
    const rack = new THREE.Group();
    rack.position.set(x, 0, z);
    rack.rotation.y = yaw;
    [-6.8, 6.8].forEach((rx) => [-1.55, 1.55].forEach((rz) => addBox(rack, [0.38, 12, 0.38], [rx, 6, rz], rackBlue)));
    [1.1, 4.7, 8.3, 11.9].forEach((y) => {
      addBox(rack, [14.1, 0.34, 0.38], [0, y, -1.55], rackOrange);
      addBox(rack, [14.1, 0.34, 0.38], [0, y, 1.55], rackOrange);
    });
    for (let level = 0; level < 3; level++) {
      for (let slot = -2; slot <= 2; slot++) {
        addBox(rack, [2.2, 0.22, 2.7], [slot * 2.55, 1.35 + level * 3.6, 0], material(0x8a5a2b, 0.9, 0.02));
        const carton = addBox(rack, [2.0, 1.55 + (slot % 2) * 0.18, 2.35], [slot * 2.55, 2.25 + level * 3.6, 0], cartonMats[(slot + level + 5) % cartonMats.length]);
        carton.rotation.y = slot * 0.025;
      }
    }
    scene.add(rack);
  }
  addRack(22, -38, 0);
  addRack(42, -38, 0);
  addRack(60, 34, Math.PI / 2);

  const conveyorMat = material(0x29343b, 0.54, 0.52);
  const rollerMat = material(0xaeb8bd, 0.24, 0.78);
  [-24, 0, 24].forEach((z, station) => {
    addBox(scene, [19, 1.25, 4.5], [-53, 1.15, z], conveyorMat);
    for (let x = -61; x <= -44; x += 1.5) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.7, 12), rollerMat);
      roller.rotation.x = Math.PI / 2;
      roller.position.set(x, 1.85, z);
      scene.add(roller);
    }
    addBox(scene, [0.25, 3.3, 5.2], [-43, 1.65, z], yellowPaint);

    addBox(scene, [14, 0.6, 8], [54, 0.35, z], material(0x3f474b, 0.7, 0.35));
    for (let x = 49; x <= 59; x += 5) {
      for (let level = 0; level < 3; level++) {
        const bin = addBox(scene, [3.7, 2.4, 3.8], [x, 1.5 + level * 2.7, z], material(KIND_COLORS[KINDS[station]], 0.8, 0.05));
        (bin.material as THREE.MeshStandardMaterial).emissive.setHex(KIND_COLORS[KINDS[station]]);
        (bin.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.08;
      }
    }
  });

  // Charging bay and restrained floor graphics.
  CHARGERS.forEach((position, index) => {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(2.4, 28), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.26 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.copy(position).setY(0.055);
    scene.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.12, 8, 30), glow(0x4ade80, 1.4));
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(position).setY(0.08);
    ring.visible = index % 2 === 0;
    scene.add(ring);
  });

  addBox(scene, [18, 7.2, 0.35], [0, 14, -42.25], material(0x1c2930, 0.44, 0.38));
  addBox(scene, [15.5, 0.16, 0.1], [0, 15.8, -42], glow(0x22d3ee, 1.1), false);
}

interface RouteObstacle {
  x: number;
  z: number;
  radius: number;
}

// The arm's pedestal + work envelope: any lane whose long-haul travel segment
// would pass within this radius gets skipped in favor of the next-nearest
// lane. The short final approach into a target is exempt by design — getting
// this close is the intentional docking maneuver, not transit.
const ARM_OBSTACLES: RouteObstacle[] = [INFEED_ARM_POSITION, ...OUTFEED_ARM_POSITIONS].map((position) => ({ x: position.x, z: position.z, radius: 5.5 }));

interface NavRect { minX: number; maxX: number; minZ: number; maxZ: number }

// Physical equipment footprints used by both A* planning and the final
// movement guard. Rectangles describe the conveyor loop, source conveyors,
// racks, and finished-goods bays; the arm uses its circular work envelope.
const NAV_RECTS: NavRect[] = [
  { minX: CONVEYOR_START_X, maxX: CONVEYOR_END_X, minZ: CONVEYOR_Z - LOOP_WIDTH / 2, maxZ: CONVEYOR_Z + LOOP_WIDTH / 2 },
  ...[-24, 0, 24].map((z) => ({ minX: -63, maxX: -43.5, minZ: z - 2.5, maxZ: z + 2.5 })),
  { minX: 15, maxX: 29, minZ: -41, maxZ: -35 },
  { minX: 35, maxX: 49, minZ: -41, maxZ: -35 },
  { minX: 51, maxX: 57, minZ: 13, maxZ: 27 },
  ...[-24, 0, 24].map((z) => ({ minX: 47, maxX: 62, minZ: z - 4.5, maxZ: z + 4.5 })),
];

function isNavBlocked(x: number, z: number, margin = 2.35, avoid: RouteObstacle[] = ARM_OBSTACLES) {
  if (x < -59 || x > 59 || z < -38 || z > 38) return true;
  if (NAV_RECTS.some((rect) => x > rect.minX - margin && x < rect.maxX + margin && z > rect.minZ - margin && z < rect.maxZ + margin)) return true;
  return avoid.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + margin);
}

function createRoute(from: THREE.Vector3, to: THREE.Vector3, robotId: number, avoid: RouteObstacle[] = []) {
  const step = 4;
  const snap = (value: number) => Math.round(value / step) * step;
  const start = { x: snap(from.x), z: snap(from.z) };
  const goal = { x: snap(to.x), z: snap(to.z) };
  const key = (x: number, z: number) => `${x},${z}`;
  const startKey = key(start.x, start.z);
  const goalKey = key(goal.x, goal.z);
  const open = new Map<string, { x: number; z: number; g: number; f: number }>();
  const cameFrom = new Map<string, string>();
  const costs = new Map<string, number>([[startKey, 0]]);
  open.set(startKey, { ...start, g: 0, f: Math.hypot(goal.x - start.x, goal.z - start.z) });
  const directions = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  while (open.size) {
    const current = [...open.values()].sort((a, b) => a.f - b.f || ((a.x + a.z + robotId * 3) % 7) - ((b.x + b.z + robotId * 3) % 7))[0];
    const currentKey = key(current.x, current.z);
    open.delete(currentKey);
    if (currentKey === goalKey) break;
    for (const [dx, dz] of directions) {
      const nx = current.x + dx * step;
      const nz = current.z + dz * step;
      const nextKey = key(nx, nz);
      const isEndpoint = nextKey === goalKey || nextKey === startKey;
      if (!isEndpoint && isNavBlocked(nx, nz, 2.45, avoid)) continue;
      if (dx && dz && (isNavBlocked(current.x + dx * step, current.z, 2.45, avoid) || isNavBlocked(current.x, current.z + dz * step, 2.45, avoid))) continue;
      const nextCost = current.g + (dx && dz ? 1.414 : 1) * step;
      if (nextCost >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, nextCost);
      cameFrom.set(nextKey, currentKey);
      open.set(nextKey, { x: nx, z: nz, g: nextCost, f: nextCost + Math.hypot(goal.x - nx, goal.z - nz) });
    }
  }

  if (!cameFrom.has(goalKey)) return [to.clone()];
  const reversed: THREE.Vector3[] = [];
  let cursor = goalKey;
  while (cursor !== startKey) {
    const [x, z] = cursor.split(",").map(Number);
    reversed.push(new THREE.Vector3(x, 0, z));
    cursor = cameFrom.get(cursor)!;
  }
  const raw = reversed.reverse();
  const simplified = raw.filter((point, index) => {
    if (index === 0 || index === raw.length - 1) return true;
    const before = raw[index - 1];
    const after = raw[index + 1];
    return (point.x - before.x) * (after.z - point.z) !== (point.z - before.z) * (after.x - point.x);
  });
  if (!simplified.length || simplified[simplified.length - 1].distanceToSquared(to) > 0.1) simplified.push(to.clone());
  return simplified;
}

function FactoryHUD({ controls, telemetry, onChange, onReset }: {
  controls: Controls;
  telemetry: Telemetry;
  onChange: React.Dispatch<React.SetStateAction<Controls>>;
  onReset: () => void;
}) {
  const patch = (next: Partial<Controls>) => onChange((current) => ({ ...current, ...next }));
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between px-4 pb-4 pt-20 text-white sm:px-6 sm:pb-6 sm:pt-24">
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-xl border border-cyan-300/25 bg-slate-950/75 px-4 py-3 shadow-2xl backdrop-blur-md">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">KTM Core · Fleet OS</p>
          <h2 className="mt-1 text-lg font-semibold sm:text-2xl">Multi-AMR Coordination Cell</h2>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <span className={`h-2 w-2 rounded-full ${controls.paused ? "bg-amber-400" : "animate-pulse bg-emerald-400"}`} />
            {controls.paused ? "SYSTEM HOLD" : "COORDINATED SORT ACTIVE"}
          </div>
          <div className="mt-2 font-mono text-[9px] tracking-[0.12em] text-cyan-200/80">DISPATCH → STAGING QUEUE → ARM HANDOFF → CONVEYOR</div>
        </div>
        <div className="hidden grid-cols-5 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 text-center backdrop-blur-md md:grid">
          {[
            ["SORTED", telemetry.delivered], ["ACTIVE", telemetry.active], ["QUEUE", telemetry.queued],
            ["RATE", `${telemetry.throughput}/m`], ["EFF.", `${telemetry.efficiency}%`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-20 bg-slate-950/75 px-3 py-2">
              <div className="text-[9px] tracking-[0.2em] text-slate-400">{label}</div>
              <div className="mt-0.5 font-mono text-sm text-cyan-200">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-auto flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="rounded-xl border border-white/10 bg-slate-950/78 p-3 backdrop-blur-md">
          <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-400">Material classes</div>
          <div className="flex flex-wrap gap-3 text-xs">
            {KINDS.map((kind) => <span key={kind} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: `#${KIND_COLORS[kind].toString(16).padStart(6, "0")}` }} />{kind}</span>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-slate-950/78 p-2 backdrop-blur-md">
          <button className="rounded-md bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-200" onClick={() => patch({ paused: !controls.paused })}>{controls.paused ? "Resume" : "Pause"}</button>
          <button className="rounded-md border border-white/15 px-3 py-2 text-xs hover:bg-white/10" onClick={onReset}>Reset</button>
          <button className={`rounded-md border px-3 py-2 text-xs ${controls.traffic ? "border-emerald-300/50 text-emerald-200" : "border-white/15"}`} onClick={() => patch({ traffic: !controls.traffic })}>Auto dispatch</button>
          <button className={`rounded-md border px-3 py-2 text-xs ${controls.paths ? "border-cyan-300/50 text-cyan-200" : "border-white/15"}`} onClick={() => patch({ paths: !controls.paths })}>Routes</button>
          <select aria-label="Factory camera" value={controls.camera} onChange={(event) => patch({ camera: event.target.value as CameraMode })} className="rounded-md border border-white/15 bg-slate-900 px-2 py-2 text-xs">
            <option value="OVERVIEW">Overview</option><option value="FOLLOW">Fleet follow</option><option value="FLOOR">Floor level</option>
          </select>
          <select aria-label="Simulation speed" value={controls.speed} onChange={(event) => patch({ speed: Number(event.target.value) })} className="rounded-md border border-white/15 bg-slate-900 px-2 py-2 text-xs">
            <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default function FactoryAutomation3D({ active = true }: { active?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const controlsRef = useRef<Controls>({ paused: false, speed: 1, camera: "OVERVIEW", traffic: true, paths: true });
  const resetRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [controls, setControls] = useState<Controls>(controlsRef.current);
  const [telemetry, setTelemetry] = useState<Telemetry>({ delivered: 0, active: 0, queued: 0, throughput: 0, efficiency: 100 });

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { controlsRef.current = controls; }, [controls]);

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;
    let cancelled = false;
    let frame = 0;
    let world: RAPIER.World | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let ro: ResizeObserver | null = null;
    let cleanupScene: (() => void) | null = null;

    const setup = async () => {
      await RAPIER.init();
      if (cancelled) return;

      const physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      world = physicsWorld;

      const scene = new THREE.Scene();
      buildFactory(scene, physicsWorld);
      const assembly = buildAssemblyLoop(scene, physicsWorld);
      const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 250);
      camera.position.set(40, 26, 40);
      const localRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      localRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      localRenderer.shadowMap.enabled = true;
      localRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      localRenderer.outputColorSpace = THREE.SRGBColorSpace;
      localRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      localRenderer.toneMappingExposure = 1.0;
      mountEl.appendChild(localRenderer.domElement);
      renderer = localRenderer;

      const robots = ROBOT_STARTS.map((start, id) => {
        const robot = createRobot(id, start.clone(), physicsWorld);
        scene.add(robot.group);
        return robot;
      });
      let packages: FactoryPackage[] = [];
      let packageId = 0;
      let delivered = 0;
      let elapsed = 0;
      let nextSpawn = 0.2;

      const routeLines = robots.map((_, index) => {
        const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: index % 2 ? 0x22d3ee : 0x60a5fa, transparent: true, opacity: 0.38 }));
        scene.add(line);
        return line;
      });

      function createPackageBody(pkg: FactoryPackage, position: THREE.Vector3, yaw = 0) {
        const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const rigidBody = physicsWorld.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation(quat)
        );
        physicsWorld.createCollider(
          RAPIER.ColliderDesc.cuboid(1.025, 0.675, 0.825).setTranslation(0, 0.72, 0).setFriction(1.6),
          rigidBody
        );
        pkg.body = rigidBody;
        pkg.physicsTimer = 0;
        pkg.locked = false;
        pkg.lockedOffset = null;
      }

      // After a brief real-physics settle window, lock the package to follow
      // its carrier exactly (AMR deck, or the belt's geometric path) at the
      // offset gravity/contact actually left it at, and drop the rigid body.
      function lockPackageToCarrier(pkg: FactoryPackage) {
        if (pkg.stage === "ON_ROBOT") {
          const owner = robots.find((robot) => robot.package === pkg);
          if (owner) {
            pkg.lockedOffset = owner.group.worldToLocal(pkg.mesh.position.clone());
            pkg.lockedYaw = pkg.mesh.rotation.y - owner.group.rotation.y;
          }
        }
        removePackageBody(pkg);
        pkg.locked = true;
      }

      function removePackageBody(pkg: FactoryPackage) {
        if (pkg.body) { physicsWorld.removeRigidBody(pkg.body); pkg.body = null; }
      }

      function syncPackageMesh(pkg: FactoryPackage) {
        if (!pkg.body) return;
        const t = pkg.body.translation();
        const r = pkg.body.rotation();
        pkg.mesh.position.set(t.x, t.y, t.z);
        pkg.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }

      function reset() {
        packages.forEach((pkg) => {
          removePackageBody(pkg);
          scene.remove(pkg.mesh);
        });
        packages = [];
        packageId = 0; delivered = 0; elapsed = 0; nextSpawn = 0.15;
        robots.forEach((robot, id) => {
          const startPos = ROBOT_STARTS[id].clone();
          robot.group.position.copy(startPos);
          robot.group.rotation.y = 0;
          robot.physicsBody.setNextKinematicTranslation(startPos);
          robot.physicsBody.setNextKinematicRotation(new THREE.Quaternion());
          robot.state = "IDLE"; robot.package = null; robot.path = []; robot.pathIndex = 0;
          robot.battery = 62 + (id * 7) % 38; robot.timer = 0; robot.distance = 0; robot.velocity.set(0, 0, 0); robot.handoffSlot = -1; robot.assignedArm = -1;
        });
        assembly.arms.forEach((arm) => {
          arm.state = "IDLE"; arm.timer = 0; arm.package = null; arm.robot = null;
          arm.transferCaptured = false; arm.releaseCaptured = false;
        });
      }

      function spawnPackage() {
        const station = packageId % PICKUPS.length;
        const pkg = createPackage(packageId++, KINDS[station], station);
        const queueAtStation = packages.filter((item) => !item.delivered && !item.assigned && item.station === station).length;
        pkg.mesh.position.copy(PICKUPS[station]).add(new THREE.Vector3(-10 - Math.min(queueAtStation, 5) * 2.45, 1.9, 0));
        scene.add(pkg.mesh);
        packages.push(pkg);
      }

    function assignJobs() {
      const waiting = packages.filter((pkg) => pkg.stage === "QUEUED" && !pkg.assigned);
      for (const pkg of waiting) {
        const available = robots
          .filter((robot) => robot.state === "IDLE" && robot.battery > 22)
          .sort((a, b) => a.group.position.distanceToSquared(PICKUPS[pkg.station]) - b.group.position.distanceToSquared(PICKUPS[pkg.station]));
        const robot = available[0];
        if (!robot) break;
        pkg.assigned = true;
        robot.package = pkg;
        robot.state = "TO_PICKUP";
        robot.path = createRoute(robot.group.position, PICKUPS[pkg.station], robot.id, ARM_OBSTACLES);
        robot.pathIndex = 0;
      }
    }

    function reserveHandoffSlot(robot: MobileRobot) {
      if (robot.handoffSlot >= 0) return robot.handoffSlot;
      const occupied = new Set(robots.filter((candidate) => candidate.handoffSlot >= 0).map((candidate) => candidate.handoffSlot));
      const slot = HANDOFF_QUEUE.findIndex((_, index) => !occupied.has(index));
      robot.handoffSlot = slot >= 0 ? slot : robot.id % HANDOFF_QUEUE.length;
      return robot.handoffSlot;
    }

    function coordinateHandoffQueue() {
      const reservedArms = new Set(robots
        .filter((robot) => robot.state === "TO_DROPOFF" || robot.state === "WAITING_ARM")
        .map((robot) => robot.assignedArm));
      const waiting = robots
        .filter((robot) => robot.state === "QUEUED_HANDOFF" && robot.package)
        .sort((a, b) => (a.package?.id ?? Infinity) - (b.package?.id ?? Infinity));
      for (const arm of assembly.arms) {
        if (arm.role !== "INFEED" || arm.state !== "IDLE" || reservedArms.has(arm.index)) continue;
        const nextRobot = waiting.shift();
        if (!nextRobot) break;
        nextRobot.assignedArm = arm.index;
        nextRobot.state = "TO_DROPOFF";
        nextRobot.path = createRoute(nextRobot.group.position, INFEED_STOPS[arm.index], nextRobot.id, ARM_OBSTACLES);
        nextRobot.pathIndex = 0;
        nextRobot.timer = 0;
        reservedArms.add(arm.index);
      }
    }

    function nearestCharger(robot: MobileRobot) {
      return CHARGERS[robot.id % CHARGERS.length];
    }

    function setChargingRoute(robot: MobileRobot) {
      robot.state = "CHARGING";
      robot.path = createRoute(robot.group.position, nearestCharger(robot), robot.id, ARM_OBSTACLES);
      robot.pathIndex = 0;
    }

    function updateRobot(robot: MobileRobot, dt: number, time: number) {
      robot.timer += dt;
      const previous = robot.group.position.clone();
      const target = robot.path[robot.pathIndex];
      if (target && robot.state !== "LOADING" && robot.state !== "WAITING_ARM") {
        const desired = target.clone().sub(robot.group.position);
        desired.y = 0;
        const distance = desired.length();
        if (distance < 0.7) {
          robot.pathIndex++;
        } else {
          desired.normalize();
          const avoidance = new THREE.Vector3();
          let speedFactor = 1;
          for (const other of robots) {
            if (other === robot) continue;
            const delta = robot.group.position.clone().sub(other.group.position);
            delta.y = 0;
            const separation = delta.length();
            if (separation < 7.5 && separation > 0.01) {
              const urgency = (7.5 - separation) / 7.5;
              avoidance.add(delta.normalize().multiplyScalar(urgency * urgency * 2.4));
              const otherHasPriority = other.state === "WAITING_ARM" || other.state === "TO_DROPOFF" || robot.id > other.id;
              if (separation < 5.2 && otherHasPriority) speedFactor = Math.min(speedFactor, separation < 4.1 ? 0.04 : 0.35);
            }
          }
          desired.add(avoidance).normalize();
          const cornerDistance = Math.min(distance, 6);
          const speed = (2.8 + cornerDistance * 0.55) * (robot.battery < 15 ? 0.65 : 1) * speedFactor;
          robot.velocity.lerp(desired.multiplyScalar(speed), 1 - Math.pow(0.025, dt));
          robot.group.position.addScaledVector(robot.velocity, dt);
          // Mirror createRoute's own endpoint exemption here: the final leg
          // into a docking point (arm grab stop, charger) is allowed to sit
          // inside an arm's obstacle ring by design, since that's the
          // intentional approach distance, not transit. Without this, a
          // single chokepoint arm (only one INFEED arm now, vs. the previous
          // three in parallel) can permanently strand a robot oscillating at
          // the obstacle boundary, deadlocking the whole line behind it.
          const isFinalApproach = robot.pathIndex === robot.path.length - 1;
          if (!isFinalApproach && isNavBlocked(robot.group.position.x, robot.group.position.z, 2.2, ARM_OBSTACLES)) {
            robot.group.position.copy(previous);
            robot.velocity.set(0, 0, 0);
          }
          robot.group.rotation.y = Math.atan2(robot.velocity.x, robot.velocity.z);
          robot.wheels.forEach((wheel) => { wheel.rotation.x += speed * dt * 1.7; });
          robot.distance += speed * dt;
          robot.battery = Math.max(0, robot.battery - dt * 0.12);
        }
      } else robot.velocity.multiplyScalar(Math.max(0, 1 - dt * 8));

      if (robot.pathIndex >= robot.path.length && robot.path.length) {
        robot.path = []; robot.pathIndex = 0; robot.timer = 0;
        if (robot.state === "TO_PICKUP") robot.state = "LOADING";
        else if (robot.state === "TO_STAGING") robot.state = "QUEUED_HANDOFF";
        else if (robot.state === "TO_DROPOFF") {
          robot.state = "WAITING_ARM";
          if (robot.package) robot.package.stage = "AT_INFEED";
        }
      }

      if (robot.state === "LOADING" && robot.timer > 0.75 && robot.package) {
        // Package origin rests at deck-top (1.525) minus its own bottom offset
        // (0.045). Spawn it already in contact rather than a hair above: the
        // robot starts driving toward INFEED_STOPS on this same transition, so
        // any real fall distance is a race against the kinematic deck moving
        // out from under it before gravity finishes settling the package.
        const deckDrop = robot.group.position.clone().add(new THREE.Vector3(0, 1.48, 0));
        createPackageBody(robot.package, deckDrop, robot.group.rotation.y);
        robot.package.stage = "ON_ROBOT";
        const handoffSlot = reserveHandoffSlot(robot);
        robot.state = "TO_STAGING";
        robot.path = createRoute(robot.group.position, HANDOFF_QUEUE[handoffSlot], robot.id, ARM_OBSTACLES);
        robot.pathIndex = 0; robot.timer = 0;
      } else if (robot.state === "CHARGING" && !robot.path.length) {
        robot.battery = Math.min(100, robot.battery + dt * 18);
        if (robot.battery >= 92) { robot.state = "IDLE"; robot.timer = 0; }
      } else if (robot.state === "IDLE" && robot.battery < 22) setChargingRoute(robot);

      robot.group.position.y = 0.04 + Math.sin(time * 5 + robot.id) * 0.015;
      robot.physicsBody.setNextKinematicTranslation(robot.group.position);
      robot.physicsBody.setNextKinematicRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), robot.group.rotation.y));
      robot.beacon.emissiveIntensity = robot.state === "CHARGING" ? 0.8 + Math.sin(time * 5) * 0.5 : 1.4 + Math.max(0, Math.sin(time * 4 + robot.id)) * 1.6;
      if (previous.distanceToSquared(robot.group.position) < 0.00001 && target) robot.velocity.multiplyScalar(0.5);
    }

    function finishRobotHandoff(robot: MobileRobot) {
      robot.package = null;
      robot.timer = 0;
      robot.handoffSlot = -1;
      robot.assignedArm = -1;
      if (robot.battery < 35) setChargingRoute(robot);
      else robot.state = "IDLE";
    }

    function updateArm(arm: RobotArm, dt: number) {
      arm.timer += dt;
      const infeedIndex = arm.index;

      if (arm.state === "IDLE" && arm.role === "INFEED") {
        const waitingRobot = robots.find((robot) =>
          robot.state === "WAITING_ARM" &&
          robot.assignedArm === arm.index &&
          robot.package?.stage === "AT_INFEED" &&
          robot.group.position.distanceTo(INFEED_STOPS[infeedIndex]) < 3.2
        );
        if (waitingRobot?.package) {
          arm.robot = waitingRobot;
          arm.package = waitingRobot.package;
          arm.package.stage = "ARM_LOADING";
          arm.state = "PICKING";
          arm.timer = 0;
          arm.transferCaptured = false;
          removePackageBody(arm.package);
        }
      }

      // Outfeed arm index 1/2/3 maps to station 0/1/2 (KINDS order): each arm
      // only ever claims packages of its own material class, and only once
      // they're passing through its reach window on the belt.
      if (arm.state === "IDLE" && arm.role === "OUTFEED") {
        const station = arm.index - 1;
        const candidate = packages.find((pkg) => {
          if (pkg.stage !== "ON_LOOP" || pkg.station !== station) return false;
          const pose = loopPosition(pkg.loopProgress).position;
          return Math.abs(pose.x - arm.group.position.x) < 4;
        });
        if (candidate) {
          candidate.stage = "ARM_UNLOADING";
          arm.package = candidate;
          arm.state = "PICKING";
          arm.timer = 0;
          arm.transferCaptured = false;
          removePackageBody(candidate);
        }
      }

      const pickingProgress = arm.state === "PICKING" ? Math.min(1, arm.timer / 2.4) : 0;
      const placingProgress = arm.state === "PLACING" ? Math.min(1, arm.timer / 2.2) : 0;
      const smoothPick = pickingProgress * pickingProgress * (3 - 2 * pickingProgress);
      const smoothPlace = placingProgress * placingProgress * (3 - 2 * placingProgress);

      // IDLE <-> GRAB sweep: GRAB is IK-solved (see ARM_GRAB_POSE) to reach the
      // real AMR deck point, IDLE is the cosmetic retracted rest pose.
      if (arm.state === "PICKING") {
        for (let i = 0; i < 4; i++) arm.poseChannels[i] = THREE.MathUtils.lerp(ARM_IDLE_POSE[i], ARM_GRAB_POSE[i], smoothPick);
      } else if (arm.state === "PLACING") {
        for (let i = 0; i < 4; i++) arm.poseChannels[i] = THREE.MathUtils.lerp(ARM_GRAB_POSE[i], ARM_IDLE_POSE[i], smoothPlace);
      } else {
        for (let i = 0; i < 4; i++) arm.poseChannels[i] = ARM_IDLE_POSE[i];
      }
      arm.shoulder.rotation.y = arm.poseChannels[0];
      arm.shoulder.rotation.z = arm.poseChannels[1];
      arm.elbow.rotation.z = arm.poseChannels[2];
      arm.wrist.rotation.z = arm.poseChannels[3];
      arm.wrist.rotation.y = 0;
      arm.group.updateMatrixWorld(true);

      if (arm.state === "PICKING" && arm.package) {
        const pkg = arm.package;
        if (pickingProgress >= 0.62 && !arm.transferCaptured) {
          pkg.mesh.getWorldPosition(arm.transferStart);
          arm.transferCaptured = true;
        }
        if (pickingProgress >= 0.62 && pkg.mesh.parent === scene) {
          const gripTarget = arm.gripper.localToWorld(new THREE.Vector3(0, -1.15, 0));
          const transfer = THREE.MathUtils.smoothstep(pickingProgress, 0.62, 0.98);
          pkg.mesh.position.lerpVectors(arm.transferStart, gripTarget, transfer);
          pkg.mesh.rotation.y = THREE.MathUtils.lerp(pkg.mesh.rotation.y, arm.group.rotation.y, transfer);
        }
        if (pickingProgress >= 1) {
          arm.gripper.attach(pkg.mesh);
          pkg.mesh.position.set(0, -1.15, 0);
          pkg.mesh.rotation.set(0, 0, 0);
          if (arm.robot) finishRobotHandoff(arm.robot);
          arm.state = "PLACING";
          arm.timer = 0;
        }
      }

      if (arm.state === "PLACING" && arm.package) {
        const pkg = arm.package;
        // INFEED always releases onto the belt at its fixed drop point.
        // OUTFEED always releases into its own material class's bin bay.
        const dropProgress = arm.role === "INFEED" ? armDropProgress(arm) : 0;
        const releaseYaw = arm.role === "INFEED" ? loopPosition(dropProgress).yaw : 0;
        const releaseTarget =
          arm.role === "INFEED"
            ? loopPosition(dropProgress).position.clone().setY(LOOP_TOP_Y + 0.05)
            : DROPS[pkg.station].clone().add(new THREE.Vector3(7 + (delivered % 4) * 2.2, 1.05, 0));
        if (placingProgress >= 0.68 && pkg.mesh.parent === arm.gripper) {
          pkg.mesh.getWorldPosition(arm.releaseStart);
          scene.attach(pkg.mesh);
        }
        if (placingProgress >= 0.68 && pkg.mesh.parent === scene) {
          const release = THREE.MathUtils.smoothstep(placingProgress, 0.68, 1);
          pkg.mesh.position.lerpVectors(arm.releaseStart, releaseTarget, release);
          pkg.mesh.rotation.y = THREE.MathUtils.lerp(pkg.mesh.rotation.y, releaseYaw, release);
        }
        if (placingProgress >= 1) {
          if (arm.role === "INFEED") {
            pkg.stage = "ON_LOOP";
            pkg.loopProgress = dropProgress;
            createPackageBody(pkg, releaseTarget, releaseYaw);
          } else {
            pkg.stage = "DELIVERED";
            pkg.delivered = true;
            pkg.mesh.position.copy(releaseTarget);
            pkg.mesh.rotation.set(0, 0, 0);
            delivered++;
          }
          arm.package = null;
          arm.robot = null;
          arm.state = "IDLE";
          arm.timer = 0;
        }
      }

      const closed = arm.package && arm.package.mesh.parent === arm.gripper;
      arm.fingers.forEach((finger, index) => {
        finger.position.x = (index === 0 ? -1 : 1) * (closed ? 1.34 : 1.72);
      });
      arm.payload.visible = false;
    }

      // Real dynamics only ever run during the brief settle window right after
      // a drop (see lockPackageToCarrier) — no per-step forcing is needed here,
      // gravity and contact alone are stable for that short a window. Forcing
      // a dynamic body's velocity every substep (as a previous version of this
      // did, to drag packages along the belt) fights the solver and can pump
      // energy in over many steps; locking the package once settled avoids
      // that entirely instead of trying to tune it away.
      function stepPhysics(dt: number) {
        if (dt <= 0) return;
        const subSteps = Math.max(1, Math.round(controlsRef.current.speed));
        physicsWorld.timestep = dt / subSteps;
        for (let i = 0; i < subSteps; i++) physicsWorld.step();
      }

      const clock = new THREE.Clock();
      const cameraTarget = new THREE.Vector3();
      const lookTarget = new THREE.Vector3();
      let hudTick = 0;
      const resize = () => {
        const width = mountEl.clientWidth || innerWidth;
        const height = mountEl.clientHeight || innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        localRenderer.setSize(width, height, false);
      };
      const localRo = new ResizeObserver(resize);
      localRo.observe(mountEl); resize();
      ro = localRo;

      function animate() {
        frame = requestAnimationFrame(animate);
        const rawDt = Math.min(clock.getDelta(), 0.045);
        if (!activeRef.current) return;
        const current = controlsRef.current;
        const dt = current.paused || !playing ? 0 : rawDt * current.speed;
        elapsed += dt;
        if (resetRef.current) { resetRef.current = false; reset(); }
        if (dt > 0) {
          nextSpawn -= dt;
          if (nextSpawn <= 0 && packages.filter((pkg) => !pkg.delivered).length < 10) {
            spawnPackage();
            nextSpawn = 1.2 + Math.random() * 0.7;
          }
          if (current.traffic) assignJobs();
          coordinateHandoffQueue();
          robots.forEach((robot) => updateRobot(robot, dt, elapsed));
          stepPhysics(dt);
          packages.forEach((pkg) => {
            if (pkg.stage !== "ON_ROBOT" && pkg.stage !== "ON_LOOP") return;
            if (!pkg.locked && pkg.body) {
              pkg.physicsTimer += dt;
              syncPackageMesh(pkg);
              if (pkg.physicsTimer > 0.3) lockPackageToCarrier(pkg);
            } else if (pkg.locked && pkg.stage === "ON_ROBOT" && pkg.lockedOffset) {
              const owner = robots.find((robot) => robot.package === pkg);
              if (owner) {
                pkg.mesh.position.copy(owner.group.localToWorld(pkg.lockedOffset.clone()));
                pkg.mesh.rotation.y = owner.group.rotation.y + pkg.lockedYaw;
              }
            }
          });
          packages.forEach((pkg) => {
            if (pkg.stage !== "ON_LOOP") return;
            pkg.loopProgress += dt * (LOOP_BELT_SPEED / LOOP_PERIMETER);
            if (pkg.loopProgress >= 1) {
              pkg.stage = "DELIVERED";
              pkg.delivered = true;
              removePackageBody(pkg);
              pkg.mesh.position.copy(DROPS[pkg.station]).add(new THREE.Vector3(7 + (delivered % 3) * 2.25, 1.05, 0));
              delivered++;
              return;
            }
            if (pkg.locked) {
              const pose = loopPosition(pkg.loopProgress);
              pkg.mesh.position.copy(pose.position).setY(LOOP_TOP_Y - 0.045);
              pkg.mesh.rotation.set(0, pose.yaw, 0);
            }
          });
          assembly.arms.forEach((arm) => updateArm(arm, dt));
        }

        routeLines.forEach((line, index) => {
          const robot = robots[index];
          line.visible = current.paths && robot.path.length > 0;
          if (line.visible) line.geometry.setFromPoints([robot.group.position.clone().setY(0.14), ...robot.path.slice(robot.pathIndex).map((point) => point.clone().setY(0.14))]);
        });

        const leader = robots.find((robot) => robot.state === "TO_DROPOFF") ?? robots[0];
        const operatingArm = assembly.arms.find((arm) => arm.state !== "IDLE");
        if (current.camera === "FOLLOW") {
          cameraTarget.copy(leader.group.position).add(new THREE.Vector3(13, 10, 15));
          lookTarget.copy(leader.group.position).add(new THREE.Vector3(4, 1, 0));
        } else if (current.camera === "FLOOR") {
          cameraTarget.set(-54, 8.5, 38);
          lookTarget.set(15, 2, 0);
        } else if (operatingArm?.role === "INFEED") {
          // Shoot from outside the conveyor loop (the arm sits just behind its
          // near corner) so the belt's edge never sits between the camera and
          // the arm's base — that framing reads as the arm clipping into the
          // belt even though there's 6+ units of real clearance between them.
          cameraTarget.copy(operatingArm.group.position).add(new THREE.Vector3(-13, 16, -11));
          lookTarget.copy(operatingArm.group.position).add(new THREE.Vector3(8, 2, 6));
        } else if (operatingArm) {
          // Outfeed arms sit at a fixed x with the belt to one side and their
          // bin bay to the other; bias the look direction toward the belt
          // (sign flips per row) so both the pick and the place read in frame.
          const beltDir = Math.sign(CONVEYOR_Z - operatingArm.group.position.z) || 1;
          cameraTarget.copy(operatingArm.group.position).add(new THREE.Vector3(-15, 16, -6 * beltDir));
          lookTarget.copy(operatingArm.group.position).add(new THREE.Vector3(9, 2, 4 * beltDir));
        } else {
          cameraTarget.set(40, 26, 40);
          lookTarget.set(-4, 3, -7);
        }
        camera.position.lerp(cameraTarget, 1 - Math.pow(0.003, rawDt));
        camera.lookAt(lookTarget);

        if (++hudTick % 10 === 0) {
          const queued = packages.filter((pkg) => pkg.stage === "QUEUED").length;
          const activeCount = robots.filter((robot) => robot.state !== "IDLE" && robot.state !== "CHARGING").length;
          const moving = robots.filter((robot) => robot.velocity.length() > 0.2).length;
          setTelemetry({ delivered, active: activeCount, queued, throughput: elapsed > 4 ? Math.round(delivered / elapsed * 60) : 0, efficiency: Math.round(92 + Math.min(7, moving * 0.45) - queued * 0.8) });
        }
        localRenderer.render(scene, camera);
      }
      animate();
      (window as any).__factoryDebug = () => ({
        robots: robots.map((r) => ({ id: r.id, state: r.state, pos: [r.group.position.x.toFixed(1), r.group.position.z.toFixed(1)], assignedArm: r.assignedArm, handoffSlot: r.handoffSlot, pkgStage: r.package?.stage })),
        arms: assembly.arms.map((a) => ({ index: a.index, role: a.role, state: a.state, pos: [a.group.position.x, a.group.position.z] })),
        packages: packages.map((p) => ({ id: p.id, stage: p.stage, station: p.station, loopProgress: p.loopProgress?.toFixed(2) })),
      });

      cleanupScene = () => {
        scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach((mat) => mat.dispose());
          else (mesh.material as THREE.Material | undefined)?.dispose();
        });
      };
    };
    setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      ro?.disconnect();
      cleanupScene?.();
      renderer?.dispose();
      if (renderer && mountEl.contains(renderer.domElement)) mountEl.removeChild(renderer.domElement);
      world?.free();
    };
  }, [playing]);

  return (
    <div ref={mountRef} className="absolute inset-0 h-full w-full" role="img" aria-label="Interactive coordinated multi-robot factory sorting simulation">
      <FactoryHUD controls={controls} telemetry={telemetry} onChange={setControls} onReset={() => { resetRef.current = true; }} />
      {!playing && <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm"><button className="rounded-lg border border-cyan-300/70 bg-cyan-300 px-8 py-4 text-lg font-semibold text-slate-950 shadow-[0_0_42px_rgba(34,211,238,0.35)] transition hover:bg-cyan-200" onClick={() => setPlaying(true)}>Launch Factory Fleet</button></div>}
    </div>
  );
}
