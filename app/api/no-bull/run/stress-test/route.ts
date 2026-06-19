import { handleStageRequest } from "@/lib/stage-runner";
import { runStressTestAnalysis } from "@/lib/stages/stress-test";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStageRequest(request, {
    name: "stress-test",
    nextPath: "/api/no-bull/run/could-be-wrong",
    run: async (job) => ({
      stressTest: await runStressTestAnalysis(job.results.reframedQuestion),
    }),
  });
}
