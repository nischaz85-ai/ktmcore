"use client";

import { useEffect, useRef } from "react";

type DroneType = "quadcopter" | "hexacopter" | "tricopter" | "helicopter" | "fixedwing" | "vtol";
type FlightMode = "patrol" | "orbit" | "survey" | "transit" | "loiter" | "formation";

interface Waypoint {
  x: number;
  y: number;
}

interface Drone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  targetHeading: number;
  rotorAngle: number;
  rotorSpeed: number;
  size: number;
  altitude: number;
  bobOffset: number;
  lightPhase: number;
  type: DroneType;
  flightMode: FlightMode;
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  orbitCenter?: { x: number; y: number };
  orbitRadius?: number;
  orbitAngle?: number;
  orbitDirection?: number;
  speed: number;
  formationLeader?: number;
  formationOffset?: { x: number; y: number };
  loiterTime?: number;
  surveyProgress?: number;
  tailRotorAngle?: number;
  propAngle?: number;
}

export default function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const dronesRef = useRef<Drone[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      mouseRef.current.x = canvas.width / 2;
      mouseRef.current.y = canvas.height / 2;
    };

    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    // Professional muted color
    const droneColor = {
      primary: "#1a2332",
      secondary: "#2a3444",
      accent: "#4a90a4",
      glow: "#5ba3b8"
    };

    const droneTypes: DroneType[] = ["quadcopter", "quadcopter", "quadcopter", "hexacopter", "hexacopter", "tricopter", "fixedwing", "fixedwing", "vtol", "helicopter"];

    // Generate patrol waypoints (rectangular or circular paths)
    const generatePatrolWaypoints = (cx: number, cy: number, size: number): Waypoint[] => {
      const pattern = Math.random();
      if (pattern < 0.5) {
        // Rectangular patrol
        const w = size * (0.8 + Math.random() * 0.4);
        const h = size * (0.6 + Math.random() * 0.4);
        return [
          { x: cx - w/2, y: cy - h/2 },
          { x: cx + w/2, y: cy - h/2 },
          { x: cx + w/2, y: cy + h/2 },
          { x: cx - w/2, y: cy + h/2 },
        ];
      } else {
        // Triangular or pentagonal patrol
        const points = Math.random() < 0.5 ? 3 : 5;
        const waypoints: Waypoint[] = [];
        for (let i = 0; i < points; i++) {
          const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
          waypoints.push({
            x: cx + Math.cos(angle) * size,
            y: cy + Math.sin(angle) * size,
          });
        }
        return waypoints;
      }
    };

    // Generate survey waypoints (back and forth lawn mower pattern)
    const generateSurveyWaypoints = (cx: number, cy: number, w: number, h: number): Waypoint[] => {
      const waypoints: Waypoint[] = [];
      const rows = 4 + Math.floor(Math.random() * 3);
      const rowHeight = h / rows;
      
      for (let i = 0; i < rows; i++) {
        const y = cy - h/2 + rowHeight * i + rowHeight/2;
        if (i % 2 === 0) {
          waypoints.push({ x: cx - w/2, y });
          waypoints.push({ x: cx + w/2, y });
        } else {
          waypoints.push({ x: cx + w/2, y });
          waypoints.push({ x: cx - w/2, y });
        }
      }
      return waypoints;
    };

    // Exactly 2 of each type = 12 drones
    const droneCount = 12;
    const drones: Drone[] = [];
    
    // Create different flight groups
    const margin = 80;
    const usableWidth = canvas.width - margin * 2;
    const usableHeight = canvas.height - margin * 2;

    // Spawn positions around the edges/corners
    const spawnPositions = [
      // Corners
      { x: margin, y: margin },
      { x: canvas.width - margin, y: margin },
      { x: margin, y: canvas.height - margin },
      { x: canvas.width - margin, y: canvas.height - margin },
      // Edge midpoints
      { x: canvas.width / 2, y: margin },
      { x: canvas.width / 2, y: canvas.height - margin },
      { x: margin, y: canvas.height / 2 },
      { x: canvas.width - margin, y: canvas.height / 2 },
      // Quarter points on edges
      { x: canvas.width * 0.25, y: margin },
      { x: canvas.width * 0.75, y: margin },
      { x: canvas.width * 0.25, y: canvas.height - margin },
      { x: canvas.width * 0.75, y: canvas.height - margin },
    ];

    // 2 of each type in order
    const droneTypesList: DroneType[] = [
      "quadcopter", "quadcopter",
      "hexacopter", "hexacopter", 
      "tricopter", "tricopter",
      "helicopter", "helicopter",
      "fixedwing", "fixedwing",
      "vtol", "vtol"
    ];

    for (let i = 0; i < droneCount; i++) {
      const type = droneTypesList[i];
      const flightModes: FlightMode[] = ["patrol", "patrol", "orbit", "survey", "transit", "loiter"];
      let flightMode = flightModes[Math.floor(Math.random() * flightModes.length)];
      
      // Fixed wings should mostly transit or survey, not loiter
      if (type === "fixedwing") {
        flightMode = Math.random() < 0.5 ? "transit" : "survey";
      }
      
      // Helicopters are good for orbit/loiter
      if (type === "helicopter" && Math.random() < 0.4) {
        flightMode = "orbit";
      }

      // Use spawn positions from edges/corners
      const spawnPos = spawnPositions[i % spawnPositions.length];
      const startX = spawnPos.x + (Math.random() - 0.5) * 40;
      const startY = spawnPos.y + (Math.random() - 0.5) * 40;
      
      const drone: Drone = {
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        heading: Math.random() * Math.PI * 2,
        targetHeading: 0,
        rotorAngle: Math.random() * Math.PI * 2,
        rotorSpeed: 0.12 + Math.random() * 0.08,
        size: 28 + Math.random() * 14, // Much bigger: 28-42 instead of 14-20
        altitude: 0.8 + Math.random() * 0.2,
        bobOffset: Math.random() * Math.PI * 2,
        lightPhase: Math.random() * Math.PI * 2,
        type,
        flightMode,
        waypoints: [],
        currentWaypointIndex: 0,
        speed: type === "fixedwing" ? 1.2 + Math.random() * 0.4 : 0.5 + Math.random() * 0.3,
        tailRotorAngle: Math.random() * Math.PI * 2,
        propAngle: Math.random() * Math.PI * 2,
      };

      // Set up flight mode specific parameters
      switch (flightMode) {
        case "patrol":
          const patrolSize = 80 + Math.random() * 120;
          drone.waypoints = generatePatrolWaypoints(startX, startY, patrolSize);
          break;
          
        case "orbit":
          drone.orbitCenter = {
            x: margin + Math.random() * usableWidth,
            y: margin + Math.random() * usableHeight,
          };
          drone.orbitRadius = 60 + Math.random() * 100;
          drone.orbitAngle = Math.random() * Math.PI * 2;
          drone.orbitDirection = Math.random() < 0.5 ? 1 : -1;
          drone.x = drone.orbitCenter.x + Math.cos(drone.orbitAngle) * drone.orbitRadius;
          drone.y = drone.orbitCenter.y + Math.sin(drone.orbitAngle) * drone.orbitRadius;
          break;
          
        case "survey":
          const surveyW = 100 + Math.random() * 150;
          const surveyH = 80 + Math.random() * 100;
          drone.waypoints = generateSurveyWaypoints(
            margin + surveyW/2 + Math.random() * (usableWidth - surveyW),
            margin + surveyH/2 + Math.random() * (usableHeight - surveyH),
            surveyW, surveyH
          );
          drone.surveyProgress = 0;
          break;
          
        case "transit":
          // Long distance point to point
          const transitPoints = 2 + Math.floor(Math.random() * 3);
          drone.waypoints = [];
          for (let j = 0; j < transitPoints; j++) {
            drone.waypoints.push({
              x: margin + Math.random() * usableWidth,
              y: margin + Math.random() * usableHeight,
            });
          }
          break;
          
        case "loiter":
          drone.loiterTime = 0;
          drone.orbitCenter = { x: startX, y: startY };
          drone.orbitRadius = 20 + Math.random() * 30;
          drone.orbitAngle = Math.random() * Math.PI * 2;
          drone.orbitDirection = Math.random() < 0.5 ? 1 : -1;
          break;
      }

      drones.push(drone);
    }

    // Add a formation group (3-5 drones following a leader)
    const formationSize = 3 + Math.floor(Math.random() * 3);
    const leaderIndex = drones.length - formationSize;
    if (leaderIndex >= 0) {
      const leader = drones[leaderIndex];
      leader.flightMode = "patrol";
      leader.waypoints = generatePatrolWaypoints(
        canvas.width / 2,
        canvas.height / 2,
        150 + Math.random() * 100
      );
      leader.speed = 0.6;
      
      const formationOffsets = [
        { x: -40, y: 30 },
        { x: 40, y: 30 },
        { x: -60, y: 60 },
        { x: 60, y: 60 },
        { x: 0, y: 70 },
      ];
      
      for (let i = 1; i < formationSize && leaderIndex + i < drones.length; i++) {
        const follower = drones[leaderIndex + i];
        follower.flightMode = "formation";
        follower.formationLeader = leaderIndex;
        follower.formationOffset = formationOffsets[i - 1];
        follower.type = leader.type; // Same type in formation
        follower.speed = leader.speed;
      }
    }

    dronesRef.current = drones;

    let time = 0;

    // Update drone position based on flight mode
    const updateDroneMotion = (drone: Drone, index: number, dt: number) => {
      let targetX = drone.x;
      let targetY = drone.y;
      let useMouseAttraction = false;
      
      // Check for mouse interaction - only affect 2 closest drones
      if (mouseRef.current.active) {
        // Calculate distances of all drones to mouse
        const droneDistances = dronesRef.current.map((d, i) => ({
          index: i,
          dist: Math.sqrt(
            Math.pow(mouseRef.current.x - d.x, 2) + 
            Math.pow(mouseRef.current.y - d.y, 2)
          )
        }));
        
        // Sort by distance and get the 2 closest
        droneDistances.sort((a, b) => a.dist - b.dist);
        const closestTwo = droneDistances.slice(0, 2).map(d => d.index);
        
        // Only interact if this drone is one of the 2 closest
        if (closestTwo.includes(index)) {
          const dx = mouseRef.current.x - drone.x;
          const dy = mouseRef.current.y - drone.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          // Strong attraction within range
          if (dist < 350) {
            useMouseAttraction = true;
            const influence = (1 - dist / 350);
            
            if (dist > 100) {
              // Move towards cursor
              targetX = drone.x + dx * influence * 0.6;
              targetY = drone.y + dy * influence * 0.6;
            } else {
              // Orbit around cursor when very close
              const orbitAngle = Math.atan2(dy, dx) + 0.025;
              targetX = mouseRef.current.x - Math.cos(orbitAngle) * 120;
              targetY = mouseRef.current.y - Math.sin(orbitAngle) * 120;
            }
          }
        }
      }
      
      // If no mouse attraction, use normal flight patterns
      if (!useMouseAttraction) {
        switch (drone.flightMode) {
          case "patrol":
          case "transit":
          case "survey":
            if (drone.waypoints.length > 0) {
              const wp = drone.waypoints[drone.currentWaypointIndex];
              targetX = wp.x;
              targetY = wp.y;
              
              const dx = wp.x - drone.x;
              const dy = wp.y - drone.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              
              // Reached waypoint
              if (dist < 15) {
                drone.currentWaypointIndex = (drone.currentWaypointIndex + 1) % drone.waypoints.length;
              }
            }
            break;
            
          case "orbit":
            if (drone.orbitCenter && drone.orbitRadius !== undefined && drone.orbitAngle !== undefined) {
              // Smooth orbit
              const orbitSpeed = drone.speed / drone.orbitRadius;
              drone.orbitAngle += orbitSpeed * (drone.orbitDirection || 1) * dt * 60;
              
              targetX = drone.orbitCenter.x + Math.cos(drone.orbitAngle) * drone.orbitRadius;
              targetY = drone.orbitCenter.y + Math.sin(drone.orbitAngle) * drone.orbitRadius;
            }
            break;
            
          case "loiter":
            if (drone.orbitCenter && drone.orbitRadius !== undefined && drone.orbitAngle !== undefined) {
              // Slow lazy orbit for loitering
              const loiterSpeed = 0.3 / drone.orbitRadius;
              drone.orbitAngle += loiterSpeed * (drone.orbitDirection || 1) * dt * 60;
              
              targetX = drone.orbitCenter.x + Math.cos(drone.orbitAngle) * drone.orbitRadius;
              targetY = drone.orbitCenter.y + Math.sin(drone.orbitAngle) * drone.orbitRadius;
              
              // Occasionally shift loiter position
              drone.loiterTime = (drone.loiterTime || 0) + dt;
              if (drone.loiterTime > 10 + Math.random() * 10) {
                drone.loiterTime = 0;
                drone.orbitCenter = {
                  x: Math.max(100, Math.min(canvas.width - 100, drone.orbitCenter.x + (Math.random() - 0.5) * 100)),
                  y: Math.max(100, Math.min(canvas.height - 100, drone.orbitCenter.y + (Math.random() - 0.5) * 100)),
                };
              }
            }
            break;
            
          case "formation":
            if (drone.formationLeader !== undefined && drone.formationOffset) {
              const leader = dronesRef.current[drone.formationLeader];
              if (leader) {
                // Calculate formation position relative to leader's heading
                const cos = Math.cos(leader.heading);
                const sin = Math.sin(leader.heading);
                targetX = leader.x + drone.formationOffset.x * cos - drone.formationOffset.y * sin;
                targetY = leader.y + drone.formationOffset.x * sin + drone.formationOffset.y * cos;
              }
            }
            break;
        }
      }

      // Calculate desired velocity
      const dx = targetX - drone.x;
      const dy = targetY - drone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      let desiredVx = 0;
      let desiredVy = 0;
      
      if (dist > 1) {
        // Normalize and apply speed
        const speed = drone.speed;
        desiredVx = (dx / dist) * speed;
        desiredVy = (dy / dist) * speed;
      }
      
      // Collision avoidance - much stronger and larger radius
      const avoidanceRadius = 150;
      const avoidanceStrength = 2.5;
      let avoidX = 0;
      let avoidY = 0;
      
      dronesRef.current.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        
        const dx = drone.x - other.x;
        const dy = drone.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < avoidanceRadius && dist > 0) {
          // Much stronger repulsion when closer - exponential falloff
          const force = Math.pow(1 - dist / avoidanceRadius, 2) * avoidanceStrength;
          avoidX += (dx / dist) * force;
          avoidY += (dy / dist) * force;
        }
      });
      
      // Combine desired velocity with avoidance
      desiredVx += avoidX;
      desiredVy += avoidY;
      
      // Smooth acceleration (different for different aircraft)
      const accel = drone.type === "fixedwing" ? 0.02 : 0.04;
      drone.vx += (desiredVx - drone.vx) * accel;
      drone.vy += (desiredVy - drone.vy) * accel;

      // Apply velocity
      drone.x += drone.vx;
      drone.y += drone.vy;

      // Calculate and smooth heading - heading is where the nose points
      const currentSpeed = Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy);
      if (currentSpeed > 0.05) {
        // atan2(vy, vx) gives angle from positive X axis, we want nose to point in velocity direction
        drone.targetHeading = Math.atan2(drone.vy, drone.vx);
        
        // Smooth heading change (fixed wings turn slower)
        let headingDiff = drone.targetHeading - drone.heading;
        while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
        while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
        
        const turnRate = drone.type === "fixedwing" ? 0.03 : 0.08;
        drone.heading += headingDiff * turnRate;
      }

      // Keep in bounds with smooth turning
      const boundaryMargin = 50;
      if (drone.x < boundaryMargin) drone.vx += 0.05;
      if (drone.x > canvas.width - boundaryMargin) drone.vx -= 0.05;
      if (drone.y < boundaryMargin) drone.vy += 0.05;
      if (drone.y > canvas.height - boundaryMargin) drone.vy -= 0.05;

      // Update rotors
      drone.rotorAngle += drone.rotorSpeed * (0.8 + currentSpeed * 0.5);
      if (drone.tailRotorAngle !== undefined) {
        drone.tailRotorAngle += drone.rotorSpeed * 1.2;
      }
      if (drone.propAngle !== undefined) {
        drone.propAngle += drone.rotorSpeed * (1 + currentSpeed);
      }
    };

    // Draw functions - all drones face RIGHT (positive X) at heading 0
    const drawQuadcopter = (drone: Drone, t: number) => {
      const { size, rotorAngle } = drone;
      const armLength = size * 0.7;

      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(2, 2, size * 0.8, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Arms in + configuration (not X) so front is clear
      ctx.strokeStyle = droneColor.secondary;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -armLength);
      ctx.lineTo(0, armLength);
      ctx.moveTo(-armLength, 0);
      ctx.lineTo(armLength * 0.6, 0); // Front arm shorter
      ctx.stroke();

      const motors = [
        { x: 0, y: -armLength },
        { x: 0, y: armLength },
        { x: -armLength, y: 0 },
        { x: armLength * 0.6, y: 0 },
      ];

      motors.forEach((m, i) => {
        ctx.fillStyle = `${droneColor.accent}10`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, size * 0.38, 0, Math.PI * 2);
        ctx.fill();

        const phase = rotorAngle + (i % 2 === 0 ? 0 : Math.PI / 4);
        ctx.strokeStyle = `${droneColor.accent}55`;
        ctx.lineWidth = 1.5;
        for (let b = 0; b < 2; b++) {
          const angle = phase + b * Math.PI;
          ctx.beginPath();
          ctx.moveTo(m.x - Math.cos(angle) * size * 0.32, m.y - Math.sin(angle) * size * 0.32);
          ctx.lineTo(m.x + Math.cos(angle) * size * 0.32, m.y + Math.sin(angle) * size * 0.32);
          ctx.stroke();
        }

        ctx.fillStyle = droneColor.primary;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Body
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.22, size * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `${droneColor.accent}44`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Nose indicator (points RIGHT)
      ctx.fillStyle = `${droneColor.accent}77`;
      ctx.beginPath();
      ctx.moveTo(size * 0.35, 0);
      ctx.lineTo(size * 0.2, -size * 0.08);
      ctx.lineTo(size * 0.2, size * 0.08);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = Math.sin(t * 4 + drone.lightPhase) > 0.5 ? droneColor.glow : `${droneColor.accent}33`;
      ctx.beginPath();
      ctx.arc(0, -size * 0.15, 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawHexacopter = (drone: Drone, t: number) => {
      const { size, rotorAngle } = drone;
      const armLength = size * 0.8;

      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.arc(2, 2, size * 0.9, 0, Math.PI * 2);
      ctx.fill();

      const motorCount = 6;
      const motors: { x: number; y: number }[] = [];

      for (let i = 0; i < motorCount; i++) {
        const angle = (i / motorCount) * Math.PI * 2; // Start from right (0 degrees)
        const mx = Math.cos(angle) * armLength;
        const my = Math.sin(angle) * armLength;
        motors.push({ x: mx, y: my });

        ctx.strokeStyle = droneColor.secondary;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(mx, my);
        ctx.stroke();
      }

      motors.forEach((m, i) => {
        ctx.fillStyle = `${droneColor.accent}08`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, size * 0.3, 0, Math.PI * 2);
        ctx.fill();

        const phase = rotorAngle + (i % 2 === 0 ? 0 : Math.PI / 6);
        ctx.strokeStyle = `${droneColor.accent}44`;
        ctx.lineWidth = 1.5;
        for (let b = 0; b < 2; b++) {
          const angle = phase + b * Math.PI;
          ctx.beginPath();
          ctx.moveTo(m.x - Math.cos(angle) * size * 0.28, m.y - Math.sin(angle) * size * 0.28);
          ctx.lineTo(m.x + Math.cos(angle) * size * 0.28, m.y + Math.sin(angle) * size * 0.28);
          ctx.stroke();
        }

        ctx.fillStyle = droneColor.primary;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const px = Math.cos(angle) * size * 0.2;
        const py = Math.sin(angle) * size * 0.2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Direction arrow pointing RIGHT
      ctx.fillStyle = `${droneColor.accent}66`;
      ctx.beginPath();
      ctx.moveTo(size * 0.32, 0);
      ctx.lineTo(size * 0.18, -size * 0.08);
      ctx.lineTo(size * 0.18, size * 0.08);
      ctx.closePath();
      ctx.fill();
    };

    const drawTricopter = (drone: Drone, t: number) => {
      const { size, rotorAngle } = drone;
      const armLength = size * 0.85;

      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(2, 2, size * 0.7, size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Y config rotated - front arm points right
      const motors = [
        { x: armLength, y: 0 }, // Front (right)
        { x: -armLength * 0.5, y: -armLength * 0.866 }, // Rear left
        { x: -armLength * 0.5, y: armLength * 0.866 }, // Rear right
      ];

      ctx.strokeStyle = droneColor.secondary;
      ctx.lineWidth = 3;
      motors.forEach(m => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
      });

      motors.forEach((m, i) => {
        ctx.fillStyle = `${droneColor.accent}0a`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        const phase = rotorAngle + i * (Math.PI / 3);
        ctx.strokeStyle = `${droneColor.accent}55`;
        ctx.lineWidth = 1.5;
        for (let b = 0; b < 2; b++) {
          const angle = phase + b * Math.PI;
          ctx.beginPath();
          ctx.moveTo(m.x - Math.cos(angle) * size * 0.35, m.y - Math.sin(angle) * size * 0.35);
          ctx.lineTo(m.x + Math.cos(angle) * size * 0.35, m.y + Math.sin(angle) * size * 0.35);
          ctx.stroke();
        }

        ctx.fillStyle = droneColor.primary;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Body - elongated towards front
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.18, size * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Front indicator (right side)
      ctx.fillStyle = Math.sin(t * 4 + drone.lightPhase) > 0.5 ? droneColor.glow : `${droneColor.accent}33`;
      ctx.beginPath();
      ctx.arc(size * 0.22, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawHelicopter = (drone: Drone, t: number) => {
      const { size, rotorAngle, tailRotorAngle = 0 } = drone;

      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.ellipse(2, 2, size * 0.8, size * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tail boom extends LEFT (negative X)
      ctx.strokeStyle = droneColor.secondary;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-size * 1.0, 0);
      ctx.stroke();

      // Tail fin
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.moveTo(-size * 1.0, 0);
      ctx.lineTo(-size * 1.1, -size * 0.18);
      ctx.lineTo(-size * 0.85, 0);
      ctx.closePath();
      ctx.fill();

      // Tail rotor (vertical on the side)
      const tailPhase = tailRotorAngle + t * 12;
      ctx.strokeStyle = `${droneColor.accent}66`;
      ctx.lineWidth = 1.5;
      for (let b = 0; b < 2; b++) {
        const angle = tailPhase + b * Math.PI;
        ctx.beginPath();
        ctx.moveTo(-size * 1.0, -Math.cos(angle) * size * 0.15);
        ctx.lineTo(-size * 1.0, Math.cos(angle) * size * 0.15);
        ctx.stroke();
      }

      // Main body (fuselage) - elongated nose pointing RIGHT
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.ellipse(size * 0.1, 0, size * 0.38, size * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cockpit bubble (front/right)
      ctx.fillStyle = `${droneColor.accent}18`;
      ctx.beginPath();
      ctx.ellipse(size * 0.28, 0, size * 0.14, size * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      // Main rotor disc glow
      ctx.fillStyle = `${droneColor.accent}08`;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.85, 0, Math.PI * 2);
      ctx.fill();

      // Main rotor blades
      ctx.strokeStyle = `${droneColor.accent}55`;
      ctx.lineWidth = 2;
      for (let b = 0; b < 2; b++) {
        const angle = rotorAngle + b * Math.PI;
        ctx.beginPath();
        ctx.moveTo(-Math.cos(angle) * size * 0.8, -Math.sin(angle) * size * 0.8);
        ctx.lineTo(Math.cos(angle) * size * 0.8, Math.sin(angle) * size * 0.8);
        ctx.stroke();
      }

      // Rotor hub
      ctx.fillStyle = droneColor.secondary;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.06, 0, Math.PI * 2);
      ctx.fill();

      // Nose indicator light (right side)
      ctx.fillStyle = `${droneColor.accent}77`;
      ctx.beginPath();
      ctx.arc(size * 0.4, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawFixedWing = (drone: Drone, t: number) => {
      const { size, propAngle = 0 } = drone;

      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.beginPath();
      ctx.ellipse(3, 3, size * 0.35, size * 1.0, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wings extend up/down (perpendicular to flight direction)
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.moveTo(-size * 0.12, 0);           // Wing root back
      ctx.lineTo(-size * 0.12, -size * 0.95); // Left wing tip
      ctx.lineTo(size * 0.2, -size * 0.12);   // Left wing leading edge
      ctx.lineTo(size * 0.2, size * 0.12);    // Right wing leading edge  
      ctx.lineTo(-size * 0.12, size * 0.95);  // Right wing tip
      ctx.lineTo(-size * 0.12, 0);            // Wing root back
      ctx.closePath();
      ctx.fill();

      // Fuselage (horizontal, nose pointing right)
      ctx.fillStyle = droneColor.secondary;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.5, size * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      // Nose cone (right side)
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, 0);
      ctx.lineTo(size * 0.68, -size * 0.05);
      ctx.lineTo(size * 0.68, size * 0.05);
      ctx.closePath();
      ctx.fill();

      // Tail (left side) - horizontal stabilizer
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.moveTo(-size * 0.4, 0);
      ctx.lineTo(-size * 0.6, -size * 0.25);
      ctx.lineTo(-size * 0.48, 0);
      ctx.lineTo(-size * 0.6, size * 0.25);
      ctx.closePath();
      ctx.fill();

      // Propeller (at nose)
      const propPhase = propAngle + t * 10;
      ctx.strokeStyle = `${droneColor.accent}77`;
      ctx.lineWidth = 2;
      for (let b = 0; b < 2; b++) {
        const angle = propPhase + b * Math.PI;
        ctx.beginPath();
        ctx.moveTo(size * 0.68, Math.cos(angle) * size * 0.2);
        ctx.lineTo(size * 0.68, -Math.cos(angle) * size * 0.2);
        ctx.stroke();
      }

      // Navigation lights on wing tips
      ctx.fillStyle = Math.sin(t * 3) > 0.5 ? "#44aa66" : "#224433";
      ctx.beginPath();
      ctx.arc(-size * 0.08, -size * 0.9, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = Math.sin(t * 3) > 0.5 ? "#aa4444" : "#442222";
      ctx.beginPath();
      ctx.arc(-size * 0.08, size * 0.9, 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawVTOL = (drone: Drone, t: number) => {
      const { size, rotorAngle } = drone;

      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.beginPath();
      ctx.ellipse(2, 2, size * 0.4, size * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wing extends up/down, perpendicular to flight
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.moveTo(-size * 0.08, -size * 0.8);  // Left wing back
      ctx.lineTo(size * 0.08, -size * 0.8);   // Left wing front
      ctx.lineTo(size * 0.15, -size * 0.12);  // Left wing root front
      ctx.lineTo(size * 0.15, size * 0.12);   // Right wing root front
      ctx.lineTo(size * 0.08, size * 0.8);    // Right wing front
      ctx.lineTo(-size * 0.08, size * 0.8);   // Right wing back
      ctx.lineTo(-size * 0.15, size * 0.12);  // Right wing root back
      ctx.lineTo(-size * 0.15, -size * 0.12); // Left wing root back
      ctx.closePath();
      ctx.fill();

      // Fuselage (horizontal)
      ctx.fillStyle = droneColor.secondary;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.4, size * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // Nose (right)
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.moveTo(size * 0.4, 0);
      ctx.lineTo(size * 0.52, -size * 0.04);
      ctx.lineTo(size * 0.52, size * 0.04);
      ctx.closePath();
      ctx.fill();

      // Tail (left)
      ctx.fillStyle = droneColor.primary;
      ctx.beginPath();
      ctx.moveTo(-size * 0.35, 0);
      ctx.lineTo(-size * 0.5, -size * 0.12);
      ctx.lineTo(-size * 0.42, 0);
      ctx.lineTo(-size * 0.5, size * 0.12);
      ctx.closePath();
      ctx.fill();

      // Tiltrotors on wing tips (top and bottom)
      const rotorPositions = [
        { x: size * 0.05, y: -size * 0.75 },
        { x: size * 0.05, y: size * 0.75 },
      ];

      rotorPositions.forEach((pos, i) => {
        ctx.fillStyle = droneColor.secondary;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y, size * 0.1, size * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `${droneColor.accent}0a`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size * 0.35, 0, Math.PI * 2);
        ctx.fill();

        const phase = rotorAngle + (i % 2 === 0 ? 0 : Math.PI / 3);
        ctx.strokeStyle = `${droneColor.accent}55`;
        ctx.lineWidth = 1.5;
        for (let b = 0; b < 3; b++) {
          const angle = phase + b * (Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(pos.x + Math.cos(angle) * size * 0.32, pos.y + Math.sin(angle) * size * 0.32);
          ctx.stroke();
        }

        ctx.fillStyle = droneColor.accent;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // Nose light
      ctx.fillStyle = Math.sin(t * 4 + drone.lightPhase) > 0.5 ? droneColor.glow : `${droneColor.accent}33`;
      ctx.beginPath();
      ctx.arc(size * 0.48, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawDrone = (drone: Drone, t: number) => {
      const { x, y, heading, altitude, bobOffset, vx, vy } = drone;

      // Subtle bob based on speed (less bob when moving fast)
      const speed = Math.sqrt(vx * vx + vy * vy);
      const bobAmount = Math.max(0.5, 1.5 - speed);
      const bob = Math.sin(t * 1.5 + bobOffset) * bobAmount;
      const drawY = y + bob;

      ctx.save();
      ctx.translate(x, drawY);
      ctx.scale(altitude, altitude);
      ctx.rotate(heading);

      switch (drone.type) {
        case "quadcopter": drawQuadcopter(drone, t); break;
        case "hexacopter": drawHexacopter(drone, t); break;
        case "tricopter": drawTricopter(drone, t); break;
        case "helicopter": drawHelicopter(drone, t); break;
        case "fixedwing": drawFixedWing(drone, t); break;
        case "vtol": drawVTOL(drone, t); break;
      }

      ctx.restore();
    };

    const drawParticles = (t: number) => {
      const particleCount = 25;
      for (let i = 0; i < particleCount; i++) {
        const px = (Math.sin(t * 0.15 + i * 0.7) * 0.5 + 0.5) * canvas.width;
        const py = (Math.cos(t * 0.12 + i * 0.9) * 0.5 + 0.5) * canvas.height;
        const psize = 0.6 + Math.sin(t * 1.0 + i) * 0.3;
        const alpha = 0.08 + Math.sin(t * 0.6 + i) * 0.03;

        ctx.fillStyle = `rgba(74, 144, 164, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, psize, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawConnectionLines = (drones: Drone[]) => {
      const connectionDistance = 180;

      drones.forEach((d1, i) => {
        drones.slice(i + 1).forEach((d2) => {
          const dx = d2.x - d1.x;
          const dy = d2.y - d1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionDistance) {
            // Stronger connection for formation drones
            const isFormation = d1.flightMode === "formation" || d2.flightMode === "formation";
            const baseAlpha = isFormation ? 0.15 : 0.06;
            const alpha = (1 - dist / connectionDistance) * baseAlpha;
            
            ctx.strokeStyle = `rgba(74, 144, 164, ${alpha})`;
            ctx.lineWidth = isFormation ? 1 : 0.5;
            ctx.setLineDash(isFormation ? [] : [3, 3]);
            ctx.beginPath();
            ctx.moveTo(d1.x, d1.y);
            ctx.lineTo(d2.x, d2.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });

        // Connection to mouse - more visible
        if (mouseRef.current.active) {
          const dx = mouseRef.current.x - d1.x;
          const dy = mouseRef.current.y - d1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 300) {
            const alpha = (1 - dist / 300) * 0.35;
            ctx.strokeStyle = `rgba(91, 163, 184, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(d1.x, d1.y);
            ctx.lineTo(mouseRef.current.x, mouseRef.current.y);
            ctx.stroke();
          }
        }
      });
    };

    const animate = () => {
      const dt = 0.016;

      // Background
      const bgGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.8
      );
      bgGradient.addColorStop(0, "#0a1219");
      bgGradient.addColorStop(0.5, "#070d12");
      bgGradient.addColorStop(1, "#030608");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid
      ctx.strokeStyle = "rgba(74, 144, 164, 0.025)";
      ctx.lineWidth = 1;
      const gridSize = 80;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      drawParticles(time);

      // Update all drones
      dronesRef.current.forEach((drone, index) => {
        updateDroneMotion(drone, index, dt);
      });

      // Sort by altitude and draw
      const sortedDrones = [...dronesRef.current].sort((a, b) => a.altitude - b.altitude);
      drawConnectionLines(sortedDrones);
      sortedDrones.forEach((drone) => drawDrone(drone, time));

      // Cursor indicator - more visible
      if (mouseRef.current.active) {
        const pulse = Math.sin(time * 3) * 5;
        
        // Outer ring
        ctx.strokeStyle = "rgba(91, 163, 184, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 20 + pulse, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner ring
        ctx.strokeStyle = "rgba(91, 163, 184, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = "rgba(91, 163, 184, 0.6)";
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      time += dt;
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0"
      style={{ cursor: "none" }}
    />
  );
}