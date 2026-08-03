"use client";

import { useEffect, useRef, useState } from "react";
import BattlefieldSimulation3D from "./BattlefieldSimulation3D";
import DroneSimulation3D from "./DroneSimulation3D";
import FactoryAutomation3D from "./FactoryAutomation3D";

type ActiveScene = "city" | "factory" | "battlefield";

export default function WebGLShowcase() {
  const cityRef = useRef<HTMLElement | null>(null);
  const battlefieldRef = useRef<HTMLElement | null>(null);
  const factoryRef = useRef<HTMLElement | null>(null);
  const [activeScene, setActiveScene] = useState<ActiveScene>("city");

  useEffect(() => {
    const ratios: Record<ActiveScene, number> = {
      city: 0,
      factory: 0,
      battlefield: 0,
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === cityRef.current) ratios.city = entry.intersectionRatio;
          if (entry.target === factoryRef.current) ratios.factory = entry.intersectionRatio;
          if (entry.target === battlefieldRef.current) ratios.battlefield = entry.intersectionRatio;
        });

        const next = (Object.entries(ratios) as [ActiveScene, number][]).sort((a, b) => b[1] - a[1])[0][0];
        setActiveScene(next);
      },
      {
        root: null,
        threshold: [0, 0.15, 0.3, 0.5, 0.7, 0.9, 1],
      }
    );

    if (cityRef.current) observer.observe(cityRef.current);
    if (factoryRef.current) observer.observe(factoryRef.current);
    if (battlefieldRef.current) observer.observe(battlefieldRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <section ref={cityRef} className="relative h-[100svh] min-h-[100svh] overflow-hidden bg-black md:h-screen md:min-h-screen">
        <DroneSimulation3D active={activeScene === "city"} />
      </section>

      <section ref={factoryRef} className="relative h-[100svh] min-h-[100svh] overflow-hidden bg-black md:h-screen md:min-h-screen">
        <FactoryAutomation3D active={activeScene === "factory"} />
      </section>

      <section ref={battlefieldRef} className="relative h-[100svh] min-h-[100svh] overflow-hidden bg-black md:h-screen md:min-h-screen">
        <BattlefieldSimulation3D active={activeScene === "battlefield"} />
      </section>
    </>
  );
}
