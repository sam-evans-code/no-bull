import { NextRequest, NextResponse } from "next/server";
import { pendoTrackServer } from "@/lib/pendo-server";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  // Body contains stressTestOutput and devilsAdvocateOutput for claim extraction
  await request.json();

  // TODO: Extract atomic factual claims from Stage 2 + Stage 4 outputs and
  // web-search-verify each one via OpenAI API (Session 6)
  const claims: Array<{
    claim: string;
    verdict: "supported" | "contradicted" | "unverifiable";
    source?: string;
  }> = [];
  const subjectiveClaimsSkipped = 0;

  const supportedCount = claims.filter(
    (c) => c.verdict === "supported"
  ).length;
  const contradictedCount = claims.filter(
    (c) => c.verdict === "contradicted"
  ).length;
  const unverifiableCount = claims.filter(
    (c) => c.verdict === "unverifiable"
  ).length;

  // Pendo Track: fact_check_completed — fires after Stage 5 claim verification finishes
  await pendoTrackServer("fact_check_completed", {
    total_claims_extracted: claims.length,
    supported_count: supportedCount,
    contradicted_count: contradictedCount,
    unverifiable_count: unverifiableCount,
    subjective_claims_skipped: subjectiveClaimsSkipped,
    sources_found_count: claims.filter((c) => c.source).length,
    duration_ms: Date.now() - startTime,
  });

  return NextResponse.json({ claims });
}
