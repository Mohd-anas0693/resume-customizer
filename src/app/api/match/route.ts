import { NextResponse } from "next/server";
import { jsonError, mapError } from "@/lib/api";
import { matchScore } from "@/lib/match";
import { JobAnalysisSchema, ResumeSchema } from "@/lib/schema";

export const runtime = "nodejs";

/** Deterministic: no AI, no rate limit needed. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resume = ResumeSchema.safeParse(body.resume);
    const analysis = JobAnalysisSchema.safeParse(body.analysis);
    if (!resume.success) return jsonError("Invalid resume payload.", 400);
    if (!analysis.success) return jsonError("Invalid job analysis payload.", 400);

    return NextResponse.json({ report: matchScore(resume.data, analysis.data) });
  } catch (err) {
    return mapError(err);
  }
}
