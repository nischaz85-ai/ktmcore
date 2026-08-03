"use client";

import { useState } from "react";

const paths = [
  {
    id: "equipment",
    number: "01",
    label: "Equipment or Part",
    title: "Move from a physical problem to a buildable solution.",
    description: "Useful when a part needs to fit, move, mount, protect, or survive a real operating environment.",
    inputs: ["Sketches or photographs", "Measurements or existing files", "Fabrication and maintenance constraints"],
    outputs: ["3D part or assembly model", "Fabrication-ready drawings", "Revision and prototype support"],
    href: "/services#mechanical-cad",
  },
  {
    id: "hardware",
    number: "02",
    label: "Sensors or Robotics",
    title: "Connect electronics and automation hardware to the real machine.",
    description: "Useful for cameras, sensors, edge devices, robots, and electronics that need practical packaging and interfaces.",
    inputs: ["Component datasheets", "Mounting environment", "Cable, access, and service needs"],
    outputs: ["Enclosures and mounting systems", "Integrated hardware layout", "Prototype assembly package"],
    href: "/services#edge-robotics-hardware",
  },
  {
    id: "site",
    number: "03",
    label: "Site or Plan Set",
    title: "Organize multidisciplinary information around field decisions.",
    description: "Useful when contractors, owners, and technical disciplines need one clear picture of site or building-system constraints.",
    inputs: ["Existing plans and markups", "Site and utility information", "Coordination requirements"],
    outputs: ["Clean, organized plan sheets", "Site and system coordination", "Review-ready drawing packages"],
    href: "/services#civil-cad",
  },
  {
    id: "simulation",
    number: "04",
    label: "System Behavior",
    title: "Make a complex system easier to test, explain, and evaluate.",
    description: "Useful when motion, navigation, interaction, or automation logic is difficult to communicate with static drawings alone.",
    inputs: ["System objective", "Operating rules and constraints", "Equipment or environment references"],
    outputs: ["Interactive technical scene", "Behavior and path visualization", "Clear stakeholder demonstration"],
    href: "/simulations",
  },
];

export default function EngineeringPathfinder() {
  const [activeId, setActiveId] = useState(paths[0].id);
  const active = paths.find((path) => path.id === activeId) ?? paths[0];

  return (
    <section className="relative border-y border-[#d4e6e3] bg-[#e9f4f1] px-6 py-20">
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-[#f2b84b]/20 blur-3xl" />
      <div className="relative mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#176b87]">Start anywhere</p>
            <h2 className="mt-3 text-3xl font-semibold text-[#17324d] sm:text-4xl">What is getting in the way?</h2>
          </div>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1" role="tablist" aria-label="Engineering problem type">
            {paths.map((path) => {
              const selected = path.id === active.id;
              return (
                <button
                  key={path.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveId(path.id)}
                  className={`group flex min-h-16 items-center gap-4 rounded-2xl border px-5 text-left transition ${selected ? "border-[#176b87] bg-[#176b87] text-white shadow-lg shadow-[#176b87]/15" : "border-white bg-white/80 text-[#49657a] hover:-translate-y-0.5 hover:border-[#f47b63]"}`}
                >
                  <span className={`font-mono text-xs ${selected ? "text-[#bdebf3]" : "text-[#8aa0ae]"}`}>{path.number}</span>
                  <span className="font-semibold">{path.label}</span>
                  <span className={`ml-auto transition ${selected ? "translate-x-1 text-cyan-300" : "text-slate-600 group-hover:text-slate-300"}`} aria-hidden="true">→</span>
                </button>
              );
            })}
          </div>

          <div key={active.id} role="tabpanel" className="pathfinder-panel rounded-[1.5rem] border border-white bg-white p-6 shadow-xl shadow-[#17324d]/8 sm:p-8">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#c85440]">Path {active.number}</p>
            <h3 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight text-[#17324d] sm:text-3xl">{active.title}</h3>
            <p className="mt-4 max-w-2xl leading-7 text-[#5c7284]">{active.description}</p>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <PathList title="Bring what you have" items={active.inputs} />
              <PathList title="Possible deliverables" items={active.outputs} accent />
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={active.href} className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#176b87] px-6 font-semibold text-white transition hover:bg-[#12566d]">See the Service</a>
              <a href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-[#f47b63] px-6 font-semibold text-[#c85440] transition hover:bg-[#fff0e8]">Talk It Through</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PathList({ title, items, accent = false }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div>
      <p className="text-sm font-semibold text-[#17324d]">{title}</p>
      <ul className="mt-3 grid gap-2">
        {items.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-[#5c7284]"><span className={accent ? "text-[#28734c]" : "text-[#f47b63]"} aria-hidden="true">{accent ? "✓" : "•"}</span>{item}</li>)}
      </ul>
    </div>
  );
}
