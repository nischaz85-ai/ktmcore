import CompanyPlanGallery from "./components/CompanyPlanGallery";
import EngineeringPathfinder from "./components/EngineeringPathfinder";
import EngineeringSystemsShowcase from "./components/EngineeringSystemsShowcase";
import HeroField from "./components/HeroField";
import Navbar from "./components/Navbar";
import SiteFooter from "./components/SiteFooter";
import TechnicalDesignPreviews from "./components/TechnicalDesignPreviews";

const proofPoints = [
  "Make equipment easier to build, use, or maintain",
  "Fit sensors, controls, and robotics into the real world",
  "Coordinate plans before field problems get expensive",
  "Use simulation when motion tells the story better",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#fbfaf6] text-[#17324d]">
      <Navbar />

      <section className="relative flex min-h-[92svh] items-center overflow-hidden bg-[#f4eee2] px-6 pb-16 pt-28">
        <HeroField />
        <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(251,250,246,0.98),rgba(251,250,246,0.92)_48%,rgba(223,243,247,0.72))]" />
        <div className="absolute -right-24 top-28 h-72 w-72 rounded-full bg-[#f47b63]/15 blur-3xl" />
        <div className="absolute -left-20 bottom-16 h-64 w-64 rounded-full bg-[#f2b84b]/20 blur-3xl" />

        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-[#176b87]">Practical engineering for real-world work</p>
            <h1 className="max-w-5xl text-4xl font-bold leading-[1.08] text-[#17324d] sm:text-5xl lg:text-6xl">Good engineering should make the next step feel obvious.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#49657a]">We help teams untangle equipment, hardware, automation, and site problems—then build the model, plan, prototype, or simulation that moves the work forward.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="/services" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#176b87] px-7 font-semibold text-white shadow-lg shadow-[#176b87]/15 transition hover:-translate-y-0.5 hover:bg-[#12566d]">See How We Help</a>
              <a href="/simulations" className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-[#f47b63] px-7 font-semibold text-[#c85440] transition hover:bg-[#fff0e8]">Try the Simulations</a>
            </div>
          </div>

          <div className="grid gap-0 overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/85 p-2 shadow-2xl shadow-[#17324d]/10 backdrop-blur">
            {proofPoints.map((point) => (
              <div key={point} className="flex items-start gap-3 rounded-2xl px-4 py-3.5 transition hover:bg-[#fff0e8]">
                <span className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dff2df] text-xs font-bold text-[#28734c]">✓</span>
                <p className="text-sm font-medium leading-6 text-[#334e64]">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <EngineeringPathfinder />
      <EngineeringSystemsShowcase />
      <CompanyPlanGallery />
      <TechnicalDesignPreviews />

      <section className="bg-[#f2b84b] px-6 py-20 text-[#17324d]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#71500e]">Have something stubborn to solve?</p>
            <h2 className="mt-2 text-3xl font-semibold">Show us what is not working yet.</h2>
          </div>
          <a href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#17324d] px-7 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#0d2438]">Let&apos;s Talk</a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
