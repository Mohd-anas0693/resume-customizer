import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { Resume } from "./schema";

/**
 * Same ATS-safe template as the PDF: single column, standard headings, real
 * text, a common font (Calibri), no tables for layout.
 */
const FONT = "Calibri";

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } },
    children: [
      new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: FONT, characterSpacing: 10 }),
    ],
  });
}

function body(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new Paragraph({
    spacing: { after: 20 },
    children: [
      new TextRun({
        text,
        bold: opts.bold,
        size: opts.size ?? 20,
        color: opts.color,
        font: FONT,
      }),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 20 },
    children: [new TextRun({ text, size: 20, font: FONT })],
  });
}

function dateRange(start?: string, end?: string) {
  const s = start?.trim();
  const e = end?.trim() || "Present";
  if (!s) return e === "Present" ? "" : e;
  return `${s} – ${e}`;
}

export function buildResumeDocx(resume: Resume): Document {
  const c = resume.contact;
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: c.name || "Your name", bold: true, size: 38, font: FONT })],
    }),
  );
  if (resume.headline) children.push(body(resume.headline, { size: 22 }));

  const contactBits = [c.email, c.phone, c.location].filter(Boolean) as string[];
  if (contactBits.length) children.push(body(contactBits.join("  •  "), { size: 18, color: "333333" }));

  if (c.links.length) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: c.links.flatMap((l, i) => [
          ...(i > 0 ? [new TextRun({ text: "  •  ", size: 18, font: FONT })] : []),
          new ExternalHyperlink({
            link: l.url,
            children: [
              new TextRun({
                text: l.label || l.url,
                size: 18,
                font: FONT,
                color: "1A4F8A",
                underline: {},
              }),
            ],
          }),
        ]),
      }),
    );
  }

  if (resume.summary?.trim()) {
    children.push(sectionHeading("Summary"), body(resume.summary));
  }

  if (resume.experience.length) {
    children.push(sectionHeading("Experience"));
    for (const exp of resume.experience) {
      children.push(
        new Paragraph({
          spacing: { before: 140, after: 0 },
          children: [
            new TextRun({ text: exp.title, bold: true, size: 21, font: FONT }),
            ...(exp.company
              ? [new TextRun({ text: ` — ${exp.company}`, bold: true, size: 21, font: FONT })]
              : []),
          ],
        }),
      );
      const meta = [dateRange(exp.start, exp.end), exp.location].filter(Boolean).join("  •  ");
      if (meta) children.push(body(meta, { size: 18, color: "444444" }));
      for (const b of exp.bullets) if (b.text.trim()) children.push(bullet(b.text));
    }
  }

  if (resume.projects.length) {
    children.push(sectionHeading("Projects"));
    for (const p of resume.projects) {
      children.push(body(p.name, { bold: true, size: 21 }));
      if (p.link) children.push(body(p.link, { size: 18, color: "444444" }));
      for (const b of p.bullets) if (b.text.trim()) children.push(bullet(b.text));
    }
  }

  if (resume.education.length) {
    children.push(sectionHeading("Education"));
    for (const e of resume.education) {
      const degree = [e.degree, e.field].filter(Boolean).join(", ");
      children.push(body(degree || e.school, { bold: true, size: 21 }));
      const meta = [degree ? e.school : "", dateRange(e.start, e.end)].filter(Boolean).join("  •  ");
      if (meta) children.push(body(meta, { size: 18, color: "444444" }));
      for (const d of e.details) if (d.trim()) children.push(bullet(d));
    }
  }

  if (resume.skills.length) {
    children.push(sectionHeading("Skills"));
    for (const g of resume.skills) {
      children.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: `${g.name}: `, bold: true, size: 20, font: FONT }),
            new TextRun({ text: g.items.join(", "), size: 20, font: FONT }),
          ],
        }),
      );
    }
  }

  if (resume.certifications.length) {
    children.push(sectionHeading("Certifications"));
    for (const cert of resume.certifications) {
      children.push(body([cert.name, cert.issuer, cert.date].filter(Boolean).join(" — ")));
    }
  }

  return new Document({
    creator: "Resume Tailor",
    title: `${c.name || "Resume"}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 850, right: 850 } },
        },
        children,
      },
    ],
  });
}

export async function renderResumeDocx(resume: Resume): Promise<Buffer> {
  return Packer.toBuffer(buildResumeDocx(resume));
}
