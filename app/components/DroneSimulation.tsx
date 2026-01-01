"use client";

import { useEffect, useRef, useState } from "react";

export default function DroneSimulation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    let t = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let x = 50;
    let y = canvas.height / 2;
    let dx = speed;

    const drawGrid = () => {
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;

      for (let i = 0; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
      }

      for (let j = 0; j < canvas.height; j += 40) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(canvas.width, j);
        ctx.stroke();
      }
    };

    const drawDrone = () => {
      // Body
      ctx.fillStyle = "rgba(0, 229, 255, 0.35)";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Sensor cone
      ctx.fillStyle = "rgba(80, 120, 255, 0.25)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 60, y - 25);
      ctx.lineTo(x + 60, y + 25);
      ctx.closePath();
      ctx.fill();
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawGrid();
      drawDrone();

      x += dx;
        y = canvas.height / 2 + Math.sin(t) * 40;
        t += 0.05;

      if (x > canvas.width - 60 || x < 40) {
        dx *= -1;
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [speed]);

  return (
    <div className="border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-medium mb-4">
        Autonomous Drone Simulation
      </h3>

      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        className="w-full bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded"
      />

      <div className="mt-4">
        <label className="text-sm text-gray-400">
          Speed: {speed.toFixed(1)}
        </label>
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.5}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="w-full"
        />
      </div>
    </div>
  );
}
