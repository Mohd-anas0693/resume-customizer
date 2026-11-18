import type { Resume } from "./schema";

export class ResumeReadError extends Error {}

/** Message copy from the plan's quality checklist. */
const SCANNED_PDF_MESSAGE =
  "Couldn't read this PDF. It may be a scanned image. Try DOCX or paste the text.";

export type SupportedKind = "pdf" | "docx" | "text";

export function kindFromFile(name: string, mime: string): SupportedKind | null {
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return "docx";
  }
  if (mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) return "text";
  return null;
}

/** Collapse the whitespace noise that PDF and DOCX extraction leaves behind. */
export function tidyExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  } catch {
    throw new ResumeReadError(SCANNED_PDF_MESSAGE);
  }
}

async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return result.value;
  } catch {
    throw new ResumeReadError("Couldn't read this DOCX. Try exporting it again, or paste the text.");
  }
}

/** Raw text out of an uploaded file. Throws ResumeReadError with user-facing copy. */
export async function extractResumeText(
  buffer: ArrayBuffer,
  kind: SupportedKind,
): Promise<string> {
  let raw: string;
  if (kind === "pdf") raw = await extractPdf(buffer);
  else if (kind === "docx") raw = await extractDocx(buffer);
  else raw = new TextDecoder().decode(buffer);

  const text = tidyExtractedText(raw);
  // A text layer that short means an image-only PDF (or an empty file).
  if (text.replace(/\s/g, "").length < 80) {
    throw new ResumeReadError(
      kind === "pdf"
        ? SCANNED_PDF_MESSAGE
        : "There wasn't enough text in that file to read a resume from it.",
    );
  }
  return text;
}

/* ------------------------------------------------------------------ *
 * Resume -> plain text (used by the fabrication check and exports)
 * ------------------------------------------------------------------ */

export function resumeToPlainText(resume: Resume): string {
  const lines: string[] = [];
  const c = resume.contact;
  lines.push(c.name);
  lines.push([c.email, c.phone, c.location].filter(Boolean).join(" | "));
  for (const l of c.links) lines.push(`${l.label}: ${l.url}`);
  if (resume.headline) lines.push(resume.headline);
  if (resume.summary) lines.push("", "SUMMARY", resume.summary);

  if (resume.experience.length) {
    lines.push("", "EXPERIENCE");
    for (const e of resume.experience) {
      lines.push(
        `${e.title} - ${e.company}${e.location ? `, ${e.location}` : ""} (${e.start} - ${e.end || "Present"})`,
      );
      for (const b of e.bullets) lines.push(`- ${b.text}`);
    }
  }

  if (resume.projects.length) {
    lines.push("", "PROJECTS");
    for (const p of resume.projects) {
      lines.push(`${p.name}${p.link ? ` (${p.link})` : ""}`);
      for (const b of p.bullets) lines.push(`- ${b.text}`);
    }
  }

  if (resume.education.length) {
    lines.push("", "EDUCATION");
    for (const e of resume.education) {
      lines.push(
        [e.degree, e.field].filter(Boolean).join(", ") +
          (e.degree || e.field ? " - " : "") +
          e.school +
          (e.end ? ` (${e.start ? `${e.start} - ` : ""}${e.end})` : ""),
      );
      for (const d of e.details) lines.push(`- ${d}`);
    }
  }

  if (resume.skills.length) {
    lines.push("", "SKILLS");
    for (const g of resume.skills) lines.push(`${g.name}: ${g.items.join(", ")}`);
  }

  if (resume.certifications.length) {
    lines.push("", "CERTIFICATIONS");
    for (const cert of resume.certifications) {
      lines.push([cert.name, cert.issuer, cert.date].filter(Boolean).join(" - "));
    }
  }

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}
