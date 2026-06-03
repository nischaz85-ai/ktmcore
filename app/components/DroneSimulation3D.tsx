"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const MAX_PIXEL_RATIO = 2;
const WORLD_LIMIT = 42;

type SceneMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.Material | THREE.Material[]
>;

interface DroneRig {
  group: THREE.Group;
  rotors: THREE.Mesh[];
  phase: number;
  radius: number;
  speed: number;
  altitude: number;
}

interface WorldObstacle {
  position: THREE.Vector3;
  radius: number;
}

function createMaterial(color: number, roughness = 0.65, metalness = 0.15) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
  });
}

function createRover() {
  const rover = new THREE.Group();
  const bodyMaterial = createMaterial(0x12303c, 0.5, 0.35);
  const accentMaterial = createMaterial(0x00c8ff, 0.35, 0.2);
  const tireMaterial = createMaterial(0x080b0f, 0.9, 0.1);

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 4), bodyMaterial);
  body.position.y = 0.75;
  body.castShadow = true;
  rover.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.55, 1.55), accentMaterial);
  cabin.position.set(0, 1.15, -0.45);
  cabin.castShadow = true;
  rover.add(cabin);

  const sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 24), accentMaterial);
  sensor.position.set(0, 1.62, -0.45);
  sensor.castShadow = true;
  rover.add(sensor);

  const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.45, 24);
  const wheels: THREE.Mesh[] = [];
  [
    [-1.45, 0.43, -1.35],
    [1.45, 0.43, -1.35],
    [-1.45, 0.43, 1.35],
    [1.45, 0.43, 1.35],
  ].forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI / 2;
    wheel.castShadow = true;
    wheels.push(wheel);
    rover.add(wheel);
  });

  const headlightGeometry = new THREE.SphereGeometry(0.12, 16, 16);
  [-0.68, 0.68].forEach((x) => {
    const light = new THREE.Mesh(headlightGeometry, accentMaterial);
    light.position.set(x, 0.92, -2.04);
    rover.add(light);
  });

  return { rover, wheels };
}

function createDrone() {
  const group = new THREE.Group();
  const bodyMaterial = createMaterial(0x0d2630, 0.45, 0.3);
  const glowMaterial = createMaterial(0x00d7ff, 0.35, 0.2);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 16), bodyMaterial);
  body.scale.set(1.2, 0.45, 1.2);
  body.castShadow = true;
  group.add(body);

  const armGeometry = new THREE.BoxGeometry(2.35, 0.08, 0.08);
  const armX = new THREE.Mesh(armGeometry, bodyMaterial);
  const armZ = armX.clone();
  armZ.rotation.y = Math.PI / 2;
  group.add(armX, armZ);

  const rotors: THREE.Mesh[] = [];
  const rotorGeometry = new THREE.BoxGeometry(0.85, 0.025, 0.08);
  [
    [-1.18, 0, 0],
    [1.18, 0, 0],
    [0, 0, -1.18],
    [0, 0, 1.18],
  ].forEach(([x, y, z], index) => {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16), glowMaterial);
    hub.position.set(x, y, z);
    hub.castShadow = true;

    const rotor = new THREE.Mesh(rotorGeometry, glowMaterial);
    rotor.position.set(x, y + 0.08, z);
    rotor.rotation.y = index > 1 ? Math.PI / 2 : 0;
    rotors.push(rotor);
    group.add(hub, rotor);
  });

  return { group, rotors };
}

function createHouse(width: number, depth: number, height: number) {
  const house = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    createMaterial(0x28343a, 0.78, 0.04)
  );
  wall.position.y = height / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.74, height * 0.55, 4),
    createMaterial(0x3d2a24, 0.7, 0.05)
  );
  roof.position.y = height + height * 0.28;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;

  house.add(wall, roof);
  return house;
}

function createTree(height: number) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.28, height * 0.42, 10),
    createMaterial(0x3a2518, 0.85, 0.02)
  );
  trunk.position.y = height * 0.21;
  trunk.castShadow = true;

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(height * 0.42, height * 0.78, 12),
    createMaterial(0x174026, 0.78, 0.02)
  );
  canopy.position.y = height * 0.78;
  canopy.castShadow = true;

  tree.add(trunk, canopy);
  return tree;
}

function createRoadLine(z: number, material: THREE.Material) {
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 3.2), material);
  dash.rotation.x = -Math.PI / 2;
  dash.position.set(0, 0.045, z);
  return dash;
}

