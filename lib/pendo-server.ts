const PENDO_TRACK_URL = "https://data.pendo.io/data/track";
const PENDO_INTEGRATION_KEY = process.env.PENDO_INTEGRATION_KEY;

export async function pendoTrackServer(
  event: string,
  properties: Record<string, string | number | boolean> = {},
  visitorId = "anonymous",
  accountId = "anonymous"
): Promise<void> {
  if (!PENDO_INTEGRATION_KEY) {
    console.error("[Pendo] PENDO_INTEGRATION_KEY is not set — skipping track event:", event);
    return;
  }
  try {
    await fetch(PENDO_TRACK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pendo-integration-key": PENDO_INTEGRATION_KEY,
      },
      body: JSON.stringify({
        type: "track",
        event,
        visitorId,
        accountId,
        timestamp: Date.now(),
        properties,
      }),
      signal: AbortSignal.timeout(5_000), // never let analytics block the pipeline
    });
  } catch (err) {
    console.error("[Pendo] Failed to track server event:", event, err);
  }
}
