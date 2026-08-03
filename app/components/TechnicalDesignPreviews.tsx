export default function TechnicalDesignPreviews() {
  return (
    <section className="border-y border-[#d7e6dc] bg-[#eef7e9] px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#28734c]">From problem to usable output</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#17324d] sm:text-4xl">Engineering ideas made easier to evaluate and act on.</h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <PreviewCard eyebrow="Mechanical CAD" title="Mounting bracket drawing" href="/services#mechanical-cad" linkLabel="Explore CAD services">
            <CadSheet />
          </PreviewCard>
          <PreviewCard eyebrow="Emergency planning" title="Facility response plan" href="/contact" linkLabel="Discuss a planning project">
            <EmergencySheet />
          </PreviewCard>
        </div>

        <p className="mt-5 text-xs leading-5 text-[#6b7f78]">Representative examples only. Emergency plans require review and approval by the facility owner and appropriate qualified authorities.</p>
      </div>
    </section>
  );
}

function PreviewCard({ eyebrow, title, href, linkLabel, children }: { eyebrow: string; title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <article className="group overflow-hidden rounded-[1.5rem] border border-[#ceddce] bg-white shadow-xl shadow-[#17324d]/8 transition hover:-translate-y-1 hover:border-[#76a87b]">
      <div className="aspect-[16/10] border-b border-slate-700 bg-slate-200 p-3 sm:p-5">{children}</div>
      <div className="p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#28734c]">{eyebrow}</p>
        <h3 className="mt-3 text-2xl font-semibold text-[#17324d]">{title}</h3>
        <a href={href} className="mt-5 inline-flex font-semibold text-cyan-300 transition group-hover:text-cyan-200">{linkLabel}<span className="ml-2" aria-hidden="true">→</span></a>
      </div>
    </article>
  );
}

function CadSheet() {
  return (
    <svg viewBox="0 0 640 400" className="h-full w-full bg-white shadow-sm" role="img" aria-label="Mechanical mounting bracket technical drawing">
      <defs>
        <linearGradient id="baseTop" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e5e7eb"/><stop offset="1" stopColor="#94a3b8"/></linearGradient>
        <linearGradient id="upright" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f1f5f9"/><stop offset="1" stopColor="#a8b5c5"/></linearGradient>
        <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#64748b"/><stop offset="1" stopColor="#334155"/></linearGradient>
        <filter id="shadow"><feDropShadow dx="4" dy="7" stdDeviation="5" floodColor="#0f172a" floodOpacity=".2"/></filter>
      </defs>
      <rect x="8" y="8" width="624" height="384" fill="none" stroke="#334155"/>
      <text x="25" y="29" fontFamily="Arial" fontSize="12" fontWeight="700" fill="#0f172a">WELDED SENSOR MOUNT — ISOMETRIC</text>
      <text x="25" y="43" fontFamily="Arial" fontSize="8" fill="#64748b">ALL DIMENSIONS IN MILLIMETERS  |  DEBURR ALL EDGES</text>
      <g transform="translate(310 200)" stroke="#334155" strokeWidth="1.6" strokeLinejoin="round" filter="url(#shadow)">
        {/* 10 mm base plate */}
        <path d="M-188 49 L-27 131 L183 22 L23-59 Z" fill="url(#baseTop)"/>
        <path d="M-188 49 V66 L-27 149 V131 Z" fill="url(#edge)"/>
        <path d="M-27 131 V149 L183 40 V22 Z" fill="#475569"/>
        {/* vertical 8 mm mounting plate */}
        <path d="M-73 27 V-105 L47-167 V-35 Z" fill="url(#upright)"/>
        <path d="M47-167 L62-159 V-27 L47-35 Z" fill="url(#edge)"/>
        {/* triangular welded gussets */}
        <path d="M-69 27 L-8 61 L-69-29 Z" fill="#9ca3af"/>
        <path d="M43-31 L101 1 L43-88 Z" fill="#7b8796"/>
        {/* vertical adjustment slot */}
        <path d="M-20-107 C-20-120 3-132 14-125 C19-121 20-114 20-105 L20-66 C20-53-3-41-14-48 C-19-52-20-59-20-68 Z" fill="#334155"/>
        <path d="M-14-105 C-14-114 1-122 8-118 C11-115 12-111 12-104 V-68 C12-59-3-51-9-55 C-13-58-14-62-14-69 Z" fill="#f8fafc" stroke="#64748b"/>
        {/* counterbored base holes */}
        <g fill="#475569"><ellipse cx="-122" cy="55" rx="23" ry="13"/><ellipse cx="95" cy="40" rx="23" ry="13"/><ellipse cx="-16" cy="106" rx="22" ry="12"/></g>
        <g fill="#e2e8f0"><ellipse cx="-122" cy="55" rx="12" ry="7"/><ellipse cx="95" cy="40" rx="12" ry="7"/><ellipse cx="-16" cy="106" rx="11" ry="6"/></g>
        {/* weld beads */}
        <path d="M-72 28 L-57 36 L-43 43 L-29 51" fill="none" stroke="#475569" strokeWidth="4" strokeDasharray="5 4"/>
        <path d="M44-30 L58-22 L72-15 L87-7" fill="none" stroke="#475569" strokeWidth="4" strokeDasharray="5 4"/>
      </g>
      <g fill="none" stroke="#64748b" strokeWidth="1"><path d="M108 251 V303 M284 343 V363 M108 349 H284"/><path d="M244 90 H177 M228 141 H177 M183 90 V141"/><path d="M395 132 H508"/></g>
      <g fill="#0f172a" fontFamily="Arial" fontSize="9"><text x="176" y="359">225 ±0.5</text><text x="150" y="119" transform="rotate(-90 150 119)">132 ±0.5</text><text x="511" y="135">SLOT 14 × 60</text><text x="446" y="188">8 mm PLATE</text><text x="80" y="291">3X Ø11 THRU</text><text x="80" y="303">C'BORE Ø20 × 5</text></g>
      <g transform="translate(34 328)" fontFamily="Arial" fontSize="8" fill="#334155"><text x="0" y="0" fontWeight="700">NOTES</text><text x="0" y="14">1. 6 mm FILLET WELD BOTH SIDES</text><text x="0" y="27">2. POWDER COAT, RAL 7016</text><text x="0" y="40">3. VERIFY SENSOR INTERFACE BEFORE FABRICATION</text></g>
      <g transform="translate(382 318)" fontFamily="Arial" fill="#0f172a">
        <rect width="250" height="74" fill="white" stroke="#334155"/><path d="M0 25 H250 M0 48 H250 M80 25 V74 M178 25 V74" stroke="#334155"/>
        <text x="8" y="17" fontSize="11" fontWeight="700">KTMCORE — SENSOR MOUNT</text>
        <text x="8" y="40" fontSize="8">MATERIAL</text><text x="88" y="40" fontSize="8">A36 STEEL</text><text x="185" y="40" fontSize="8">REV A</text>
        <text x="8" y="63" fontSize="8">SCALE</text><text x="88" y="63" fontSize="8">1:2</text><text x="185" y="63" fontSize="8">SHEET 1 / 1</text>
      </g>
    </svg>
  );
}

