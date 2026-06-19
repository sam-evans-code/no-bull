import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { depth?: number; trail?: string[] };
  const depth = body.depth ?? 0;
  const trail = body.trail ?? [];

  if (depth <= 0) {
    return NextResponse.json({ reachedBase: true, trail: [...trail, "base"] });
  }

  const origin = new URL(request.url).origin;
  try {
    const response = await fetch(`${origin}/api/diag-hop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depth: depth - 1, trail: [...trail, `hop@depth${depth}`] }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    return NextResponse.json({
      depth,
      downstreamStatus: response.status,
      downstreamOk: response.ok,
      downstreamHeaders: Object.fromEntries(response.headers.entries()),
      downstreamBody: text.slice(0, 500),
    });
  } catch (err) {
    return NextResponse.json({ depth, error: String(err) });
  }
}
