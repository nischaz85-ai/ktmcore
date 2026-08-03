"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import type { PortfolioProject, ProjectStatus } from "../data/portfolio";

const PortfolioModelViewer = dynamic(() => import("./PortfolioModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 items-center justify-center rounded-md border border-slate-800 bg-slate-950 text-sm text-slate-400 sm:h-96">
      Loading 3D viewer…
    </div>
  ),
});

const STATUS_STYLES: Record<ProjectStatus, string> = {
  Concept: "border-slate-600 text-slate-300",
  Research: "border-sky-500/60 text-sky-300",
  Prototype: "border-amber-500/60 text-amber-300",
  Completed: "border-emerald-500/60 text-emerald-300",
};

export default function PortfolioCard({ project }: { project: PortfolioProject }) {
  const [show3D, setShow3D] = useState(false);

  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-6 transition hover:border-cyan-400/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            {project.category}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">{project.title}</h3>
        </div>
        <span
          className={[
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
            STATUS_STYLES[project.status],
          ].join(" ")}
        >
          {project.status}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-300">{project.description}</p>

      {project.software.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {project.software.map((tool) => (
            <span
              key={tool}
              className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300"
            >
              {tool}
            </span>
          ))}
        </div>
      )}

      {project.images.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {project.images.map((image, index) => (
            <div key={image} className="relative aspect-square overflow-hidden rounded-md border border-slate-800">
              <Image
                src={image}
                alt={`${project.title} preview ${index + 1}`}
                fill
                loading="lazy"
                sizes="(min-width: 1024px) 200px, 33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {project.drawingPreview && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            2D Drawing Preview
          </p>
          <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-md border border-slate-800 bg-white">
            <Image
              src={project.drawingPreview}
              alt={`${project.title} drawing preview`}
              fill
              loading="lazy"
              sizes="(min-width: 1024px) 400px, 90vw"
              className="object-contain"
            />
          </div>
        </div>
      )}

      {project.model3dUrl && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Interactive 3D Viewer
          </p>
          {show3D ? (
            <div className="mt-2">
              <PortfolioModelViewer modelUrl={project.model3dUrl} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShow3D(true)}
              className="mt-2 inline-flex min-h-10 items-center justify-center rounded-md border border-cyan-400 px-4 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400 hover:text-slate-950"
            >
              View 3D Model
            </button>
          )}
        </div>
      )}

      {project.downloadUrl && (
        <a
          href={project.downloadUrl}
          download
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          Download Drawing
        </a>
      )}
    </div>
  );
}