function EmergencySheet() {
  return (
    <svg viewBox="0 0 640 400" className="h-full w-full bg-white shadow-sm" role="img" aria-label="Illustrative emergency response site plan">
      <rect x="8" y="8" width="624" height="384" fill="none" stroke="#334155"/>
      <text x="25" y="29" fontFamily="Arial" fontSize="13" fontWeight="700" fill="#0f172a">FACILITY EMERGENCY RESPONSE PLAN</text>
      <text x="25" y="43" fontFamily="Arial" fontSize="8" fill="#64748b">ILLUSTRATIVE SITE COORDINATION EXAMPLE</text>
      <g transform="translate(34 52)">
        <rect x="12" y="12" width="560" height="266" fill="#f8fafc" stroke="#64748b"/>
        <path d="M58 48 H230 V137 H58 Z M296 44 H470 V130 H296 Z M74 180 H250 V242 H74 Z M326 171 H486 V244 H326 Z" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5"/>
        <g stroke="#94a3b8"><path d="M144 48 V137 M383 44 V130 M162 180 V242 M406 171 V244"/><path d="M58 94 H230 M296 88 H470"/></g>
        <path d="M28 253 C105 253 92 151 270 151 S464 142 544 27" fill="none" stroke="#0284c7" strokeWidth="5" strokeDasharray="10 7"/><path d="M536 25 l-18-3 11 16z" fill="#0284c7"/>
        <circle cx="278" cy="111" r="12" fill="#e11d48"/><path d="M272 105 l12 12 m0-12 l-12 12" stroke="white" strokeWidth="2"/>
        <rect x="17" y="225" width="25" height="25" rx="2" fill="#16a34a"/><path d="M29.5 230 v15 m-7.5-7.5 h15" stroke="white" strokeWidth="2"/>
        <path d="M489 217 l13 23 h-26z" fill="#f59e0b"/>
        <g fontFamily="Arial" fontSize="8" fill="#334155"><text x="58" y="42">PRODUCTION</text><text x="296" y="38">WAREHOUSE</text><text x="74" y="174">OFFICES</text><text x="326" y="165">UTILITIES</text><text x="12" y="273" fill="#0369a1" fontWeight="700">ASSEMBLY A</text><text x="495" y="18" fill="#0369a1" fontWeight="700">EMS ENTRY</text><text x="296" y="114" fill="#be123c">INCIDENT</text></g>
      </g>
      <g transform="translate(380 326)" fontFamily="Arial" fontSize="8"><rect width="252" height="66" fill="white" stroke="#334155"/><path d="M125 0 V66" stroke="#334155"/><text x="10" y="17" fill="#0369a1">━━ RESPONSE ROUTE</text><text x="10" y="35" fill="#15803d">✚ FIRST AID</text><text x="10" y="53" fill="#be123c">● INCIDENT</text><text x="135" y="17" fill="#0f172a" fontWeight="700">KTMCORE</text><text x="135" y="35" fill="#475569">SCALE: NTS</text><text x="135" y="53" fill="#475569">REV: CONCEPT</text></g>
    </svg>
  );
}