function findAvoidanceForce(position: THREE.Vector3, obstacles: WorldObstacle[], clearance: number) {
  const force = new THREE.Vector3();

  obstacles.forEach((obstacle) => {
    const offset = position.clone().sub(obstacle.position);
    offset.y = 0;
    const distance = Math.max(offset.length(), 0.001);
    const influence = obstacle.radius + clearance;

    if (distance < influence) {
      force.addScaledVector(offset.normalize(), (influence - distance) / influence);
    }
  });

  return force;
}

function resolveRoverCollision(position: THREE.Vector3, obstacles: WorldObstacle[], radius: number) {
  const correction = new THREE.Vector3();

  obstacles.forEach((obstacle) => {
    const offset = position.clone().sub(obstacle.position);
    offset.y = 0;
    const distance = Math.max(offset.length(), 0.001);
    const minimumDistance = obstacle.radius + radius;

    if (distance < minimumDistance) {
      correction.addScaledVector(offset.normalize(), minimumDistance - distance);
    }
  });

  return correction;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as SceneMesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material?.dispose());
  });
}

export default function DroneSimulation3D() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const keys = new Set<string>();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020508);
    scene.fog = new THREE.Fog(0x020508, 34, 92);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 180);
    camera.position.set(0, 8, 13);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0x8feaff, 0x061018, 1.8);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-18, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const groundMaterial = createMaterial(0x0b1710, 0.86, 0.04);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const roadMaterial = createMaterial(0x171b1f, 0.9, 0.02);
    const shoulderMaterial = createMaterial(0x27301f, 0.82, 0.02);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 104), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.025;
    road.receiveShadow = true;
    scene.add(road);

    [-8.4, 8.4].forEach((x) => {
      const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 104), shoulderMaterial);
      shoulder.rotation.x = -Math.PI / 2;
      shoulder.position.set(x, 0.03, 0);
      shoulder.receiveShadow = true;
      scene.add(shoulder);
    });

    const laneMaterial = createMaterial(0xd8d2b3, 0.55, 0);
    for (let z = -49; z < 51; z += 8) {
      scene.add(createRoadLine(z, laneMaterial));
    }

    const edgeMaterial = createMaterial(0xb9c8c8, 0.5, 0);
    [-5.9, 5.9].forEach((x) => {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 102), edgeMaterial);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x, 0.04, 0);
      scene.add(edge);
    });

    const obstacles: WorldObstacle[] = [];
    const addObstacle = (object: THREE.Object3D, position: THREE.Vector3, radius: number) => {
      object.position.copy(position);
      scene.add(object);
      obstacles.push({ position: position.clone(), radius });
    };

    [
      [-18, -30, 3.2, 4.2, 3],
      [17, -16, 4.3, 4.8, 3.7],
      [-18, 4, 3.8, 4.4, 3.2],
      [18, 24, 4.8, 4.2, 3.5],
    ].forEach(([x, z, width, depth, height]) => {
      addObstacle(createHouse(width, depth, height), new THREE.Vector3(x, 0, z), Math.max(width, depth) * 0.7);
    });

    [
      [-9.2, -22, 3.5],
      [10, -8, 4.4],
      [-12, 17, 4.1],
      [13, 34, 4.8],
      [-24, 32, 5.2],
      [25, -32, 4.6],
    ].forEach(([x, z, height]) => {
      addObstacle(createTree(height), new THREE.Vector3(x, 0, z), 1.3);
    });

    const rockMaterial = createMaterial(0x4b5048, 0.9, 0.02);
    [
      [-2.8, -10, 1.2],
      [3.2, 13, 1.5],
      [-4.2, 31, 1.1],
    ].forEach(([x, z, radius]) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), rockMaterial);
      rock.position.y = radius * 0.45;
      rock.scale.y = 0.55;
      rock.castShadow = true;
      rock.receiveShadow = true;
      addObstacle(rock, new THREE.Vector3(x, 0, z), radius + 0.9);
    });

    const logMaterial = createMaterial(0x3d2b1d, 0.82, 0.02);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 4.5, 14), logMaterial);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.45;
    log.position.y = 0.45;
    log.castShadow = true;
    addObstacle(log, new THREE.Vector3(2.1, 0, -27), 2.7);

    const scanMaterial = new THREE.LineBasicMaterial({
      color: 0x00e0ff,
      transparent: true,
      opacity: 0.42,
    });
    const scanLines = Array.from({ length: 7 }, () => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]), scanMaterial);
      scene.add(line);
      return line;
    });

    const { rover, wheels } = createRover();
    rover.position.set(0, 0, 38);
    scene.add(rover);

    const drones: DroneRig[] = [];
    for (let i = 0; i < 5; i++) {
      const drone = createDrone();
      const rig: DroneRig = {
        group: drone.group,
        rotors: drone.rotors,
        phase: (i / 5) * Math.PI * 2,
        radius: 9 + i * 4.2,
        speed: 0.35 + i * 0.08,
        altitude: 4.5 + (i % 3) * 1.3,
      };
      drone.group.position.set(Math.sin(rig.phase) * rig.radius, rig.altitude, Math.cos(rig.phase) * rig.radius);
      drones.push(rig);
      scene.add(drone.group);
    }

    const onKeyDown = (event: KeyboardEvent) => {
      keys.add(event.key.toLowerCase());
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let speed = 0;
    let steering = 0;
    let frameId = 0;
    const clock = new THREE.Clock();
    const cameraTarget = new THREE.Vector3();
    const cameraOffset = new THREE.Vector3();

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.04);
      const elapsed = clock.elapsedTime;

      const forward = keys.has("w") || keys.has("arrowup");
      const back = keys.has("s") || keys.has("arrowdown");
      const left = keys.has("a") || keys.has("arrowleft");
      const right = keys.has("d") || keys.has("arrowright");

      const acceleration = (forward ? 1 : 0) - (back ? 0.72 : 0);
      speed += acceleration * delta * 28;
      speed *= 0.965;
      speed = THREE.MathUtils.clamp(speed, -10, 20);

      const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
      steering = THREE.MathUtils.lerp(steering, steerTarget, delta * 7);
      rover.rotation.y += steering * speed * delta * 0.13;

      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(rover.quaternion);
      rover.position.addScaledVector(direction, speed * delta);
      const collisionCorrection = resolveRoverCollision(rover.position, obstacles, 1.65);
      if (collisionCorrection.lengthSq() > 0) {
        rover.position.add(collisionCorrection);
        speed *= -0.28;
      }
      rover.position.x = THREE.MathUtils.clamp(rover.position.x, -4.8, 4.8);
      rover.position.x = THREE.MathUtils.clamp(rover.position.x, -WORLD_LIMIT, WORLD_LIMIT);
      rover.position.z = THREE.MathUtils.clamp(rover.position.z, -WORLD_LIMIT, WORLD_LIMIT);
      rover.position.y = Math.sin(elapsed * 4 + rover.position.x * 0.12) * 0.035;

      wheels.forEach((wheel) => {
        wheel.rotation.x += speed * delta * 2.6;
      });

      drones.forEach((drone, index) => {
        const phase = elapsed * drone.speed + drone.phase;
        const patrolZ = ((elapsed * 5.8 + index * 18) % 92) - 46;
        const side = index % 2 === 0 ? 1 : -1;
        const target = new THREE.Vector3(
          side * (2.6 + Math.sin(phase) * 3.2),
          drone.altitude + Math.sin(elapsed * 2 + index) * 0.5,
          patrolZ
        );
        if (index === 0) {
          target.set(
            rover.position.x + Math.sin(phase) * 5,
            drone.altitude,
            rover.position.z + Math.cos(phase) * 5
          );
        }
        const droneAvoidance = findAvoidanceForce(target, obstacles, 5.8);
        target.addScaledVector(droneAvoidance, 7.5);
        drone.group.position.lerp(target, 1 - Math.pow(0.015, delta));
        drone.group.position.y = drone.altitude + Math.sin(elapsed * 2 + index) * 0.5;
        drone.group.lookAt(rover.position.x, drone.group.position.y, rover.position.z);
        drone.rotors.forEach((rotor, rotorIndex) => {
          rotor.rotation.y += delta * (18 + rotorIndex * 2);
        });
      });

      const nearest = obstacles
        .map((obstacle) => ({
          obstacle,
          distance: obstacle.position.distanceTo(rover.position),
        }))
        .filter(({ distance }) => distance < 18)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, scanLines.length);

      scanLines.forEach((line, index) => {
        const hit = nearest[index];
        const geometry = line.geometry as THREE.BufferGeometry;
        const start = rover.position.clone().add(new THREE.Vector3(0, 1.55, 0));
        const end = hit
          ? hit.obstacle.position.clone().add(new THREE.Vector3(0, 1.2, 0))
          : start.clone();
        geometry.setFromPoints([start, end]);
        line.visible = Boolean(hit);
      });

      cameraOffset.set(0, 6.5, 12.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), rover.rotation.y);
      cameraTarget.copy(rover.position).add(cameraOffset);
      camera.position.lerp(cameraTarget, 1 - Math.pow(0.001, delta));
      camera.lookAt(rover.position.x, rover.position.y + 1.3, rover.position.z);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      resizeObserver.disconnect();
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement && mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-label="Interactive autonomous systems WebGL scene"
      className="absolute inset-0 h-full w-full"
      role="img"
    />
  );
}
