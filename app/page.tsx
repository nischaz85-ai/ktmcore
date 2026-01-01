import Image from "next/image";
import DroneSimulation from "./components/DroneSimulation";
import HeroField from "./components/HeroField";
import Navbar from "./components/Navbar";




export default function Home() {
  return (


    
    <main className="bg-black text-white">
      <Navbar />
      

      {/* ================= HERO ================= */}
        <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden bg-black">

          {/* Animated field background */}
          <HeroField />

          {/* Soft vignette for depth */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60 z-5" />

          {/* Content */}
          <div className="relative z-10 max-w-5xl text-center backdrop-blur-sm">

            <h1 className="text-5xl md:text-6xl font-bold mb-6 text-white
              drop-shadow-[0_0_35px_rgba(0,200,255,0.25)]">
              KTM Core
            </h1>

            <p className="text-xl md:text-2xl text-gray-300 mb-10 leading-relaxed">
              Designing intelligent drone systems, autonomous software,
              and AI-driven engineering solutions.
            </p>

            <div className="flex justify-center gap-6">
              <button className="px-8 py-3 bg-white text-black rounded-lg font-medium
                hover:bg-gray-200 transition">
                View Projects
              </button>

              <button className="px-8 py-3 border border-cyan-400 text-cyan-300 rounded-lg
                hover:bg-cyan-400/10 transition">
                Contact
              </button>
            </div>

          </div>
        </section>



      {/* ================= DIVIDER ================= */}
      <div className="h-px bg-gray-800 max-w-6xl mx-auto" />

      {/* ================= WHAT WE BUILD ================= */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-semibold mb-12 text-center">
            What We Build
          </h2>

          <div className="grid md:grid-cols-3 gap-10">
            <Feature
              title="Autonomous Drone Systems"
              description="End-to-end UAV platforms integrating perception, control, and decision-making for real-world environments."
            />
            <Feature
              title="AI & Perception"
              description="Computer vision, sensor fusion, and machine intelligence for navigation, mapping, and situational awareness."
            />
            <Feature
              title="Software & Simulation"
              description="High-fidelity simulators, digital twins, and software pipelines for testing, validation, and deployment."
            />
          </div>
        </div>
      </section>

      {/* ================= TECHNOLOGY STACK ================= */}
      <section className="py-24 px-6 bg-gray-950">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-semibold mb-12 text-center">
            Technology Focus
          </h2>

          <div className="grid md:grid-cols-4 gap-8 text-center">
            <TechItem title="Robotics & Control" />
            <TechItem title="Computer Vision" />
            <TechItem title="AI & Autonomy" />
            <TechItem title="Cloud & Edge Systems" />
          </div>
        </div>
      </section>

      {/* ================= INTERACTIVE SIMULATION ================= */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-semibold mb-6">
              Interactive Autonomous Systems
            </h2>
            <p className="text-gray-400 leading-relaxed">
              Our platforms are designed and validated through simulation-first
              workflows. Control logic, perception, and autonomy are tested
              before deployment into physical systems.
            </p>
          </div>

          <DroneSimulation />
        </div>
      </section>


      {/* ================= PHILOSOPHY ================= */}
      <section className="py-24 px-6 bg-gray-950">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-semibold mb-6">
            Our Philosophy
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed">
            We believe autonomy is a systems problem.
            Hardware, software, intelligence, and environment must be designed
            together. KTM Core exists to engineer that integration.
          </p>
        </div>
      </section>

      {/* ================= CONTACT CTA ================= */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-semibold mb-6">
            Let’s Build What’s Next
          </h2>
          <p className="text-gray-400 mb-10">
            Research collaboration, consulting, or product development.
          </p>
          <button className="px-10 py-4 bg-white text-black rounded-lg font-medium">
            Get in Touch
          </button>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="py-10 border-t border-gray-800 text-center text-gray-500">
        © {new Date().getFullYear()} KTM Core. All rights reserved.
      </footer>
    </main>
  );
}

/* ================= COMPONENTS ================= */

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 border border-gray-800 rounded-xl hover:border-gray-600 transition">
      <h3 className="text-xl font-medium mb-4">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function TechItem({ title }: { title: string }) {
  return (
    <div className="p-6 border border-gray-800 rounded-xl">
      <p className="text-gray-300 font-medium">{title}</p>
    </div>
  );
}
