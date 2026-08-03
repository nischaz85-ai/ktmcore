import Navbar from "../components/Navbar";
import Portfolio from "../components/Portfolio";
import SiteFooter from "../components/SiteFooter";

export default function PortfolioPage() {
  return (
    <main className="business-page min-h-screen bg-[#fbfaf6] text-[#17324d]">
      <Navbar />

      <section className="border-b border-slate-800 px-6 pb-16 pt-32">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Portfolio
          </p>
          <h1 className="mt-4 max-w-5xl text-4xl font-bold leading-tight sm:text-5xl">
            Project examples can now stand apart from the homepage.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            This page is ready for SolidWorks models, fabrication drawings,
            edge-device assemblies, civil CAD previews, and interactive 3D
            project viewers as they are added.
          </p>
        </div>
      </section>

      <Portfolio />
      <SiteFooter />
    </main>
  );
}
