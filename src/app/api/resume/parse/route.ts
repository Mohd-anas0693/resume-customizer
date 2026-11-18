import { callStructured } from "@/lib/ai";
import { jsonError, withAiGuard } from "@/lib/api";
import { extractResumeText, kindFromFile, ResumeReadError, tidyExtractedText } from "@/lib/parse";
import { PARSE_RESUME_SYSTEM, parseResumeUser } from "@/lib/prompts";
import { ResumeSchema } from "@/lib/schema";
import { resolveModelChoice } from "@/lib/settings";
import { resumeJsonSchema } from "@/lib/tool-schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  let rawText: string;
  let modelOverride: unknown;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const pastedText = form.get("text");
      const model = form.get("model");
      if (typeof model === "string" && model) modelOverride = JSON.parse(model);

      if (file instanceof File && file.size > 0) {
        if (file.size > 8 * 1024 * 1024) {
          return jsonError("That file is over 8MB. Please upload a smaller resume.", 413);
        }
        const kind = kindFromFile(file.name, file.type);
        if (!kind) {
          return jsonError("Unsupported file type. Upload a PDF or DOCX, or paste the text.", 415);
        }
        rawText = await extractResumeText(await file.arrayBuffer(), kind);
      } else if (typeof pastedText === "string" && pastedText.trim()) {
        rawText = tidyExtractedText(pastedText);
      } else {
        return jsonError("Attach a resume file or paste the resume text.", 400);
      }
    } else {
      const body = (await req.json()) as { text?: string; model?: unknown };
      if (!body.text?.trim()) return jsonError("Paste the resume text to parse.", 400);
      rawText = tidyExtractedText(body.text);
      modelOverride = body.model;
    }
  } catch (err) {
    if (err instanceof ResumeReadError) return jsonError(err.message, 422);
    throw err;
  }

  return withAiGuard(
    req,
    async () => {
      const choice = await resolveModelChoice("parse", modelOverride);
      const resume = await callStructured({
        task: "parse",
        choice,
        jsonSchema: resumeJsonSchema,
        system: PARSE_RESUME_SYSTEM,
        userContent: parseResumeUser(rawText),
        schema: ResumeSchema,
      });
      return { resume, rawText, usedModel: choice };
    },
    10,
  );
}
