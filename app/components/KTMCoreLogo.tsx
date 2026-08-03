type KTMCoreLogoProps = {
  className?: string;
  showTagline?: boolean;
};

export default function KTMCoreLogo({ className = "", showTagline = false }: KTMCoreLogoProps) {
  const height = showTagline ? 116 : 58;

  return (
    <svg
      viewBox={`0 0 340 ${height}`}
      className={className}
      role="img"
      aria-labelledby="ktmcore-logo-title"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="ktmcore-logo-title">KTMCore Engineering Services</title>
      <defs>
        <linearGradient id="ktmcore-signal" x1="4" y1="54" x2="65" y2="5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <filter id="ktmcore-glow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Precision-cut hexagonal housing */}
      <g transform="translate(3 1)">
        <path d="M17 6 H48 L62 20 V39 L48 54 H17 L3 39 V20 Z" fill="#0f172a" stroke="#475569" strokeWidth="1.5" />
        <path d="M17 6 H48 L62 20" fill="none" stroke="url(#ktmcore-signal)" strokeWidth="3.5" />
        <path d="M62 39 L48 54 H17 L3 39" fill="none" stroke="url(#ktmcore-signal)" strokeWidth="3.5" />

        {/* Structural K and central core */}
        <path d="M18 16 V45 M19 31 H29 M29 31 L43 16 M29 31 L44 46" fill="none" stroke="#f8fafc" strokeWidth="5" strokeLinecap="square" strokeLinejoin="miter" />
        <circle cx="29" cy="31" r="5.5" fill="#0f172a" stroke="#22d3ee" strokeWidth="3" filter="url(#ktmcore-glow)" />

        {/* Connected engineering nodes */}
        <path d="M47 17 L54 24 M47 45 L54 38" stroke="#22d3ee" strokeWidth="1.6" />
        <circle cx="55" cy="25" r="2.5" fill="#60a5fa" />
        <circle cx="55" cy="37" r="2.5" fill="#22d3ee" />
      </g>

      {/* Digital-first wordmark */}
      <g fontFamily="Arial, Helvetica, sans-serif" fontWeight="800">
        <text x="79" y="36" fill="currentColor" fontSize="29" letterSpacing="-1.4">KTM</text>
        <text x="143" y="36" fill="url(#ktmcore-signal)" fontSize="29" letterSpacing="1.4">CORE</text>
      </g>
      <text x="81" y="51" fill="#94a3b8" fontFamily="Arial, Helvetica, sans-serif" fontSize="9" fontWeight="700" letterSpacing="3.15">
        ENGINEERING SYSTEMS
      </text>

      {showTagline && (
        <g fontFamily="Arial, Helvetica, sans-serif">
          <path d="M80 70 H309" stroke="#334155" />
          <path d="M80 70 H137" stroke="url(#ktmcore-signal)" strokeWidth="2.5" />
          <text x="80" y="91" fill="currentColor" fontSize="12" fontWeight="700" letterSpacing=".25">Engineering What&apos;s Next.</text>
          <text x="80" y="108" fill="#94a3b8" fontSize="12" fontWeight="600" letterSpacing=".25">Building What Matters.</text>
        </g>
      )}
    </svg>
  );
}
