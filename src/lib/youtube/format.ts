export function formatDurationSeconds(total: number | null | undefined): string | null {
  if (total === null || total === undefined || !Number.isFinite(total) || total < 0) return null;
  const seconds = Math.floor(total % 60);
  const minutes = Math.floor((total / 60) % 60);
  const hours = Math.floor(total / 3600);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}