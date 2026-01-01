"use client";

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-black/60 backdrop-blur-md border-b border-gray-800">
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <div className="text-lg font-semibold tracking-wide">
          KTM<span className="text-cyan-400">Core</span>
        </div>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-300">
          <a href="#work" className="hover:text-white transition">
            Work
          </a>
          <a href="#tech" className="hover:text-white transition">
            Technology
          </a>
          <a href="#simulation" className="hover:text-white transition">
            Simulation
          </a>
          <a href="#contact" className="hover:text-white transition">
            Contact
          </a>
        </div>

        {/* CTA */}
        <button className="px-4 py-2 text-sm border border-cyan-400 text-cyan-400 rounded-md hover:bg-cyan-400 hover:text-black transition">
          Get in Touch
        </button>

      </nav>
    </header>
  );
}
