import { describe, expect, it } from "vitest";
import {
  buildFitReport,
  computeVerdict,
  FIT_THRESHOLDS,
  parseYears,
  yearsBlockerIsDisqualifying,
} from "@/lib/fit";
import { matchScore } from "@/lib/match";
import type { Blocker, FitJudgment } from "@/lib/schema";
import { outOfScopeAnalysis, partialFitAnalysis, softwareResume, strongFitAnalysis } from "./fixtures";

const blocker = (type: Blocker["type"], extra: Partial<Blocker> = {}): Blocker => ({
  requirement: `${type} requirement`,
  reason: `${type} reason`,
  type,
  ...extra,
});

const judgment = (over: Partial<FitJudgment> = {}): FitJudgment => ({
  blockers: [],
  transferable: [],
  summary: "",
  canTailorHelp: "",
  ...over,
});

describe("parseYears", () => {
  it("reads the common JD phrasings", () => {
    expect(parseYears("Requires 5+ years in Java")).toBe(5);
    expect(parseYears("3 yrs of experience")).toBe(3);
    expect(parseYears("minimum 2.5 years")).toBe(2.5);
  });

  it("returns null when there is no year figure", () => {
    expect(parseYears("Senior engineer wanted")).toBeNull();
    expect(parseYears("")).toBeNull();
  });
});

describe("yearsBlockerIsDisqualifying", () => {
  it("is true when the resume shows under half the required years", () => {
    expect(
      yearsBlockerIsDisqualifying(blocker("years", { requiredYears: 5, resumeYears: 1 })),
    ).toBe(true);
  });

  it("is false at exactly half, and above", () => {
    expect(
      yearsBlockerIsDisqualifying(blocker("years", { requiredYears: 6, resumeYears: 3 })),
    ).toBe(false);
    expect(
      yearsBlockerIsDisqualifying(blocker("years", { requiredYears: 6, resumeYears: 5 })),
    ).toBe(false);
  });

  it("falls back to parsing the numbers out of the text", () => {
    expect(
      yearsBlockerIsDisqualifying({
        requirement: "Requires 8+ years of Go",
        reason: "resume shows 2 years total",
        type: "years",
      }),
    ).toBe(true);
  });

  it("is a soft gap, not a blocker, when no numbers are usable", () => {
    expect(yearsBlockerIsDisqualifying(blocker("years"))).toBe(false);
  });

  it("ignores blockers of other types", () => {
    expect(
      yearsBlockerIsDisqualifying(blocker("skill", { requiredYears: 5, resumeYears: 0 })),
    ).toBe(false);
  });
});

describe("computeVerdict - out of scope rules", () => {
  it("must-have coverage under 40% is out of scope on its own", () => {
    expect(computeVerdict({ score: 90, mustHaveCoverage: 39, blockers: [] })).toBe("out_of_scope");
    expect(computeVerdict({ score: 90, mustHaveCoverage: 40, blockers: [] })).not.toBe(
      "out_of_scope",
    );
  });

  it("a credential blocker is out of scope however good the score", () => {
    expect(
      computeVerdict({ score: 100, mustHaveCoverage: 100, blockers: [blocker("credential")] }),
    ).toBe("out_of_scope");
  });

  it("a years blocker under half the requirement is out of scope", () => {
    expect(
      computeVerdict({
        score: 95,
        mustHaveCoverage: 100,
        blockers: [blocker("years", { requiredYears: 5, resumeYears: 1 })],
      }),
    ).toBe("out_of_scope");
  });

  it("a years blocker at half or more is not out of scope", () => {
    expect(
      computeVerdict({
        score: 95,
        mustHaveCoverage: 100,
        blockers: [blocker("years", { requiredYears: 4, resumeYears: 3 })],
      }),
    ).toBe("partial");
  });

  it("a domain blocker is out of scope only under 60% coverage", () => {
    expect(
      computeVerdict({ score: 70, mustHaveCoverage: 59, blockers: [blocker("domain")] }),
    ).toBe("out_of_scope");
    expect(
      computeVerdict({ score: 70, mustHaveCoverage: 60, blockers: [blocker("domain")] }),
    ).toBe("partial");
  });
});

