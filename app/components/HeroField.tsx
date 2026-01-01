"use client";

import { useEffect, useRef } from "react";

interface Drone {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  rotation: number;
  rotorAngle: number;
  rotorSpeed: number;
  size: number;
  altitude: number;
  bobOffset: number;
  bobSpeed: number;
  lightPhase: number;
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

    // Initialize drones
    const droneCount = Math.min(12, Math.floor(window.innerWidth / 150));
    dronesRef.current = Array.from({ length: droneCount }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      targetX: Math.random() * canvas.width,
      targetY: Math.random() * canvas.height,
      vx: 0,
      vy: 0,
      rotation: 0,
      rotorAngle: Math.random() * Math.PI * 2,
      rotorSpeed: 0.4 + Math.random() * 0.2,
      size: 25 + Math.random() * 15,
      altitude: 0.7 + Math.random() * 0.3,
      bobOffset: Math.random() * Math.PI * 2,
      bobSpeed: 0.02 + Math.random() * 0.01,
      lightPhase: Math.random() * Math.PI * 2,
    }));

    let time = 0;

    const drawDrone = (drone: Drone, t: number) => {
      const { x, y, rotation, rotorAngle, size, altitude, bobOffset, lightPhase } = drone;
      
      // Hovering bob effect
      const bob = Math.sin(t * 2 + bobOffset) * 3;
      const drawY = y + bob;
      
      ctx.save();
      ctx.translate(x, drawY);
      
      // Scale based on "altitude" for depth effect
      const scale = altitude;
      ctx.scale(scale, scale);
      
      // Slight tilt based on velocity
      const tiltX = drone.vx * 0.15;
      const tiltY = drone.vy * 0.1;
      ctx.rotate(tiltX);

      // Draw shadow
      ctx.save();
      ctx.translate(10, 15);
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.8, size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Main body - fuselage
      const bodyGradient = ctx.createLinearGradient(-size * 0.3, -size * 0.15, size * 0.3, size * 0.15);
      bodyGradient.addColorStop(0, "#3a3a3a");
      bodyGradient.addColorStop(0.5, "#1a1a1a");
      bodyGradient.addColorStop(1, "#0a0a0a");
      
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.35, size * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Body highlight
      ctx.strokeStyle = "rgba(100, 200, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Camera/sensor dome
      const domeGradient = ctx.createRadialGradient(0, size * 0.05, 0, 0, size * 0.05, size * 0.12);
      domeGradient.addColorStop(0, "#00d4ff");
      domeGradient.addColorStop(0.5, "#0066aa");
      domeGradient.addColorStop(1, "#003355");
      
      ctx.fillStyle = domeGradient;
      ctx.beginPath();
      ctx.arc(0, size * 0.05, size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      
      // Camera lens reflection
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.beginPath();
      ctx.arc(-size * 0.03, size * 0.02, size * 0.03, 0, Math.PI * 2);
      ctx.fill();

      // Arms and rotors
      const armPositions = [
        { angle: -Math.PI / 4, x: -size * 0.6, y: -size * 0.4 },
        { angle: Math.PI / 4, x: size * 0.6, y: -size * 0.4 },
        { angle: -Math.PI * 3 / 4, x: -size * 0.6, y: size * 0.4 },
        { angle: Math.PI * 3 / 4, x: size * 0.6, y: size * 0.4 },
      ];

      armPositions.forEach((arm, i) => {
        // Arm
        ctx.strokeStyle = "#2a2a2a";
        ctx.lineWidth = size * 0.08;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(arm.x, arm.y);
        ctx.stroke();
        
        // Motor housing
        const motorGradient = ctx.createRadialGradient(arm.x, arm.y, 0, arm.x, arm.y, size * 0.12);
        motorGradient.addColorStop(0, "#4a4a4a");
        motorGradient.addColorStop(1, "#1a1a1a");
        
        ctx.fillStyle = motorGradient;
        ctx.beginPath();
        ctx.arc(arm.x, arm.y, size * 0.1, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = "rgba(0, 200, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Spinning rotors with motion blur effect
        const rotorPhase = rotorAngle + (i % 2 === 0 ? 0 : Math.PI / 2);
        const rotorLength = size * 0.35;
        
        // Rotor blur circle
        ctx.fillStyle = "rgba(100, 200, 255, 0.08)";
        ctx.beginPath();
        ctx.arc(arm.x, arm.y, rotorLength, 0, Math.PI * 2);
        ctx.fill();
        
        // Rotor blades (2 per motor)
        for (let b = 0; b < 2; b++) {
          const bladeAngle = rotorPhase + b * Math.PI;
          
          ctx.save();
          ctx.translate(arm.x, arm.y);
          ctx.rotate(bladeAngle);
          
          // Blade with gradient
          const bladeGradient = ctx.createLinearGradient(0, 0, rotorLength, 0);
          bladeGradient.addColorStop(0, "rgba(150, 150, 150, 0.9)");
          bladeGradient.addColorStop(1, "rgba(100, 100, 100, 0.3)");
          
          ctx.fillStyle = bladeGradient;
          ctx.beginPath();
          ctx.ellipse(rotorLength * 0.5, 0, rotorLength * 0.5, size * 0.04, 0, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
        }
      });

      // Status LEDs
      const ledBlink = Math.sin(t * 5 + lightPhase) > 0;
      
      // Front LED (green when active, dim when not)
      ctx.fillStyle = ledBlink ? "#00ff44" : "#004411";
      ctx.shadowColor = ledBlink ? "#00ff44" : "transparent";
      ctx.shadowBlur = ledBlink ? 8 : 0;
      ctx.beginPath();
      ctx.arc(0, -size * 0.12, size * 0.03, 0, Math.PI * 2);
      ctx.fill();
      
      // Rear LEDs (red)
      const rearLedBlink = Math.sin(t * 3 + lightPhase + Math.PI) > 0.3;
      ctx.fillStyle = rearLedBlink ? "#ff3300" : "#331100";
      ctx.shadowColor = rearLedBlink ? "#ff3300" : "transparent";
      ctx.shadowBlur = rearLedBlink ? 6 : 0;
      ctx.beginPath();
      ctx.arc(-size * 0.15, size * 0.1, size * 0.025, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(size * 0.15, size * 0.1, size * 0.025, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;

      ctx.restore();
    };

    const drawParticles = (t: number) => {
      // Ambient particles for atmosphere
      const particleCount = 50;
      ctx.fillStyle = "rgba(0, 200, 255, 0.3)";
      
      for (let i = 0; i < particleCount; i++) {
        const px = (Math.sin(t * 0.5 + i * 0.5) * 0.5 + 0.5) * canvas.width;
        const py = (Math.cos(t * 0.3 + i * 0.7) * 0.5 + 0.5) * canvas.height;
        const psize = 1 + Math.sin(t * 2 + i) * 0.5;
        
        ctx.beginPath();
        ctx.arc(px, py, psize, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawConnectionLines = (drones: Drone[]) => {
      const connectionDistance = 250;
      
      drones.forEach((d1, i) => {
        drones.slice(i + 1).forEach((d2) => {
          const dx = d2.x - d1.x;
          const dy = d2.y - d1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.2;
            ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(d1.x, d1.y);
            ctx.lineTo(d2.x, d2.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });

        // Connection to mouse when close
        if (mouseRef.current.active) {
          const dx = mouseRef.current.x - d1.x;
          const dy = mouseRef.current.y - d1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 200) {
            const alpha = (1 - dist / 200) * 0.4;
            ctx.strokeStyle = `rgba(0, 255, 200, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(d1.x, d1.y);
            ctx.lineTo(mouseRef.current.x, mouseRef.current.y);
            ctx.stroke();
          }
        }
      });
    };

    const animate = () => {
      // Clear with gradient background
      const bgGradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.7
      );
      bgGradient.addColorStop(0, "#0a1628");
      bgGradient.addColorStop(1, "#000508");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw subtle grid
      ctx.strokeStyle = "rgba(0, 100, 150, 0.05)";
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

      // Update and draw drones
      dronesRef.current.forEach((drone) => {
        // Update target occasionally
        if (Math.random() < 0.005) {
          drone.targetX = Math.random() * canvas.width;
          drone.targetY = Math.random() * canvas.height;
        }

        // Mouse influence
        if (mouseRef.current.active) {
          const dx = mouseRef.current.x - drone.x;
          const dy = mouseRef.current.y - drone.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 300) {
            // Drones are attracted to cursor but keep some distance
            const influence = (1 - dist / 300) * 0.3;
            if (dist > 100) {
              drone.targetX = drone.x + dx * influence;
              drone.targetY = drone.y + dy * influence;
            } else {
              // Orbit around cursor when close
              const orbitAngle = Math.atan2(dy, dx) + 0.02;
              drone.targetX = mouseRef.current.x + Math.cos(orbitAngle) * 120;
              drone.targetY = mouseRef.current.y + Math.sin(orbitAngle) * 120;
            }
          }
        }

        // Smooth movement towards target
        const dx = drone.targetX - drone.x;
        const dy = drone.targetY - drone.y;
        
        drone.vx += dx * 0.002;
        drone.vy += dy * 0.002;
        
        // Damping
        drone.vx *= 0.98;
        drone.vy *= 0.98;
        
        // Speed limit
        const speed = Math.sqrt(drone.vx * drone.vx + drone.vy * drone.vy);
        const maxSpeed = 3;
        if (speed > maxSpeed) {
          drone.vx = (drone.vx / speed) * maxSpeed;
          drone.vy = (drone.vy / speed) * maxSpeed;
        }
        
        drone.x += drone.vx;
        drone.y += drone.vy;
        
        // Keep on screen
        drone.x = Math.max(50, Math.min(canvas.width - 50, drone.x));
        drone.y = Math.max(50, Math.min(canvas.height - 50, drone.y));
        
        // Update rotor angle
        drone.rotorAngle += drone.rotorSpeed;
      });

      // Sort by altitude for proper layering
      const sortedDrones = [...dronesRef.current].sort((a, b) => a.altitude - b.altitude);
      
      drawConnectionLines(sortedDrones);
      
      sortedDrones.forEach((drone) => {
        drawDrone(drone, time);
      });

      // Draw cursor indicator when active
      if (mouseRef.current.active) {
        ctx.strokeStyle = "rgba(0, 255, 200, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 20 + Math.sin(time * 3) * 5, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = "rgba(0, 255, 200, 0.5)";
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      time += 0.016;
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