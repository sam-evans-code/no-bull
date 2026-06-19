import { handleStageRequest } from "@/lib/stage-runner";
import { runStressTest } from "@/lib/stages/stress-test";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStageRequest(request, {
    name: "stress-test",
    nextPath: "/api/no-bull/run/devils-advocate",
    run: async (job) => {
      const { stressTest, couldBeWrong } = await runStressTest(job.results.reframedQuestion);
      return { stressTest, couldBeWrong };
    },
  });
}
