const systems = [
  {
    label: "Hardware Integration",
    title: "Sense. Process. Act.",
    href: "/services#edge-robotics-hardware",
    visual: <IntegrationVisual />,
  },
  {
    label: "Automation",
    title: "Coordinate machines and material flow.",
    href: "/simulations",
    visual: <AutomationVisual />,
  },
  {
    label: "Simulation",
    title: "Test behavior before deployment.",
    href: "/simulations",
    visual: <SimulationVisual />,
  },
];

export default function EngineeringSystemsShowcase() {
  return (
    <section className="border-b border-[#eadfce] bg-[#fff8ef] px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#c85440]">More than drawings</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-[#17324d] sm:text-4xl">Physical systems, digital tools, one practical outcome.</h2>
          </div>
          <a href="/simulations" className="font-semibold text-cyan-300 transition hover:text-cyan-200">Explore interactive work →</a>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {systems.map((system) => (
            <a key={system.label} href={system.href} className="group overflow-hidden rounded-[1.5rem] border border-[#e5ddd0] bg-white transition hover:-translate-y-1 hover:border-[#f47b63] hover:shadow-2xl hover:shadow-[#17324d]/10">
              <div className="relative aspect-[4/3] overflow-hidden bg-[#07111f]">{system.visual}</div>
              <div className="p-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c85440]">{system.label}</p>
                <h3 className="mt-3 text-xl font-semibold text-[#17324d]">{system.title}</h3>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function IntegrationVisual() {
  return (
    <svg viewBox="0 0 420 315" className="h-full w-full" aria-hidden="true">
      <defs><linearGradient id="signal" x1="0" x2="1"><stop stopColor="#22d3ee"/><stop offset="1" stopColor="#3b82f6"/></linearGradient><filter id="softGlow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g stroke="#1e3a5f"><path d="M0 63 H420 M0 126 H420 M0 189 H420 M0 252 H420 M84 0 V315 M168 0 V315 M252 0 V315 M336 0 V315"/></g>
      <path d="M70 157 H165 M255 157 H350" stroke="#22d3ee" strokeWidth="3" strokeDasharray="7 7" className="system-signal"/>
      <g transform="translate(38 124)"><rect width="64" height="66" rx="10" fill="#0f2238" stroke="#38bdf8"/><circle cx="32" cy="26" r="11" fill="none" stroke="#67e8f9" strokeWidth="3"/><path d="M17 50 H47" stroke="#64748b" strokeWidth="4"/></g>
      <g transform="translate(165 102)" filter="url(#softGlow)"><path d="M18 0 H72 L90 18 V92 H0 V18 Z" fill="#0b1f36" stroke="url(#signal)" strokeWidth="2"/><circle cx="45" cy="46" r="20" fill="#082f49" stroke="#22d3ee" strokeWidth="3"/><circle cx="45" cy="46" r="6" fill="#a5f3fc"/><g fill="#38bdf8"><circle cx="12" cy="16" r="3"/><circle cx="78" cy="16" r="3"/><circle cx="12" cy="80" r="3"/><circle cx="78" cy="80" r="3"/></g></g>
      <g transform="translate(333 111)" fill="none" stroke="#60a5fa" strokeWidth="5"><path d="M18 80 V39 L38 18 L53 33 L38 48 L54 64"/><circle cx="38" cy="18" r="8"/><path d="M3 81 H69"/></g>
      <g fill="#94a3b8" fontFamily="Arial" fontSize="10" fontWeight="700" textAnchor="middle"><text x="70" y="210">SENSOR</text><text x="210" y="219">EDGE CONTROL</text><text x="370" y="210">ACTUATOR</text></g>
    </svg>
  );
}

function AutomationVisual() {
  return (
    <svg viewBox="0 0 420 315" className="h-full w-full" aria-hidden="true">
      <rect x="28" y="218" width="364" height="25" rx="4" fill="#13263d" stroke="#475569"/><path d="M43 230 H377" stroke="#22d3ee" strokeWidth="3" strokeDasharray="18 10" className="system-flow"/>
      <g fill="#1e3a5f" stroke="#60a5fa"><rect x="65" y="184" width="45" height="34"/><rect x="182" y="184" width="45" height="34"/><rect x="300" y="184" width="45" height="34"/></g>
      <g transform="translate(205 52)" fill="none" stroke="#67e8f9" strokeWidth="9" strokeLinecap="round"><path d="M0 122 L-25 78 L10 48 L35 81 L66 45"/><circle cx="-25" cy="78" r="11" fill="#082f49"/><circle cx="10" cy="48" r="10" fill="#082f49"/><circle cx="35" cy="81" r="10" fill="#082f49"/><path d="M63 42 l22-9 6 15-21 11z" fill="#0f2238" strokeWidth="3"/></g>
      <path d="M50 167 C105 97 142 117 184 94 M276 93 C319 109 345 89 377 54" fill="none" stroke="#334155" strokeWidth="2" strokeDasharray="5 6"/>
      <g fill="#22d3ee"><circle cx="50" cy="167" r="5"/><circle cx="184" cy="94" r="5"/><circle cx="276" cy="93" r="5"/><circle cx="377" cy="54" r="5"/></g>
      <text x="30" y="282" fill="#64748b" fontFamily="Arial" fontSize="10" fontWeight="700">COORDINATED MATERIAL HANDLING</text>
    </svg>
  );
}

function SimulationVisual() {
  return (
    <svg viewBox="0 0 420 315" className="h-full w-full" aria-hidden="true">
      <g stroke="#17304b"><path d="M0 63 H420 M0 126 H420 M0 189 H420 M0 252 H420 M70 0 V315 M140 0 V315 M210 0 V315 M280 0 V315 M350 0 V315"/></g>
      <path d="M38 244 C92 219 93 151 151 155 S224 231 270 178 S314 73 382 80" fill="none" stroke="#22d3ee" strokeWidth="4" strokeDasharray="9 8" className="system-flow"/>
      <g fill="#07111f" stroke="#64748b" strokeWidth="2"><circle cx="108" cy="117" r="27"/><circle cx="239" cy="112" r="35"/><circle cx="323" cy="225" r="29"/></g>
      <g transform="translate(257 158)"><path d="M0 16 L28 0 L54 15 L27 31 Z" fill="#2563eb" stroke="#93c5fd"/><path d="M0 16 V31 L27 47 V31 M54 15 V30 L27 47" fill="#1e40af" stroke="#60a5fa"/><circle cx="27" cy="24" r="5" fill="#a5f3fc"/></g>
      <g fill="#22d3ee" filter="url(#softGlow)"><circle cx="38" cy="244" r="6"/><circle cx="382" cy="80" r="7"/></g>
      <g fill="#94a3b8" fontFamily="Arial" fontSize="9" fontWeight="700"><text x="25" y="279">PATH 02 / COLLISION CLEAR</text><text x="288" y="279">LIVE MODEL</text></g>
    </svg>
  );
}
