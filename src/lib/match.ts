import type { JobAnalysis, Keyword, Resume } from "./schema";

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

/** Characters that are part of a tech term rather than punctuation. */
const DROP = /[^a-z0-9+#./\s-]/g;

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(DROP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Small, predictable stemmer. Deliberately not Porter: we only need
 * plural/gerund folding, and the result must stay explainable to the user.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("sses")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("ses")) return w.slice(0, -2);

  if (w.length > 3 && w.endsWith("es") && !/[aeiou]es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);

  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 5 && w.endsWith("ed")) w = w.slice(0, -2);

  // Drop a trailing "e" so a singular converges on its plural's stem:
  // "services" -> "servic" and "service" -> "servic"; likewise node/nodes.
  if (w.length > 3 && w.endsWith("e") && !w.endsWith("ee")) w = w.slice(0, -1);

  return w;
}

/** Normalised + stemmed token stream, joined so multi-word terms stay findable. */
export function canonical(input: string): string {
  return normalize(input)
    .split(" ")
    .filter(Boolean)
    .map(stem)
    .join(" ");
}

/* ------------------------------------------------------------------ *
 * Resume text surfaces
 * ------------------------------------------------------------------ */

export type ResumeText = {
  /** Everything, canonicalised. */
  all: string;
  /** Experience + project bullets only - evidence of actually doing the thing. */
  bullets: string;
};

export function resumeText(resume: Resume): ResumeText {
  const bulletParts: string[] = [];
  for (const exp of resume.experience) {
    bulletParts.push(exp.title, exp.company);
    for (const b of exp.bullets) bulletParts.push(b.text);
  }
  for (const p of resume.projects) {
    bulletParts.push(p.name);
    for (const b of p.bullets) bulletParts.push(b.text);
  }

  const otherParts: string[] = [
    resume.headline ?? "",
    resume.summary ?? "",
    ...resume.skills.flatMap((g) => [g.name, ...g.items]),
    ...resume.education.flatMap((e) => [e.school, e.degree ?? "", e.field ?? "", ...e.details]),
    ...resume.certifications.flatMap((c) => [c.name, c.issuer ?? ""]),
  ];

  const bullets = canonical(bulletParts.join(" . "));
  return { all: `${bullets} . ${canonical(otherParts.join(" . "))}`, bullets };
}

/** Word-boundary-aware containment on canonicalised strings. */
export function containsTerm(haystack: string, term: string): boolean {
  const needle = canonical(term);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}($|\\s)`).test(haystack);
}

/** A keyword matches if its term or any of its synonyms is present. */
function findVariant(haystack: string, keyword: Keyword): string | null {
  for (const variant of [keyword.term, ...keyword.synonyms]) {
    if (containsTerm(haystack, variant)) return variant;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

export type KeywordHit = {
  term: string;
  weight: 1 | 2 | 3;
  found: boolean;
  /** Found inside experience/project bullets, not just the skills list. */
  inBullets: boolean;
  /** Which spelling matched (the term itself, or a synonym). */
  matchedAs: string | null;
};

export type MatchReport = {
  score: number;
  mustHaveCoverage: number;
  matched: string[];
  missing: string[];
  mustHaveMatched: string[];
  mustHaveMissing: string[];
  byKeyword: Record<string, KeywordHit>;
};

/** Credit for a keyword evidenced in a bullet, vs. one that is merely listed. */
export const BULLET_CREDIT = 1;
export const LISTED_CREDIT = 0.8;

/**
 * Deterministic keyword match score. No AI: the same inputs always produce the
 * same number, and every part of it can be shown to the user.
 *
 *   score = sum(weight * credit) / sum(weight) * 100
 *
 * credit is 1.0 when the term appears in an experience/project bullet, 0.8 when
 * it only appears elsewhere (skills list, summary, education), 0 when absent.
 */
export function matchScore(resume: Resume, analysis: JobAnalysis): MatchReport {
  const text = resumeText(resume);

  const byKeyword: Record<string, KeywordHit> = {};
  const matched: string[] = [];
  const missing: string[] = [];

  let earned = 0;
  let total = 0;

  // Sorted so output is stable regardless of the order the AI emitted keywords.
  const keywords = [...analysis.keywords].sort((a, b) => a.term.localeCompare(b.term, "en"));

  for (const keyword of keywords) {
    const matchedAs = findVariant(text.all, keyword);
    const found = matchedAs !== null;
    const inBullets = found && findVariant(text.bullets, keyword) !== null;

    byKeyword[keyword.term] = { term: keyword.term, weight: keyword.weight, found, inBullets, matchedAs };

    total += keyword.weight;
    if (found) {
      earned += keyword.weight * (inBullets ? BULLET_CREDIT : LISTED_CREDIT);
      matched.push(keyword.term);
    } else {
      missing.push(keyword.term);
    }
  }

  const score = total === 0 ? 0 : Math.round((earned / total) * 100);

  const mustHaveMatched: string[] = [];
  const mustHaveMissing: string[] = [];
  for (const need of [...analysis.mustHave].sort((a, b) => a.localeCompare(b, "en"))) {
    if (mustHaveIsCovered(text, need, analysis)) mustHaveMatched.push(need);
    else mustHaveMissing.push(need);
  }
  const mustHaveCoverage =
    analysis.mustHave.length === 0
      ? 100
      : Math.round((mustHaveMatched.length / analysis.mustHave.length) * 100);

  return { score, mustHaveCoverage, matched, missing, mustHaveMatched, mustHaveMissing, byKeyword };
}

/**
 * A must-have counts as covered when its own text is present, or when a
 * keyword whose term/synonym overlaps it is present - so "React.js" in the
 * keyword list can cover a must-have written as "React".
 */
function mustHaveIsCovered(text: ResumeText, need: string, analysis: JobAnalysis): boolean {
  if (containsTerm(text.all, need)) return true;
  const needCanon = canonical(need);
  if (!needCanon) return false;
  for (const keyword of analysis.keywords) {
    const variants = [keyword.term, ...keyword.synonyms];
    const related = variants.some((v) => {
      const vc = canonical(v);
      return vc.length > 1 && (vc === needCanon || needCanon.includes(vc) || vc.includes(needCanon));
    });
    if (related && findVariant(text.all, keyword)) return true;
  }
  return false;
}
