export function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A stable, presentational "catalog number" derived from a card's id. */
export function catalogNumber(cardId: string): string {
  return cardId.replace(/-/g, "").slice(0, 4).toUpperCase();
}
