export default function SectionIntro({
  index,
  eyebrow,
  title,
  description,
  light = false,
}: {
  index?: string;
  eyebrow: string;
  title: string;
  description: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3">
        {index && (
          <span
            className={[
              "font-mono text-xs tabular-nums",
              light ? "text-cyan-700" : "text-cyan-400/70",
            ].join(" ")}
          >
            {index}
          </span>
        )}
        {index && (
          <span className={["h-px w-6", light ? "bg-slate-300" : "bg-slate-700"].join(" ")} />
        )}
        <p
          className={[
            "text-sm font-semibold uppercase tracking-[0.22em]",
            light ? "text-cyan-700" : "text-cyan-300",
          ].join(" ")}
        >
          {eyebrow}
        </p>
      </div>
      <h2
        className={[
          "mt-3 text-3xl font-semibold leading-tight sm:text-4xl",
          light ? "text-slate-950" : "text-white",
        ].join(" ")}
      >
        {title}
      </h2>
      <p className={["mt-4 leading-7", light ? "text-slate-700" : "text-slate-300"].join(" ")}>
        {description}
      </p>
    </div>
  );
}
