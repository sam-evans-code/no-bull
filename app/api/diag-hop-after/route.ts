import { after, NextResponse } from "next/server";

export const maxDuration = 30;

// Throwaway diagnostic, same precedent as app/api/diag-hop/route.ts and the
// smoke-c/smoke-d routes in CLAUDE.md addendum #2. Unlike diag-hop (a plain
// synchronously-awaited recursive fetch, which tested clean to depth 6),
// this mirrors the real pipeline's actual shape: ack 202 immediately, then
// fetch the next hop from *inside* after(), chained from the previous hop's
// own after(). That nested-after() structure is the one thing diag-hop didn't
// test. Delete both diag-hop routes once the real bug is fixed.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    depth?: number;
    trail?: string[];
    runId?: string;
  };
  const depth = body.depth ?? 0;
  const trail = body.trail ?? [];
  const runId = body.runId ?? `r${depth}`;

  console.log(`[diag-hop-after] runId=${runId} depth=${depth} trail=${trail.join(">")}`);

  if (depth <= 0) {
    console.log(`[diag-hop-after] runId=${runId} reached base`);
    return NextResponse.json({ reachedBase: true, trail: [...trail, "base"] });
  }

  const origin = new URL(request.url).origin;
  after(async () => {
    try {
      const response = await fetch(`${origin}/api/diag-hop-after`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depth: depth - 1, trail: [...trail, `hop@depth${depth}`], runId }),
        signal: AbortSignal.timeout(15_000),
      });
      console.log(
        `[diag-hop-after] runId=${runId} depth=${depth} downstream status=${response.status} ok=${response.ok}`
      );
    } catch (err) {
      console.error(`[diag-hop-after] runId=${runId} depth=${depth} downstream fetch threw:`, err);
    }
  });

  return NextResponse.json({ depth, acked: true }, { status: 202 });
}
