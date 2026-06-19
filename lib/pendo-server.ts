const PENDO_TRACK_URL = "https://data.pendo.io/data/track";
const PENDO_INTEGRATION_KEY = process.env.PENDO_INTEGRATION_KEY as string;

export async function pendoTrackServer(
  event: string,
  properties: Record<string, string | number | boolean> = {},
  visitorId = "anonymous",
  accountId = "anonymous"
): Promise<void> {
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
    });
  } catch (err) {
    console.error("[Pendo] Failed to track server event:", event, err);
  }
}
