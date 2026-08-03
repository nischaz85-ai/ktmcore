import ContactForm from "../components/ContactForm";
import Navbar from "../components/Navbar";
import SiteFooter from "../components/SiteFooter";

const contactPrompts = [
  "AI-assisted concept development, visualization, or CAD refinement",
  "Mechanical CAD, SolidWorks, or fabrication drawing support",
  "Edge-device enclosure, sensor mount, or robotics hardware integration",
  "Civil CAD, grading, drainage, utility layout, cleanup, or as-built updates",
  "Robotic simulation, path planning, or technical visualization",
];

export default function ContactPage() {
  return (
    <main className="business-page min-h-screen bg-[#fbfaf6] text-[#17324d]">
      <Navbar />

      <section className="px-6 pb-24 pt-32">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Contact
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl">
              Get a clear scope and quote for your project.
            </h1>
            <p className="mt-6 leading-7 text-slate-300">
              Share what you have, what you need delivered, and your target
              timeline. KTMcore will review the request and reply with the next step.
            </p>

            <div className="mt-8 grid gap-3">
              {contactPrompts.map((prompt) => (
                <div key={prompt} className="flex items-start gap-3">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
                  <p className="text-sm leading-6 text-slate-300">{prompt}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-5 sm:p-6">
            <ContactForm />
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
