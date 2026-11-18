import type { MatchReport } from "./match";
import type { Blocker, FitJudgment, FitReport, Verdict } from "./schema";

/**
 * All verdict thresholds live here so they are easy to tune in one place.
 * Every rule below is unit-tested in tests/fit.test.ts.
 */
export const FIT_THRESHOLDS = {
  outOfScope: {
    /** Must-have coverage below this is out of scope on its own. */
    mustHaveCoverage: 40,
    /** A domain blocker plus coverage below this is out of scope. */
    domainMustHaveCoverage: 60,
    /** A years blocker counts when the resume shows less than this fraction. */
    yearsRatio: 0.5,
  },
  strong: {
    mustHaveCoverage: 70,
    score: 65,
  },
  /** Blocker types that rule out a Strong verdict. */
  hardBlockerTypes: ["credential", "years", "seniority"] as const,
} as const;

/** Pull "5+ years" / "3 yrs" style numbers out of free text, as a fallback. */
export function parseYears(text: string): number | null {
  const m = text
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|yr)\b/);
  return m ? Number(m[1]) : null;
}

/**
 * A years blocker is disqualifying when the resume shows less than half the
 * required years. Prefers the AI's explicit numbers, and falls back to parsing
 * them out of the requirement/reason text.
 */
export function yearsBlockerIsDisqualifying(blocker: Blocker): boolean {
  if (blocker.type !== "years") return false;

  const required = blocker.requiredYears ?? parseYears(blocker.requirement) ?? parseYears(blocker.reason);
  if (required == null || required <= 0) {
    // No usable numbers: treat it as a soft gap rather than guessing.
    return false;
  }
  const shown = blocker.resumeYears ?? parseYears(blocker.reason) ?? 0;
  return shown < required * FIT_THRESHOLDS.outOfScope.yearsRatio;
}

export type VerdictInput = {
  score: number;
  mustHaveCoverage: number;
  blockers: Blocker[];
};

/** Why a verdict came out the way it did - shown in the UI and used in tests. */
export function verdictReasons(input: VerdictInput): string[] {
  const reasons: string[] = [];
  const { outOfScope } = FIT_THRESHOLDS;

  if (input.mustHaveCoverage < outOfScope.mustHaveCoverage) {
    reasons.push(
      `Must-have coverage is ${input.mustHaveCoverage}%, below the ${outOfScope.mustHaveCoverage}% floor.`,
    );
  }
  if (input.blockers.some((b) => b.type === "credential")) {
    reasons.push("A required credential, licence or degree is missing.");
  }
  const years = input.blockers.filter(yearsBlockerIsDisqualifying);
  if (years.length > 0) {
    reasons.push(
      `Experience is under half of what the role requires (${years[0].requirement}).`,
    );
  }
  if (
    input.blockers.some((b) => b.type === "domain") &&
    input.mustHaveCoverage < outOfScope.domainMustHaveCoverage
  ) {
    reasons.push(
      `Different domain, with must-have coverage at ${input.mustHaveCoverage}% (under ${outOfScope.domainMustHaveCoverage}%).`,
    );
  }
  if (reasons.length === 0 && computeVerdict(input) === "strong") {
    reasons.push(
      `Must-have coverage ${input.mustHaveCoverage}% and score ${input.score} are both above the Strong fit bar, with no hard blockers.`,
    );
  }
  return reasons;
}

/**
 * Verdict rules (plan section 7), combining the deterministic score with the
 * AI's blockers:
 *
 * Out of scope, if ANY of:
 *   - must-have coverage < 40%
 *   - a `credential` blocker
 *   - a `years` blocker where the resume shows less than half the required years
 *   - a `domain` blocker together with must-have coverage < 60%
 *
 * Strong fit, if ALL of:
 *   - must-have coverage >= 70%
 *   - no `credential`, `years` or `seniority` blocker
 *   - score >= 65
 *
 * Otherwise: Partial fit.
 */
export function computeVerdict(input: VerdictInput): Verdict {
  const { outOfScope, strong, hardBlockerTypes } = FIT_THRESHOLDS;

  const hasCredentialBlocker = input.blockers.some((b) => b.type === "credential");
  const hasDisqualifyingYears = input.blockers.some(yearsBlockerIsDisqualifying);
  const hasDomainBlocker = input.blockers.some((b) => b.type === "domain");

  if (
    input.mustHaveCoverage < outOfScope.mustHaveCoverage ||
    hasCredentialBlocker ||
    hasDisqualifyingYears ||
    (hasDomainBlocker && input.mustHaveCoverage < outOfScope.domainMustHaveCoverage)
  ) {
    return "out_of_scope";
  }

  const hasHardBlocker = input.blockers.some((b) =>
    (hardBlockerTypes as readonly string[]).includes(b.type),
  );
  if (
    input.mustHaveCoverage >= strong.mustHaveCoverage &&
    !hasHardBlocker &&
    input.score >= strong.score
  ) {
    return "strong";
  }

  return "partial";
}

/** Fallback copy, used when the AI leaves the narrative fields empty. */
function fallbackSummary(verdict: Verdict, match: MatchReport): string {
  switch (verdict) {
    case "strong":
      return `Good match. Your resume covers ${match.mustHaveCoverage}% of the must-haves and scores ${match.score}/100 on this job's keywords. Tailoring will sharpen the wording.`;
    case "partial":
      return `Partial match at ${match.score}/100, with ${match.mustHaveCoverage}% of the must-haves covered. Some requirements aren't evidenced in your resume yet.`;
    case "out_of_scope":
      return "This role needs skills or experience your resume doesn't show yet.";
  }
}

function fallbackCanTailorHelp(verdict: Verdict): string {
  if (verdict === "out_of_scope") {
    return "Tailoring can highlight transferable skills and use this job's exact terminology for things you have already done. It cannot add skills, credentials or years you don't have.";
  }
  return "Tailoring can reorder your strongest, most relevant points first and match this job's exact wording for skills you already have.";
}

/** Combine the deterministic match report with the AI's judgment. */
export function buildFitReport(match: MatchReport, judgment: FitJudgment): FitReport {
  const verdict = computeVerdict({
    score: match.score,
    mustHaveCoverage: match.mustHaveCoverage,
    blockers: judgment.blockers,
  });

  return {
    verdict,
    score: match.score,
    mustHaveCoverage: match.mustHaveCoverage,
    blockers: judgment.blockers,
    transferable: judgment.transferable,
    summary: judgment.summary.trim() || fallbackSummary(verdict, match),
    canTailorHelp: judgment.canTailorHelp.trim() || fallbackCanTailorHelp(verdict),
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  strong: "Strong fit",
  partial: "Partial fit",
  out_of_scope: "Out of scope",
};
