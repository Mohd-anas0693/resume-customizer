import { NextResponse } from "next/server";
import { jsonError, mapError } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      include: { versions: { orderBy: { createdAt: "desc" } } },
    });
    return NextResponse.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        skipped: j.skipped,
        createdAt: j.createdAt,
        fitReport: j.fitReport ? JSON.parse(j.fitReport) : null,
        versions: j.versions.map((v) => ({
          id: v.id,
          label: v.label,
          scoreBefore: v.scoreBefore,
          scoreAfter: v.scoreAfter,
          createdAt: v.createdAt,
        })),
      })),
    });
  } catch (err) {
    return mapError(err);
  }
}

/** Create a job from pasted JD text. Analysis and fit are stored separately. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { jdText?: string; jdUrl?: string };
    const jdText = body.jdText?.trim();
    if (!jdText || jdText.length < 80) {
      return jsonError("Paste the full job description - that looks too short.", 400);
    }

    const resume = await prisma.resume.findFirst({ where: { isMaster: true } });
    if (!resume) return jsonError("Import your master resume first.", 409);

    const job = await prisma.job.create({
      data: { resumeId: resume.id, jdText, jdUrl: body.jdUrl || null },
    });
    return NextResponse.json({ id: job.id });
  } catch (err) {
    return mapError(err);
  }
}
