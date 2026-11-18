import { describe, expect, it } from "vitest";
import { renderResumeDocx } from "@/lib/export-docx";
import { renderResumePdf } from "@/lib/export-pdf";
import { resumeToPlainText, tidyExtractedText } from "@/lib/parse";
import { exportFilename, safeFilenamePart } from "@/lib/utils";
import { softwareResume } from "./fixtures";

/** Extract the PDF's text layer back out, the way an ATS would. */
async function pdfText(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return tidyExtractedText(Array.isArray(text) ? text.join("\n") : text);
}

describe("exportFilename", () => {
  it("builds Firstname_Lastname_Company_Role", () => {
    expect(exportFilename("Asha Verma", "Northwind Systems", "Backend Engineer", "pdf")).toBe(
      "Asha_Verma_Northwind_Systems_Backend_Engineer.pdf",
    );
  });

  it("drops the parts that are missing", () => {
    expect(exportFilename("Asha Verma", undefined, undefined, "docx")).toBe("Asha_Verma.docx");
  });

  it("strips characters a filesystem would reject", () => {
    expect(safeFilenamePart("Acme / Corp. (India)")).toBe("Acme_Corp_India");
  });

  it("falls back to a usable name when everything is empty", () => {
    expect(exportFilename("", "", "", "pdf")).toBe("resume.pdf");
  });
});

describe("PDF export", () => {
  it("produces a real PDF", async () => {
    const buffer = await renderResumePdf(softwareResume);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("keeps the text extractable, in reading order", async () => {
    const text = await pdfText(await renderResumePdf(softwareResume));

    // Section headings an ATS looks for.
    for (const heading of ["SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "PROJECTS"]) {
      expect(text.toUpperCase()).toContain(heading);
    }

    // Order matches the template: contact, summary, experience, projects, education, skills.
    const upper = text.toUpperCase();
    expect(upper.indexOf("SUMMARY")).toBeLessThan(upper.indexOf("EXPERIENCE"));
    expect(upper.indexOf("EXPERIENCE")).toBeLessThan(upper.indexOf("PROJECTS"));
    expect(upper.indexOf("PROJECTS")).toBeLessThan(upper.indexOf("EDUCATION"));
    expect(upper.indexOf("EDUCATION")).toBeLessThan(upper.indexOf("SKILLS"));
  });

  it("round-trips every bullet, company and skill", async () => {
    const text = await pdfText(await renderResumePdf(softwareResume));
    const flat = text.replace(/\s+/g, " ");

    for (const exp of softwareResume.experience) {
      expect(flat).toContain(exp.company);
      expect(flat).toContain(exp.title);
      for (const bullet of exp.bullets) {
        expect(flat).toContain(bullet.text.replace(/\s+/g, " "));
      }
    }
    for (const group of softwareResume.skills) {
      for (const item of group.items) expect(flat).toContain(item);
    }
    expect(flat).toContain(softwareResume.contact.name);
    expect(flat).toContain(softwareResume.contact.email!);
  });

  it("keeps the bullets of a role in their original order", async () => {
    const flat = (await pdfText(await renderResumePdf(softwareResume))).replace(/\s+/g, " ");
    const positions = softwareResume.experience[0].bullets.map((b) =>
      flat.indexOf(b.text.replace(/\s+/g, " ")),
    );
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("renders an almost-empty resume without throwing", async () => {
    const buffer = await renderResumePdf({
      contact: { name: "Nobody", links: [] },
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
    });
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("DOCX export", () => {
  it("produces a real .docx (a zip with word/document.xml)", async () => {
    const buffer = await renderResumeDocx(softwareResume);
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buffer.toString("latin1")).toContain("word/document.xml");
  });

  it("contains the resume's text in document.xml", async () => {
    const buffer = await renderResumeDocx(softwareResume);
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(new Uint8Array(buffer));
    const xml = strFromU8(files["word/document.xml"]);

    expect(xml).toContain("Asha Verma");
    expect(xml).toContain("Kettle Labs");
    expect(xml).toContain("Built REST services in Node and Express serving 40k daily requests.");
    expect(xml).toContain("TypeScript");
  });

  it("uses no tables for layout, as the ATS rules require", async () => {
    const buffer = await renderResumeDocx(softwareResume);
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(new Uint8Array(buffer));
    const xml = strFromU8(files["word/document.xml"]);
    expect(xml).not.toContain("<w:tbl>");
  });
});

describe("resumeToPlainText", () => {
  it("includes every section with standard headings", () => {
    const text = resumeToPlainText(softwareResume);
    for (const heading of ["SUMMARY", "EXPERIENCE", "PROJECTS", "EDUCATION", "SKILLS"]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("Asha Verma");
  });

  it("includes every bullet, so the fabrication check sees the whole resume", () => {
    const text = resumeToPlainText(softwareResume);
    for (const exp of softwareResume.experience) {
      for (const b of exp.bullets) expect(text).toContain(b.text);
    }
  });
});
