"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import KTMCoreLogo from "./KTMCoreLogo";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "Simulations", href: "/simulations" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Contact", href: "/contact" },
];

export default function Navbar() {
  const pathname = usePathname();
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
          ? "bg-[#fbfaf6]/95 backdrop-blur-md border-b border-[#d7e1df] shadow-sm"
          : "bg-[#fbfaf6]/85 backdrop-blur-md",
      ].join(" ")}
    >
      <nav
        className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <Link
          href="/"
          aria-label="KTMCore home"
          className="rounded text-[#17324d] focus:outline-none focus:ring-2 focus:ring-[#f47b63]"
        >
          <KTMCoreLogo className="h-12 w-[250px] max-w-[58vw]" />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#49657a]">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  "transition focus:outline-none focus:ring-2 focus:ring-[#f47b63] rounded",
                  active ? "text-[#176b87]" : "hover:text-[#17324d]",
                ].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* CTA + Mobile Toggle */}
        <div className="flex items-center gap-4">
          <Link
            href="/contact"
            className="hidden rounded-full bg-[#f47b63] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#df654f] focus:outline-none focus:ring-2 focus:ring-[#f47b63] sm:inline-block"
          >
            Request a Quote
          </Link>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="rounded p-2 focus:outline-none focus:ring-2 focus:ring-[#f47b63] lg:hidden"
          >
            <span className="mb-1 block h-0.5 w-6 bg-[#17324d]" />
            <span className="mb-1 block h-0.5 w-6 bg-[#17324d]" />
            <span className="block h-0.5 w-6 bg-[#17324d]" />
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="border-t border-[#d7e1df] bg-[#fbfaf6] lg:hidden">
          <div className="flex flex-col gap-4 px-6 py-4 text-sm text-[#49657a]">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={[
                  "transition",
                  pathname === link.href ? "text-[#176b87]" : "hover:text-[#17324d]",
                ].join(" ")}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/contact"
              onClick={() => setMenuOpen(false)}
              className="mt-2 inline-block rounded-full bg-[#f47b63] px-4 py-2 text-center font-semibold text-white transition hover:bg-[#df654f]"
            >
              Request a Quote
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
