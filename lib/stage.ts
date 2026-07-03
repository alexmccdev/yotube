export type StageStatus = "done" | "active" | "pending";

export interface Stage {
  id: "created" | "editing" | "staged" | "on-yoto";
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

/** The four checkpoints a card passes through, library-circulation-card style. */
export function getCardStages(card: StageCard): Stage[] {
  const total = card.tracks.length;
  const ready = card.tracks.filter((t) => t.status === "ready" || t.status === "done").length;
  const errored = card.tracks.some((t) => t.status === "error");

  const editingStatus: StageStatus = card.finalized ? "done" : "active";
  const stagedStatus: StageStatus = card.finalized ? "done" : "pending";
  const yotoStatus: StageStatus = card.yotoCardId ? "done" : card.pushingToYoto ? "active" : "pending";

  return [
    { id: "created", label: "Created", status: "done" },
    {
      id: "editing",
      label: "Editing",
      status: editingStatus,
      caption:
        editingStatus === "active" && total > 0
          ? errored
            ? `${ready}/${total} ready — needs attention`
            : `${ready}/${total} ready`
          : undefined,
    },
    { id: "staged", label: "Staged", status: stagedStatus },
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
  const ready = card.tracks.filter((t) => t.status === "ready" || t.status === "done").length;
  const errored = card.tracks.some((t) => t.status === "error");

  if (card.pushingToYoto) return { text: "Pushing to Yoto…", tone: "active" };
  if (card.yotoCardId) return { text: "On Yoto", tone: "done" };
  if (card.finalized) return { text: "Staged — ready to push", tone: "done" };
  if (total === 0) return { text: "Awaiting tracks", tone: "idle" };
  if (errored) return { text: `${ready}/${total} ready — needs attention`, tone: "error" };
  if (ready === total) return { text: "All tracks ready to stage", tone: "active" };
  return { text: `Downloading — ${ready}/${total} ready`, tone: "active" };
}
