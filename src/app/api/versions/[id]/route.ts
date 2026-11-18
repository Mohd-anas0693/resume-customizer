import { NextResponse } from "next/server";
import { jsonError, mapError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ResumeSchema } from "@/lib/schema";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
    if (body.resume !== undefined) {
      const parsed = ResumeSchema.safeParse(body.resume);
      if (!parsed.success) return jsonError("Invalid resume payload.", 400);
      data.data = JSON.stringify(parsed.data);
    }
    if (Object.keys(data).length === 0) return jsonError("Nothing to update.", 400);

    await prisma.tailoredVersion.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapError(err);
  }
}

/** Duplicate a version (used by the dashboard's "Duplicate" action). */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const source = await prisma.tailoredVersion.findUnique({ where: { id } });
    if (!source) return jsonError("Version not found.", 404);

    const copy = await prisma.tailoredVersion.create({
      data: {
        jobId: source.jobId,
        label: `${source.label} (copy)`,
        data: source.data,
        changes: source.changes,
        scoreBefore: source.scoreBefore,
        scoreAfter: source.scoreAfter,
      },
    });
    return NextResponse.json({ id: copy.id });
  } catch (err) {
    return mapError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    await prisma.tailoredVersion.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapError(err);
  }
}
