import { handleStageRequest } from "@/lib/stage-runner";
import { runNarrativeCorrection } from "@/lib/stages/narrative-correction";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleStageRequest(request, {
    name: "narrative-correction",
    terminal: true,
    run: async (job) => runNarrativeCorrection(job),
  });
}
