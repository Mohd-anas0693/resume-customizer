import { describe, expect, it } from "vitest";
import { canonical, containsTerm, matchScore, normalize, resumeText, stem } from "@/lib/match";
import type { JobAnalysis, Resume } from "@/lib/schema";
import { emptyResume } from "@/lib/schema";
import { outOfScopeAnalysis, partialFitAnalysis, softwareResume, strongFitAnalysis } from "./fixtures";

const analysisWith = (keywords: JobAnalysis["keywords"], mustHave: string[] = []): JobAnalysis => ({
  title: "Test role",
  mustHave,
  niceToHave: [],
  keywords,
  responsibilities: [],
});

const resumeWithSkills = (items: string[]): Resume => ({
  ...emptyResume(),
  skills: [{ id: "sk1", name: "Skills", items }],
});

const resumeWithBullet = (text: string): Resume => ({
  ...emptyResume(),
  experience: [
    {
      id: "exp1",
      company: "Acme",
      title: "Engineer",
      start: "2020",
      end: "Present",
      bullets: [{ id: "b1", text }],
    },
  ],
});

describe("normalize", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalize("  Node.JS   and   React  ")).toBe("node.js and react");
  });

  it("keeps characters that are part of tech terms", () => {
    expect(normalize("C++, C#, CI/CD, .NET")).toBe("c++ c# ci/cd .net");
  });

  it("drops punctuation that is not part of a term", () => {
    expect(normalize("Built (REST) services; fast!")).toBe("built rest services fast");
  });

  it("removes apostrophes rather than splitting the word", () => {
    expect(normalize("Developer's toolkit")).toBe("developers toolkit");
  });
});

describe("stem", () => {
  it("folds simple plurals", () => {
    expect(stem("services")).toBe("servic");
    expect(stem("apis")).toBe("api");
    expect(stem("tests")).toBe("test");
  });

  it("folds -ies plurals to -y", () => {
    expect(stem("libraries")).toBe("library");
    expect(stem("queries")).toBe("query");
  });

  it("folds gerunds and past tense", () => {
    expect(stem("testing")).toBe("test");
    expect(stem("deployed")).toBe("deploy");
  });

  it("converges a singular on its plural stem", () => {
    expect(stem("service")).toBe(stem("services"));
    expect(stem("node")).toBe(stem("nodes"));
    expect(stem("pipeline")).toBe(stem("pipelines"));
  });

  it("leaves short words and double-s endings alone", () => {
    expect(stem("css")).toBe("css");
    expect(stem("aws")).toBe("aws");
    expect(stem("go")).toBe("go");
  });

  it("is idempotent, so a term and its stem canonicalise alike", () => {
    for (const word of ["services", "libraries", "testing", "css", "node"]) {
      expect(stem(stem(word))).toBe(stem(word));
    }
  });
});

describe("containsTerm", () => {
  const haystack = canonical("Built REST services in Node and used machine learning models");

  it("matches a single word", () => {
    expect(containsTerm(haystack, "Node")).toBe(true);
  });

  it("matches a multi-word term", () => {
    expect(containsTerm(haystack, "machine learning")).toBe(true);
  });

  it("matches across plural forms in both directions", () => {
    expect(containsTerm(haystack, "REST service")).toBe(true);
    expect(containsTerm(canonical("Built a REST service"), "REST services")).toBe(true);
  });

  it("does not match a substring inside another word", () => {
    expect(containsTerm(canonical("Worked on Javascript"), "Java")).toBe(false);
    expect(containsTerm(canonical("Used Gonzo framework"), "Go")).toBe(false);
  });

  it("does not match a partial multi-word term", () => {
    expect(containsTerm(canonical("studied machine shop safety"), "machine learning")).toBe(false);
  });

  it("is false for an empty term", () => {
    expect(containsTerm(haystack, "   ")).toBe(false);
  });
});

describe("resumeText", () => {
  it("separates bullet evidence from everything else", () => {
    const text = resumeText(softwareResume);
    expect(text.bullets).toContain("express");
    expect(text.bullets).not.toContain("savitribai");
    expect(text.all).toContain("savitribai");
  });
});