describe("computeVerdict - strong fit rules", () => {
  it("needs coverage >= 70, score >= 65 and no hard blocker", () => {
    expect(computeVerdict({ score: 65, mustHaveCoverage: 70, blockers: [] })).toBe("strong");
  });

  it("fails on coverage just under the bar", () => {
    expect(computeVerdict({ score: 90, mustHaveCoverage: 69, blockers: [] })).toBe("partial");
  });

  it("fails on score just under the bar", () => {
    expect(computeVerdict({ score: 64, mustHaveCoverage: 90, blockers: [] })).toBe("partial");
  });

  it.each(FIT_THRESHOLDS.hardBlockerTypes)("fails on a %s blocker", (type) => {
    const verdict = computeVerdict({
      score: 95,
      mustHaveCoverage: 95,
      blockers: [blocker(type)],
    });
    expect(verdict).not.toBe("strong");
  });

  it("still allows strong with a soft skill blocker", () => {
    expect(
      computeVerdict({ score: 95, mustHaveCoverage: 95, blockers: [blocker("skill")] }),
    ).toBe("strong");
  });

  it("allows strong with a location blocker, which is not a hard type", () => {
    expect(
      computeVerdict({ score: 95, mustHaveCoverage: 95, blockers: [blocker("location")] }),
    ).toBe("strong");
  });
});

describe("computeVerdict - partial is the fallback", () => {
  it("lands on partial between the two bars", () => {
    expect(computeVerdict({ score: 55, mustHaveCoverage: 60, blockers: [] })).toBe("partial");
  });
});

describe("buildFitReport", () => {
  it("carries the deterministic score and coverage through unchanged", () => {
    const report = matchScore(softwareResume, strongFitAnalysis);
    const fit = buildFitReport(report, judgment());
    expect(fit.score).toBe(report.score);
    expect(fit.mustHaveCoverage).toBe(report.mustHaveCoverage);
  });

  it("gives the strong-fit fixture a strong verdict", () => {
    const fit = buildFitReport(matchScore(softwareResume, strongFitAnalysis), judgment());
    expect(fit.verdict).toBe("strong");
  });

  it("gives the partial-fit fixture a partial verdict", () => {
    const fit = buildFitReport(
      matchScore(softwareResume, partialFitAnalysis),
      judgment({
        blockers: [blocker("skill", { requirement: "Kubernetes" })],
      }),
    );
    expect(fit.verdict).toBe("partial");
  });

  it("gives the out-of-scope fixture an out-of-scope verdict", () => {
    const fit = buildFitReport(
      matchScore(softwareResume, outOfScopeAnalysis),
      judgment({
        blockers: [
          blocker("credential", { requirement: "Registered Nurse licence" }),
          blocker("domain", { requirement: "ICU nursing experience" }),
        ],
      }),
    );
    expect(fit.verdict).toBe("out_of_scope");
  });

  it("supplies honest fallback copy when the AI leaves the narrative empty", () => {
    const fit = buildFitReport(
      matchScore(softwareResume, outOfScopeAnalysis),
      judgment({ blockers: [blocker("credential")] }),
    );
    expect(fit.summary).toContain("doesn't show yet");
    expect(fit.canTailorHelp).toContain("cannot add skills");
  });

  it("keeps the AI's own summary when it wrote one", () => {
    const fit = buildFitReport(
      matchScore(softwareResume, strongFitAnalysis),
      judgment({ summary: "Strong overlap on Node and Postgres.", canTailorHelp: "Reword only." }),
    );
    expect(fit.summary).toBe("Strong overlap on Node and Postgres.");
    expect(fit.canTailorHelp).toBe("Reword only.");
  });

  it("passes blockers and transferable skills through to the banner", () => {
    const transferable = [{ jdNeed: "Go", resumeEvidence: "Built REST services in Node" }];
    const fit = buildFitReport(
      matchScore(softwareResume, partialFitAnalysis),
      judgment({ blockers: [blocker("skill")], transferable }),
    );
    expect(fit.transferable).toEqual(transferable);
    expect(fit.blockers).toHaveLength(1);
  });
});
