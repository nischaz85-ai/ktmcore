import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KTMcore | Mechanical CAD, Edge Hardware, Civil CAD, and Robotic Simulation",
  description:
    "Mechanical CAD design, SolidWorks parts and assemblies, edge-device and robotics hardware development, civil CAD support, and advanced robotic simulation.",
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
