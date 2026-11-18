import { callStructured } from "@/lib/ai";
import { jsonError, withAiGuard } from "@/lib/api";
import { buildFitReport } from "@/lib/fit";
import { matchScore } from "@/lib/match";
import { FIT_SYSTEM, fitUser } from "@/lib/prompts";
import { FitJudgmentSchema, JobAnalysisSchema, ResumeSchema } from "@/lib/schema";
import { resolveModelChoice } from "@/lib/settings";
import { fitJudgmentJsonSchema } from "@/lib/tool-schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  const resume = ResumeSchema.safeParse(body.resume);
  const analysis = JobAnalysisSchema.safeParse(body.analysis);
  if (!resume.success) return jsonError("Invalid resume payload.", 400);
  if (!analysis.success) return jsonError("Invalid job analysis payload.", 400);

  return withAiGuard(
    req,
    async () => {
      const report = matchScore(resume.data, analysis.data);
      const choice = await resolveModelChoice("fit", body.model);
      const judgment = await callStructured({
        task: "fit",
        choice,
        jsonSchema: fitJudgmentJsonSchema,
        system: FIT_SYSTEM,
        userContent: fitUser(resume.data, analysis.data),
        schema: FitJudgmentSchema,
      });
      return {
        fitReport: buildFitReport(report, judgment),
        matchReport: report,
        usedModel: choice,
      };
    },
    15,
  );
}
