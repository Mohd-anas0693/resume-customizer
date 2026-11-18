import { NextResponse } from "next/server";
import { jsonError, mapError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ChangeSchema, ResumeSchema } from "@/lib/schema";
import { z } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Save the result of a review pass as a new TailoredVersion. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();

    const resume = ResumeSchema.safeParse(body.resume);
    const changes = z.array(ChangeSchema).safeParse(body.changes);
    if (!resume.success) return jsonError("Invalid resume payload.", 400);
    if (!changes.success) return jsonError("Invalid changes payload.", 400);

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return jsonError("Job not found.", 404);

    const version = await prisma.tailoredVersion.create({
      data: {
        jobId: id,
        label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : "Tailored",
        data: JSON.stringify(resume.data),
        changes: JSON.stringify(changes.data),
        scoreBefore: Math.round(Number(body.scoreBefore) || 0),
        scoreAfter: Math.round(Number(body.scoreAfter) || 0),
      },
    });

    return NextResponse.json({ id: version.id });
  } catch (err) {
    return mapError(err);
  }
}
