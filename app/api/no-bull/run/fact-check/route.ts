import { handleStageRequest } from "@/lib/stage-runner";
import { runFactCheck } from "@/lib/stages/fact-check";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStageRequest(request, {
    name: "fact-check",
    terminal: false,
    run: async (job) => ({
      factCheck: await runFactCheck(job.results.factCheckClaims),
    }),
  });
}
