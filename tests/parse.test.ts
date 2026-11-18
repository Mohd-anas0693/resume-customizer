import { describe, expect, it } from "vitest";
import { stripNulls } from "@/lib/ai";
import {
  extractResumeText,
  kindFromFile,
  ResumeReadError,
  tidyExtractedText,
} from "@/lib/parse";
import { FitReportSchema, JobAnalysisSchema, ResumeSchema, TailorResultSchema } from "@/lib/schema";

describe("kindFromFile", () => {
  it("recognises PDF by mime type and by extension", () => {
    expect(kindFromFile("cv.pdf", "application/pdf")).toBe("pdf");
    expect(kindFromFile("cv.PDF", "application/octet-stream")).toBe("pdf");
  });

  it("recognises DOCX", () => {
    expect(
      kindFromFile(
        "cv.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("docx");
    expect(kindFromFile("cv.docx", "")).toBe("docx");
  });

  it("recognises plain text", () => {
    expect(kindFromFile("cv.txt", "text/plain")).toBe("text");
  });

  it("rejects anything else, including legacy .doc", () => {
    expect(kindFromFile("cv.doc", "application/msword")).toBeNull();
    expect(kindFromFile("photo.png", "image/png")).toBeNull();
  });
});

describe("tidyExtractedText", () => {
  it("normalises line endings and trims each line", () => {
    expect(tidyExtractedText("a  \r\n   b \r c")).toBe("a\nb\nc");
  });

  it("collapses runs of blank lines to one", () => {
    expect(tidyExtractedText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("replaces non-breaking spaces", () => {
    expect(tidyExtractedText("Senior Engineer")).toBe("Senior Engineer");
  });
});

describe("extractResumeText", () => {
  const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

  it("returns tidied text for a plain-text upload", async () => {
    const body = `Asha Verma\n\n\nEXPERIENCE\nSoftware Engineer at Kettle Labs since 2023, building REST services in Node and Express for billing.`;
    const text = await extractResumeText(encode(body), "text");
    expect(text).toContain("Asha Verma");
    expect(text).not.toContain("\n\n\n");
  });

  it("explains that a PDF with no text layer may be a scan", async () => {
    await expect(extractResumeText(encode("tiny"), "pdf")).rejects.toThrow(ResumeReadError);
    await expect(extractResumeText(encode("tiny"), "pdf")).rejects.toThrow(/scanned image/);
  });

  it("rejects a file with too little text to be a resume", async () => {
    await expect(extractResumeText(encode("hello"), "text")).rejects.toThrow(
      /wasn't enough text/,
    );
  });
});

describe("stripNulls", () => {
  it("drops null fields so Zod optionals and defaults apply", () => {
    expect(stripNulls({ a: 1, b: null, c: { d: null, e: 2 } })).toEqual({ a: 1, c: { e: 2 } });
  });

  it("drops nulls inside arrays and recurses into objects", () => {
    expect(stripNulls({ xs: [1, null, { y: null, z: 3 }] })).toEqual({ xs: [1, { z: 3 }] });
  });

  it("leaves primitives and empty values alone", () => {
    expect(stripNulls({ a: "", b: 0, c: false, d: [] })).toEqual({ a: "", b: 0, c: false, d: [] });
  });
});

describe("Zod schemas", () => {
  it("fills in defaults for a minimal resume", () => {
    const resume = ResumeSchema.parse({ contact: { name: "Asha Verma" } });
    expect(resume.contact.links).toEqual([]);
    expect(resume.experience).toEqual([]);
    expect(resume.skills).toEqual([]);
  });

  it("rejects an experience entry with no id, since changes map by id", () => {
    const result = ResumeSchema.safeParse({
      contact: { name: "A" },
      experience: [{ company: "X", title: "Y", start: "2020", bullets: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bullet with no id", () => {
    const result = ResumeSchema.safeParse({
      contact: { name: "A" },
      experience: [{ id: "e1", company: "X", title: "Y", start: "2020", bullets: [{ text: "a" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a resume parsed out of an AI response with nulls stripped", () => {
    const raw = {
      contact: { name: "Asha", email: null, phone: null, location: null, links: [] },
      headline: null,
      summary: "Dev",
      experience: [
        { id: "e1", company: "X", title: "Y", location: null, start: "2020", end: null, bullets: [] },
      ],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
    };
    const parsed = ResumeSchema.parse(stripNulls(raw));
    expect(parsed.contact.email).toBeUndefined();
    expect(parsed.experience[0].end).toBeUndefined();
  });

  it("only allows keyword weights of 1, 2 or 3", () => {
    const base = { title: "T", mustHave: [], niceToHave: [], responsibilities: [] };
    expect(
      JobAnalysisSchema.safeParse({
        ...base,
        keywords: [{ term: "Node", weight: 4, synonyms: [] }],
      }).success,
    ).toBe(false);
    expect(
      JobAnalysisSchema.safeParse({
        ...base,
        keywords: [{ term: "Node", weight: 3, synonyms: [] }],
      }).success,
    ).toBe(true);
  });

  it("only allows the three verdicts", () => {
    const base = { score: 50, mustHaveCoverage: 50, blockers: [], transferable: [], summary: "s", canTailorHelp: "c" };
    expect(FitReportSchema.safeParse({ ...base, verdict: "maybe" }).success).toBe(false);
    for (const verdict of ["strong", "partial", "out_of_scope"]) {
      expect(FitReportSchema.safeParse({ ...base, verdict }).success).toBe(true);
    }
  });

  it("only allows the known blocker types", () => {
    const base = { verdict: "partial", score: 1, mustHaveCoverage: 1, transferable: [], summary: "", canTailorHelp: "" };
    expect(
      FitReportSchema.safeParse({
        ...base,
        blockers: [{ requirement: "r", reason: "x", type: "vibes" }],
      }).success,
    ).toBe(false);
  });

  it("defaults a tailoring result's gaps to an empty list", () => {
    const result = TailorResultSchema.parse({ changes: [] });
    expect(result.gaps).toEqual([]);
  });

  it("rejects a change whose target section is unknown", () => {
    const result = TailorResultSchema.safeParse({
      changes: [
        {
          id: "c1",
          target: { section: "hobbies" },
          kind: "rewrite",
          before: "",
          after: "",
          reason: "",
          keywordsAdded: [],
          sourceEvidence: "",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
