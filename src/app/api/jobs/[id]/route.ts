import { NextResponse } from "next/server";
import { jsonError, mapError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { FitReportSchema, JobAnalysisSchema } from "@/lib/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const job = await prisma.job.findUnique({
      where: { id },
      include: { resume: true, versions: { orderBy: { createdAt: "desc" } } },
    });
    if (!job) return jsonError("Job not found.", 404);

    return NextResponse.json({
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        jdText: job.jdText,
        jdUrl: job.jdUrl,
        skipped: job.skipped,
        analysis: job.analysis ? JSON.parse(job.analysis) : null,
        fitReport: job.fitReport ? JSON.parse(job.fitReport) : null,
      },
      masterResume: JSON.parse(job.resume.data),
      versions: job.versions.map((v) => ({
        id: v.id,
        label: v.label,
        resume: JSON.parse(v.data),
        changes: JSON.parse(v.changes),
        scoreBefore: v.scoreBefore,
        scoreAfter: v.scoreAfter,
        createdAt: v.createdAt,
      })),
    });
  } catch (err) {
    return mapError(err);
  }
}

/** Store the analysis / fit report, or flip the skipped flag. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.analysis !== undefined) {
      const parsed = JobAnalysisSchema.safeParse(body.analysis);
      if (!parsed.success) return jsonError("Invalid analysis payload.", 400);
      data.analysis = JSON.stringify(parsed.data);
      data.title = parsed.data.title;
      data.company = parsed.data.company ?? null;
    }
    if (body.fitReport !== undefined) {
      const parsed = FitReportSchema.safeParse(body.fitReport);
      if (!parsed.success) return jsonError("Invalid fit report payload.", 400);
      data.fitReport = JSON.stringify(parsed.data);
    }
    if (typeof body.skipped === "boolean") data.skipped = body.skipped;

    if (Object.keys(data).length === 0) return jsonError("Nothing to update.", 400);

    await prisma.job.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await prisma.job.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapError(err);
  }
}
