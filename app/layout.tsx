import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KTM Core",
  description:
    "Autonomous drone systems, AI perception, and simulation-first engineering.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
