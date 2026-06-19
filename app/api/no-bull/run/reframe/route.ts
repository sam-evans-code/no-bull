import { handleStageRequest } from "@/lib/stage-runner";
import { runReframe } from "@/lib/stages/reframe";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStageRequest(request, {
    name: "reframe",
    terminal: false,
    run: async (job) => ({ reframedQuestion: await runReframe(job.input) }),
  });
}
