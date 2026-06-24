import { type Stage } from "@/lib/stage";

export default function StageRail({ stages }: { stages: Stage[] }) {
  return (
    <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] uppercase tracking-wider">
      {stages.map((stage, i) => (
        <div key={stage.id} className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <span
              className={
                stage.status === "done"
                  ? "stage-stamp text-ink-text"
                  : stage.status === "active"
                    ? "flex items-center gap-1.5 text-ink-text/70"
                    : "text-ink-text/30"
              }
            >
              {stage.status === "active" && (
                <span className="h-1.5 w-1.5 rounded-full bg-brass animate-pulse" />
              )}
              {stage.label}
            </span>
            {stage.caption && (
              <span className="normal-case text-[10px] tracking-normal text-ink-text/50 pl-0.5">
                {stage.caption}
              </span>
            )}
          </div>
          {i < stages.length - 1 && <span className="h-px w-5 bg-ink-text/15 shrink-0" />}
        </div>
      ))}
    </div>
  );
}