describe("matchScore", () => {
  it("is deterministic across repeated runs", () => {
    const first = matchScore(softwareResume, strongFitAnalysis);
    for (let i = 0; i < 5; i++) {
      expect(matchScore(softwareResume, strongFitAnalysis)).toEqual(first);
    }
  });

  it("is independent of the order keywords arrive in", () => {
    const shuffled: JobAnalysis = {
      ...strongFitAnalysis,
      keywords: [...strongFitAnalysis.keywords].reverse(),
      mustHave: [...strongFitAnalysis.mustHave].reverse(),
    };
    const a = matchScore(softwareResume, strongFitAnalysis);
    const b = matchScore(softwareResume, shuffled);
    expect(b.score).toBe(a.score);
    expect(b.mustHaveCoverage).toBe(a.mustHaveCoverage);
    expect(b.matched).toEqual(a.matched);
    expect(b.missing).toEqual(a.missing);
  });

  it("matches a keyword through a synonym", () => {
    const analysis = analysisWith([{ term: "Node.js", weight: 3, synonyms: ["Node"] }]);
    const report = matchScore(resumeWithBullet("Built services in Node"), analysis);
    expect(report.byKeyword["Node.js"].found).toBe(true);
    expect(report.byKeyword["Node.js"].matchedAs).toBe("Node");
  });

  it("matches multi-word terms like 'machine learning'", () => {
    const analysis = analysisWith([{ term: "machine learning", weight: 3, synonyms: ["ML"] }]);
    expect(
      matchScore(resumeWithBullet("Shipped machine learning pipelines"), analysis).score,
    ).toBe(100);
  });

  it("gives full credit in a bullet and partial credit when only listed", () => {
    const analysis = analysisWith([{ term: "Docker", weight: 3, synonyms: [] }]);
    const inBullet = matchScore(resumeWithBullet("Deployed with Docker"), analysis);
    const listed = matchScore(resumeWithSkills(["Docker"]), analysis);

    expect(inBullet.score).toBe(100);
    expect(inBullet.byKeyword.Docker.inBullets).toBe(true);
    expect(listed.score).toBe(80);
    expect(listed.byKeyword.Docker.inBullets).toBe(false);
    expect(listed.byKeyword.Docker.found).toBe(true);
  });

  it("weights critical keywords more heavily than passing mentions", () => {
    const analysis = analysisWith([
      { term: "Kubernetes", weight: 3, synonyms: [] },
      { term: "Jenkins", weight: 1, synonyms: [] },
    ]);
    const hasCritical = matchScore(resumeWithBullet("Ran Kubernetes clusters"), analysis);
    const hasMinor = matchScore(resumeWithBullet("Maintained Jenkins jobs"), analysis);
    expect(hasCritical.score).toBeGreaterThan(hasMinor.score);
    expect(hasCritical.score).toBe(75);
    expect(hasMinor.score).toBe(25);
  });

  it("scores 0 with no keywords present and 100 with all of them", () => {
    const analysis = analysisWith([
      { term: "Rust", weight: 3, synonyms: [] },
      { term: "Haskell", weight: 2, synonyms: [] },
    ]);
    expect(matchScore(softwareResume, analysis).score).toBe(0);
    expect(matchScore(resumeWithBullet("Wrote Rust and Haskell"), analysis).score).toBe(100);
  });

  it("returns 0 rather than NaN when a JD has no keywords", () => {
    expect(matchScore(softwareResume, analysisWith([])).score).toBe(0);
  });

  it("reports must-have coverage separately from the score", () => {
    const report = matchScore(softwareResume, strongFitAnalysis);
    expect(report.mustHaveCoverage).toBe(100);
    expect(report.mustHaveMissing).toEqual([]);
  });

  it("counts a must-have as covered when a keyword synonym proves it", () => {
    const analysis = analysisWith(
      [{ term: "Node.js", weight: 3, synonyms: ["Node"] }],
      ["Node.js"],
    );
    const report = matchScore(resumeWithBullet("Built APIs in Node"), analysis);
    expect(report.mustHaveCoverage).toBe(100);
  });

  it("treats a JD with no must-haves as fully covered", () => {
    expect(matchScore(softwareResume, analysisWith([], [])).mustHaveCoverage).toBe(100);
  });

  it("splits matched and missing into complementary lists", () => {
    const report = matchScore(softwareResume, partialFitAnalysis);
    expect(report.matched).toContain("Node.js");
    expect(report.missing).toContain("Kubernetes");
    expect(report.missing).toContain("Terraform");
    expect(report.matched.length + report.missing.length).toBe(
      partialFitAnalysis.keywords.length,
    );
  });

  it("scores a different profession near zero", () => {
    const report = matchScore(softwareResume, outOfScopeAnalysis);
    expect(report.score).toBeLessThan(15);
    expect(report.mustHaveCoverage).toBeLessThan(40);
  });

  it("ranks the three fixtures in the expected order", () => {
    const strong = matchScore(softwareResume, strongFitAnalysis);
    const partial = matchScore(softwareResume, partialFitAnalysis);
    const out = matchScore(softwareResume, outOfScopeAnalysis);
    expect(strong.score).toBeGreaterThan(partial.score);
    expect(partial.score).toBeGreaterThan(out.score);
  });
});
