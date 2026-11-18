import { callStructured } from "@/lib/ai";
import { jsonError, withAiGuard } from "@/lib/api";
import { ANALYZE_JD_SYSTEM, analyzeJdUser } from "@/lib/prompts";
import { JobAnalysisSchema } from "@/lib/schema";
import { resolveModelChoice } from "@/lib/settings";
import { jobAnalysisJsonSchema } from "@/lib/tool-schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json()) as { jdText?: string; model?: unknown };
  const jdText = body.jdText?.trim();
  if (!jdText || jdText.length < 80) {
    return jsonError("Paste the full job description - that looks too short to analyse.", 400);
  }

  return withAiGuard(
    req,
    async () => {
      const choice = await resolveModelChoice("analyze", body.model);
      const analysis = await callStructured({
        task: "analyze",
        choice,
        jsonSchema: jobAnalysisJsonSchema,
        system: ANALYZE_JD_SYSTEM,
        userContent: analyzeJdUser(jdText),
        schema: JobAnalysisSchema,
      });
      return { analysis, usedModel: choice };
    },
    15,
  );
}
