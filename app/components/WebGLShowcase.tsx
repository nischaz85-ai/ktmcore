"use client";

import { useEffect, useRef, useState } from "react";
import BattlefieldSimulation3D from "./BattlefieldSimulation3D";
import DroneSimulation3D from "./DroneSimulation3D";

type ActiveScene = "city" | "battlefield";

export default function WebGLShowcase() {
  const cityRef = useRef<HTMLElement | null>(null);
  const battlefieldRef = useRef<HTMLElement | null>(null);
  const [activeScene, setActiveScene] = useState<ActiveScene>("city");

  useEffect(() => {
    const ratios: Record<ActiveScene, number> = {
      city: 0,
      battlefield: 0,
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === cityRef.current) ratios.city = entry.intersectionRatio;
          if (entry.target === battlefieldRef.current) ratios.battlefield = entry.intersectionRatio;
        });

        setActiveScene(ratios.battlefield > ratios.city ? "battlefield" : "city");
      },
      {
        root: null,
        threshold: [0, 0.15, 0.3, 0.5, 0.7, 0.9, 1],
      }
    );

    if (cityRef.current) observer.observe(cityRef.current);
    if (battlefieldRef.current) observer.observe(battlefieldRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <section ref={cityRef} className="relative min-h-screen overflow-hidden bg-black">
        <DroneSimulation3D active={activeScene === "city"} />
      </section>

      <section ref={battlefieldRef} className="relative min-h-screen overflow-hidden bg-black">
        <BattlefieldSimulation3D active={activeScene === "battlefield"} />
      </section>
    </>
  );
}
