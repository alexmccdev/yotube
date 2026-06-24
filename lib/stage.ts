export type StageStatus = "done" | "active" | "pending";

export interface Stage {
  id: "catalogued" | "downloaded" | "on-yoto";
  label: string;
  status: StageStatus;
  caption?: string;
}

export interface StageCard {
  tracks: { status: string }[];
  finalized: boolean;
  yotoCardId?: string;
  pushingToYoto?: boolean;
}

/** The three checkpoints a card passes through, library-circulation-card style. */
export function getCardStages(card: StageCard): Stage[] {
  const total = card.tracks.length;
  const ready = card.tracks.filter((t) => t.status === "ready" || t.status === "tagging" || t.status === "done").length;
  const errored = card.tracks.some((t) => t.status === "error");

  const downloadStatus: StageStatus = card.finalized ? "done" : total > 0 ? "active" : "pending";
  const yotoStatus: StageStatus = card.yotoCardId ? "done" : card.pushingToYoto ? "active" : "pending";

  return [
    { id: "catalogued", label: "Catalogued", status: "done" },
    {
      id: "downloaded",
      label: "Downloaded",
      status: downloadStatus,
      caption:
        downloadStatus === "active"
          ? errored
            ? `${ready}/${total} ready — needs attention`
            : `${ready}/${total} ready`
          : undefined,
    },
    {
      id: "on-yoto",
      label: "On Yoto",
      status: yotoStatus,
      caption: yotoStatus === "active" ? "Pushing…" : undefined,
    },
  ];
}

/** One-line summary of where a card sits in its lifecycle, for compact list rows. */
export function getStatusLine(card: StageCard): { text: string; tone: "idle" | "active" | "done" | "error" } {
  const total = card.tracks.length;
  const ready = card.tracks.filter((t) => t.status === "ready" || t.status === "tagging" || t.status === "done").length;
  const errored = card.tracks.some((t) => t.status === "error");

  if (card.pushingToYoto) return { text: "Pushing to Yoto…", tone: "active" };
  if (card.yotoCardId) return { text: "On Yoto", tone: "done" };
  if (card.finalized) return { text: "Downloaded — ready to push", tone: "done" };
  if (total === 0) return { text: "Awaiting tracks", tone: "idle" };
  if (errored) return { text: `${ready}/${total} ready — needs attention`, tone: "error" };
  if (ready === total) return { text: "All tracks ready to finalize", tone: "active" };
  return { text: `Downloading — ${ready}/${total} ready`, tone: "active" };
}
