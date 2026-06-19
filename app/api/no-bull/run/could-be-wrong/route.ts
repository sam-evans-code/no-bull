import { handleStageRequest } from "@/lib/stage-runner";
import { runCouldBeWrong } from "@/lib/stages/could-be-wrong";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStageRequest(request, {
    name: "could-be-wrong",
    nextPath: "/api/no-bull/run/devils-advocate",
    run: async (job) => ({
      couldBeWrong: await runCouldBeWrong(
        job.results.reframedQuestion,
        job.results.stressTest
      ),
    }),
  });
}
