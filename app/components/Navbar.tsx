"use client";

import { useEffect, useState } from "react";

const NAV_LINKS = [
  { label: "Work", href: "#work" },
  { label: "Technology", href: "#tech" },
  { label: "Simulation", href: "#simulation" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={[
        "fixed top-0 left-0 w-full z-50 transition-all",
        scrolled
          ? "bg-black/80 backdrop-blur-md border-b border-gray-800"
          : "bg-black/50 backdrop-blur-md",
      ].join(" ")}
    >
      <nav
        className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <a
          href="#"
          className="text-lg font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded"
        >
          KTM<span className="text-cyan-400">Core</span>
        </a>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-300">
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-white transition focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA + Mobile Toggle */}
        <div className="flex items-center gap-4">
          <a
            href="#contact"
            className="hidden sm:inline-block px-4 py-2 text-sm border border-cyan-400 text-cyan-400 rounded-md hover:bg-cyan-400 hover:text-black transition focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            Get in Touch
          </a>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="md:hidden p-2 rounded focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <span className="block w-6 h-0.5 bg-gray-300 mb-1" />
            <span className="block w-6 h-0.5 bg-gray-300 mb-1" />
            <span className="block w-6 h-0.5 bg-gray-300" />
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-black/95 border-t border-gray-800">
          <div className="px-6 py-4 flex flex-col gap-4 text-sm text-gray-300">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="hover:text-white transition"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#contact"
              onClick={() => setMenuOpen(false)}
              className="mt-2 inline-block px-4 py-2 text-center border border-cyan-400 text-cyan-400 rounded-md hover:bg-cyan-400 hover:text-black transition"
            >
              Get in Touch
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
