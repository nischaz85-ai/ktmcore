import DroneSimulation from "../components/DroneSimulation";
import Navbar from "../components/Navbar";
import SectionIntro from "../components/SectionIntro";
import SiteFooter from "../components/SiteFooter";
import WebGLShowcase from "../components/WebGLShowcase";

export default function SimulationsPage() {
  return (
    <main className="min-h-screen bg-[#fbfaf6] text-[#17324d]">
      <Navbar />

      <section className="border-b border-[#d7e1df] bg-[#dff3f7] px-6 pb-20 pt-32">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#176b87]">
            Robotic simulation
          </p>
          <h1 className="mt-4 max-w-5xl text-4xl font-bold leading-tight text-[#17324d] sm:text-5xl">
            Interactive simulations now have room to breathe.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#49657a]">
            This page keeps the heavy visual work together: full-screen 3D
            robotics scenes first—including coordinated factory automation—followed by the controllable navigation
            simulator for path planning and obstacle avoidance.
          </p>
        </div>
      </section>

      <section className="bg-[#fbfaf6] px-6 py-20 text-[#17324d]">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="3D scenes"
            title="Large WebGL environments for behavior, scale, and interaction."
            description="Explore autonomous mobility, coordinated package sorting, fleet dispatch, collision avoidance, vehicle controls, camera modes, and system behavior in motion."
          />
        </div>
      </section>

      <WebGLShowcase />

      <section className="bg-[#fff0e8] px-6 py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#c85440]">
              Navigation lab
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[#17324d]">
              Autonomous path planning in a compact control surface.
            </h2>
            <p className="mt-4 leading-7 text-[#5c7284]">
              Set waypoints, compare algorithms, visualize LiDAR and path
              planning, tune obstacle density, and watch the drone respond to
              dynamic objects in real time.
            </p>
          </div>
          <DroneSimulation />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
