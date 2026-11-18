import { callStructured } from "@/lib/ai";
import { jsonError, withAiGuard } from "@/lib/api";
import { validateChanges } from "@/lib/apply-changes";
import { checkChanges } from "@/lib/fabrication";
import { matchScore } from "@/lib/match";
import { resumeToPlainText } from "@/lib/parse";
import { TAILOR_SYSTEM, tailorUser } from "@/lib/prompts";
import {
  FitReportSchema,
  JobAnalysisSchema,
  ResumeSchema,
  TailorIntensitySchema,
  TailorResultSchema,
  type Change,
} from "@/lib/schema";
import { resolveModelChoice } from "@/lib/settings";
import { tailorJsonSchema } from "@/lib/tool-schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json();
  const resume = ResumeSchema.safeParse(body.resume);
  const analysis = JobAnalysisSchema.safeParse(body.analysis);
  const intensity = TailorIntensitySchema.safeParse(body.intensity ?? "balanced");
  // The fit report is advice, never a gate: tailoring is allowed on any verdict.
  const fitReport = FitReportSchema.safeParse(body.fitReport);

  if (!resume.success) return jsonError("Invalid resume payload.", 400);
  if (!analysis.success) return jsonError("Invalid job analysis payload.", 400);
  if (!intensity.success) return jsonError("Intensity must be light, balanced or strong.", 400);

  return withAiGuard(
    req,
    async () => {
      const before = matchScore(resume.data, analysis.data);

      const choice = await resolveModelChoice("tailor", body.model);
      const result = await callStructured({
        task: "tailor",
        choice,
        jsonSchema: tailorJsonSchema,
        system: TAILOR_SYSTEM,
        userContent: tailorUser(
          resume.data,
          analysis.data,
          fitReport.success ? fitReport.data : null,
          intensity.data,
          before.missing,
        ),
        schema: TailorResultSchema,
      });

      // Drop changes that point at ids which don't exist, or that are no-ops.
      const { valid, problems } = validateChanges(resume.data, result.changes);
      const meaningful = valid.filter(
        (c) => c.kind === "remove" || c.after.trim() !== c.before.trim(),
      );

      // Fabrication post-check, in code: flag any number, tool or proper noun
      // in `after` that isn't supported by the original resume.
      const warningsByChange = checkChanges(meaningful, resumeToPlainText(resume.data));

      const changes: Change[] = meaningful.map((c) => ({
        ...c,
        status: "pending",
        warnings: warningsByChange[c.id] ?? [],
      }));

      return {
        changes,
        gaps: result.gaps,
        scoreBefore: before.score,
        droppedChanges: problems,
        usedModel: choice,
      };
    },
    10,
  );
}
