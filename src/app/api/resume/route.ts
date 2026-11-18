import { NextResponse } from "next/server";
import { jsonError, mapError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ResumeSchema } from "@/lib/schema";

export const runtime = "nodejs";

/** The master resume, or null when the user hasn't imported one yet. */
export async function GET() {
  try {
    const row = await prisma.resume.findFirst({
      where: { isMaster: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!row) return NextResponse.json({ resume: null, id: null });
    return NextResponse.json({ id: row.id, resume: JSON.parse(row.data), updatedAt: row.updatedAt });
  } catch (err) {
    return mapError(err);
  }
}

/** Create or overwrite the master resume. */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const parsed = ResumeSchema.safeParse(body.resume);
    if (!parsed.success) {
      return jsonError("Invalid resume payload.", 400, { issues: parsed.error.issues.slice(0, 8) });
    }

    const existing = await prisma.resume.findFirst({ where: { isMaster: true } });
    const data = JSON.stringify(parsed.data);

    const row = existing
      ? await prisma.resume.update({ where: { id: existing.id }, data: { data } })
      : await prisma.resume.create({ data: { data, isMaster: true } });

    return NextResponse.json({ id: row.id, resume: parsed.data, updatedAt: row.updatedAt });
  } catch (err) {
    return mapError(err);
  }
}
