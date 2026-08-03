const plans = [
  {
    title: "Site Layout Plan",
    discipline: "Civil / Site Coordination",
    image: "/plan-previews/site-plan.jpg",
  },
  {
    title: "Electrical Plan",
    discipline: "Electrical Coordination",
    image: "/plan-previews/electrical-plan.jpg",
  },
  {
    title: "HVAC & Plumbing Plan",
    discipline: "Building Systems Coordination",
    image: "/plan-previews/hvac-plan.jpg",
  },
];

export default function CompanyPlanGallery() {
  return (
    <section className="bg-[#fbfaf6] px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#176b87]">Technical documentation</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#17324d]">Selected plan examples.</h2>
          </div>
          <p className="max-w-xl leading-7 text-[#5c7284]">Site, electrical, and building-system examples created by KTMcore.</p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.title} className="overflow-hidden rounded-2xl border border-[#dedbd2] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
              <div className="relative aspect-[16/9] overflow-hidden border-b border-slate-700 bg-white select-none touch-none">
                <img
                  src={plan.image}
                  alt={`${plan.title} reduced-resolution company sample`}
                  draggable={false}
                  loading="lazy"
                  className="h-full w-full pointer-events-none select-none object-cover object-center"
                />
                <div className="absolute inset-0 z-10" aria-hidden="true" />
                <span className="absolute bottom-3 left-3 z-20 rounded bg-slate-950/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow">
                  Preview only
                </span>
              </div>
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c85440]">{plan.discipline}</p>
                <h3 className="mt-2 text-lg font-semibold text-[#17324d]">{plan.title}</h3>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-[#efd8c9] bg-[#fff0e8] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-sm leading-6 text-[#5c7284]">
            These reduced-resolution, watermarked plans are portfolio examples only—not
            permit documents, construction documents, or instructions for field use.
          </p>
          <a href="/contact" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#f47b63] px-5 font-semibold text-white transition hover:bg-[#df654f]">
            Discuss a Plan Set
          </a>
        </div>
      </div>
    </section>
  );
}
