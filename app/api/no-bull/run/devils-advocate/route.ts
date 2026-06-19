import { handleStageRequest } from "@/lib/stage-runner";
import { runDevilsAdvocate } from "@/lib/stages/devils-advocate";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStageRequest(request, {
    name: "devils-advocate",
    nextPath: "/api/no-bull/run/fact-check-extract",
    run: async (job) => ({
      devilsAdvocateCase: await runDevilsAdvocate(job.results.reframedQuestion, job.results.stressTest),
    }),
  });
}
