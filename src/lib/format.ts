export const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export function urgencyLabel(hours: number | null): string {
  if (hours === null) return "Shelf stable";
  if (hours <= 24) return `${hours}h freshness window`;
  return `${Math.ceil(hours / 24)} days freshness window`;
}

export function relativeActivityTime(timestamp: string): string {
  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000),
  );

  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes === 1) return "1 minute ago";
  return `${elapsedMinutes} minutes ago`;
}
