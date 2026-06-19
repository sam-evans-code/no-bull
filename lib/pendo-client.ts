export function pendoTrackClient(
  event: string,
  properties: Record<string, string | number | boolean> = {}
): void {
  if (typeof window === "undefined" || !window.pendo) return;
  window.pendo.track(event, properties);
}
