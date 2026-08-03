import { portfolioProjects } from "../data/portfolio";
import PortfolioCard from "./PortfolioCard";
import SectionIntro from "./SectionIntro";

export default function Portfolio() {
  return (
    <section id="portfolio" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <SectionIntro
          index="06"
          eyebrow="Portfolio"
          title="SolidWorks models, fabrication drawings, edge-device hardware, and civil CAD work."
          description="Projects are added directly from KTMcore's project data file, including preview images, 2D drawing previews, optional interactive 3D viewers, and downloadable drawings."
        />

        {portfolioProjects.length > 0 ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {portfolioProjects.map((project) => (
              <PortfolioCard key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-8 py-14 text-center">
            <span className="h-10 w-10 rounded-full border border-slate-600" />
            <p className="text-slate-400">
              Portfolio projects will appear here as they are added to
              KTMcore&apos;s project data file.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
