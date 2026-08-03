import Navbar from "../components/Navbar";
import SectionIntro from "../components/SectionIntro";
import SiteFooter from "../components/SiteFooter";
import { serviceCategories, simulationServiceCard } from "../data/services";

const industries = [
  "Small manufacturers",
  "Machine shops",
  "Fabrication teams",
  "Industrial contractors",
  "Maintenance groups",
  "Product builders",
];

const processSteps = [
  "Review the equipment, product, site, or workflow and identify the constraints that matter.",
  "Create the CAD model, drawing package, hardware layout, or simulation plan around those constraints.",
  "Deliver usable files and technical guidance for fabrication, troubleshooting, review, or implementation.",
];

const starterOffers = [
  {
    name: "CAD Review",
    price: "$249",
    timing: "Delivered in 2 business days",
    description:
      "A focused review of one part, assembly, or drawing set with marked-up findings and prioritized recommendations.",
    includes: ["Up to 5 supplied files", "Design and manufacturability review", "Written action list"],
  },
  {
    name: "Part-to-Production Sprint",
    price: "From $750",
    timing: "Typical delivery in 3–5 business days",
    description:
      "Turn a sketch, measurement set, or existing part into a clean 3D model and fabrication-ready drawing.",
    includes: ["One mechanical part", "3D CAD model", "Dimensioned PDF drawing", "One revision round"],
    featured: true,
  },
  {
    name: "Engineering Support Block",
    price: "From $1,500",
    timing: "Scoped around your priority",
    description:
      "Reserved project capacity for assemblies, enclosures, robotics hardware, drawing packages, or technical visualization.",
    includes: ["Defined project milestone", "Progress check-in", "Source and delivery files"],
  },
];

export default function ServicesPage() {
  return (
    <main className="business-page min-h-screen bg-[#fbfaf6] text-[#17324d]">
      <Navbar />

      <section className="border-b border-slate-800 px-6 pb-20 pt-32">
        <div className="mx-auto max-w-7xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
            AI-enabled CAD and technical delivery
          </p>
          <h1 className="mt-4 max-w-5xl text-4xl font-bold leading-tight sm:text-5xl">
            Modern design tools, practical CAD, and technical delivery in one workflow.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            KTMcore uses AI-assisted exploration alongside CAD, visualization, and
            technical review to accelerate design work. Start with a sketch,
            photograph, scan, existing file, or digital concept and develop it into
            editable geometry, drawings, hardware layouts, and simulations.
          </p>
        </div>
      </section>

      <section className="border-b border-slate-800 bg-slate-900/45 px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Start here"
            title="Clear scopes, real deliverables, and a known starting price."
            description="Choose the closest fit. After reviewing your files, KTMcore confirms scope, timing, and price before work begins. No surprise billing."
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {starterOffers.map((offer) => (
              <article
                key={offer.name}
                className={`flex flex-col rounded-lg border p-6 ${
                  offer.featured
                    ? "border-cyan-400 bg-cyan-400/5 shadow-lg shadow-cyan-950/30"
                    : "border-slate-700 bg-slate-950"
                }`}
              >
                {offer.featured && (
                  <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                    Best place to start
                  </p>
                )}
                <h2 className="text-2xl font-semibold text-white">{offer.name}</h2>
                <p className="mt-3 text-3xl font-bold text-cyan-300">{offer.price}</p>
                <p className="mt-2 text-sm text-slate-400">{offer.timing}</p>
                <p className="mt-5 leading-7 text-slate-300">{offer.description}</p>
                <ul className="mt-5 grid gap-3 text-sm text-slate-300">
                  {offer.includes.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="text-cyan-400" aria-hidden="true">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href="/contact"
                  className={`mt-7 inline-flex min-h-12 items-center justify-center rounded-md px-5 font-semibold transition ${
                    offer.featured
                      ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                      : "border border-slate-600 text-white hover:border-cyan-400 hover:text-cyan-200"
                  }`}
                >
                  Request This Service
                </a>
              </article>
            ))}
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-400">
            Prices are starting points in USD. Final quotes depend on file quality,
            complexity, required formats, and turnaround time.
          </p>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Service flow"
            title="Start with geometry, then connect the supporting systems."
            description="Each service is separate enough to be useful on its own, but the strongest work happens when the model, drawing package, hardware layout, and simulation all describe the same reality."
          />

          <div className="mt-12 grid gap-6">
            {serviceCategories.map((category) => (
              <article
                key={category.id}
                id={category.id}
                className="scroll-mt-24 rounded-md border border-slate-800 bg-slate-900/45 p-6 sm:p-8"
              >
                <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm text-cyan-300">
                        0{category.order}
                      </span>
                      {category.primary && (
                        <span className="rounded-full border border-cyan-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                          Primary service
                        </span>
                      )}
                    </div>
                    <h2 className="mt-4 text-3xl font-semibold text-white">
                      {category.title}
                    </h2>
                    <p className="mt-4 leading-7 text-slate-300">
                      {category.description}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {category.cards.map((card) => (
                      <ServiceCard key={card.title} {...card} />
                    ))}
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  {category.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-300"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/45 px-6 py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionIntro
            eyebrow="Industries served"
            title="Built for industrial teams that need practical engineering capacity."
            description="KTMcore is useful where fabrication, installation, maintenance, drawing coordination, and product development overlap."
          />
          <div className="flex flex-wrap content-start gap-3">
            {industries.map((industry) => (
              <span
                key={industry}
                className="rounded-full border border-slate-700 bg-slate-950/70 px-5 py-2.5 text-sm text-slate-200"
              >
                {industry}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="bg-slate-50 p-6 text-slate-950 sm:p-10">
            <SectionIntro
              eyebrow="How KTMcore works"
              title="Simple, technical, and focused on what can be acted on."
              description="The process starts with the real problem, then uses models, drawings, simulation, and engineering review to make the next decision clearer."
              light
            />

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {processSteps.map((step, index) => (
                <div key={step} className="rounded-md border border-slate-200 bg-white p-6">
                  <span className="text-sm font-semibold text-cyan-700">
                    Step {index + 1}
                  </span>
                  <p className="mt-4 leading-7 text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800 px-6 py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
              {simulationServiceCard.title}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Simulation supports the service work when behavior needs to be seen.
            </h2>
          </div>
          <a
            href="/simulations"
            className="inline-flex min-h-12 items-center justify-center rounded-md border border-cyan-400 px-6 font-semibold text-cyan-200 transition hover:bg-cyan-400 hover:text-slate-950"
          >
            View Simulations
          </a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function ServiceCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-5 transition hover:border-cyan-400/70">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}
