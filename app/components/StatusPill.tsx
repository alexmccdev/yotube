import { STATUS_LABEL, STATUS_STYLE, type TrackStatus } from "@/lib/track-status";

const VISIBLE_STATUSES: TrackStatus[] = ["queued", "fetching", "downloading", "error"];

export default function StatusPill({ status }: { status: TrackStatus }) {
  if (!VISIBLE_STATUSES.includes(status)) return null;
  const style = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wide px-2.5 py-1 rounded-full ${style.pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
