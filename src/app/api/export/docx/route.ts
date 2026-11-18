import { jsonError, mapError } from "@/lib/api";
import { renderResumeDocx } from "@/lib/export-docx";
import { ResumeSchema } from "@/lib/schema";
import { exportFilename } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resume = ResumeSchema.safeParse(body.resume);
    if (!resume.success) return jsonError("Invalid resume payload.", 400);

    const buffer = await renderResumeDocx(resume.data);
    const filename = exportFilename(resume.data.contact.name, body.company, body.role, "docx");

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    return mapError(err);
  }
}
