"use client";

import { useEffect, useRef } from "react";

export default function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let mouseX = canvas.width / 2;
    let mouseY = canvas.height / 2;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    const particles = Array.from({ length: 160 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: 0,
      vy: 0,
    }));

    let t = 0;

    const field = (x: number, y: number) => {
      const dx = x - mouseX;
      const dy = y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      return Math.sin(x * 0.002 + t) + Math.cos(y * 0.002 + t) + 80 / dist;
    };

    const animate = () => {
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 1;

      particles.forEach((p) => {
        const angle = field(p.x, p.y);

        p.vx = Math.cos(angle);
        p.vy = Math.sin(angle);

        const nx = p.x + p.vx * 2;
        const ny = p.y + p.vy * 2;

        ctx.strokeStyle = "rgba(0,200,255,0.7)";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        p.x = nx;
        p.y = ny;

        if (
          p.x < 0 || p.x > canvas.width ||
          p.y < 0 || p.y > canvas.height
        ) {
          p.x = Math.random() * canvas.width;
          p.y = Math.random() * canvas.height;
        }
      });

      t += 0.002;
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0"
    />
  );
}
