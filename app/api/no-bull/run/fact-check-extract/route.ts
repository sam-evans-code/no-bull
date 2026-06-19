import { handleStageRequest } from "@/lib/stage-runner";
import { runFactCheckExtract } from "@/lib/stages/fact-check";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStageRequest(request, {
    name: "fact-check-extract",
    nextPath: "/api/no-bull/run/fact-check",
    run: async (job) => {
      const { claims } = await runFactCheckExtract(
        job.results.stressTest,
        job.results.devilsAdvocateCase
      );
      return { factCheckClaims: claims };
    },
  });
}
