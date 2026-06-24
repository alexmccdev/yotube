export type TrackStatus =
  | "queued"
  | "fetching"
  | "downloading"
  | "ready"
  | "tagging"
  | "done"
  | "error";

export const STATUS_LABEL: Record<TrackStatus, string> = {
  queued: "Queued",
  fetching: "Fetching",
  downloading: "Downloading",
  ready: "Ready",
  tagging: "Tagging",
  done: "Done",
  error: "Error",
};

/** Tailwind classes for the pill background/text/dot per status, sharing one visual language. */
export const STATUS_STYLE: Record<TrackStatus, { pill: string; dot: string }> = {
  queued: { pill: "bg-zinc-600 text-white", dot: "bg-zinc-300" },
  fetching: { pill: "bg-blue-600 text-white", dot: "bg-blue-200" },
  downloading: { pill: "bg-blue-600 text-white", dot: "bg-blue-200" },
  ready: { pill: "bg-teal-600 text-white", dot: "bg-teal-200" },
  tagging: { pill: "bg-amber-600 text-white", dot: "bg-amber-200" },
  done: { pill: "bg-green-600 text-white", dot: "bg-green-200" },
  error: { pill: "bg-red-600 text-white", dot: "bg-red-200" },
};
