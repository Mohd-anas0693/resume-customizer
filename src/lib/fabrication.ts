/**
 * Fabrication post-check (plan section 6).
 *
 * For every rewritten string, confirm that each number, tool and proper noun
 * appears somewhere in the original resume. Runs in code, so it is free,
 * deterministic and testable - no second model call needed.
 */

import type { ProposedChange } from "./schema";

/** Common capitalised words that carry no factual claim. */
const STOPWORDS = new Set(
  (
    "a an and the of for to in on at by with from as into over under per via using used use " +
    "i my we our it its this that these those they them their he she his her you your " +
    "led lead leads managed manage built build building built created create created designed " +
    "design developed develop drove drive delivered deliver improved improve reduced reduce " +
    "increased increase launched launch owned own shipped ship scaled scale automated automate " +
    "migrated migrate refactored refactor optimised optimized optimise optimize wrote write " +
    "architected architect implemented implement maintained maintain mentored mentor coordinated " +
    "collaborated partnered supported analysed analyzed researched tested debugged documented " +
    "january february march april may june july august september october november december " +
    "mon tue wed thu fri sat sun present current today " +
    "team teams project projects product products customer customers user users client clients " +
    "company business engineering engineer developer development software systems system service " +
    "services platform platforms application applications feature features release releases " +
    "code codebase data database quality performance reliability security scalability latency " +
    "cost time growth revenue across within while after before during through including such " +
    "end new first second third top key core main primary senior junior lead staff principal " +
    "year years month months week weeks day days quarter quarters hour hours " +
    "percent percentage more less than over under up down by about around approximately " +
    "responsible ownership owner delivery deliverables roadmap stakeholders stakeholder"
  ).split(/\s+/),
);

/**
 * Reduce a token to its comparable core: "Node.js" -> "nodejs", "CI/CD" -> "cicd".
 * "+" and "#" are kept, because dropping them would collapse "C++" and "C#"
 * to a single character and lose the skill entirely.
 */
export function techKey(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9+#]/g, "");
}

/** Numbers that carry a factual claim: 40, 2.5, 99.9, 1,200, 15%, $2M, 3x. */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[0].replace(/,/g, "").replace(/\.0+$/, ""));
  return out;
}

/**
 * Proper nouns and tool names: capitalised words that aren't just a sentence
 * start, plus all-caps acronyms and anything with internal punctuation
 * ("Node.js", "CI/CD", "C++", "Next.js").
 */
export function extractProperNouns(text: string): string[] {
  const out: string[] = [];
  const tokens = text.split(/[\s,;:()[\]"']+/).filter(Boolean);

  tokens.forEach((raw, index) => {
    const token = raw.replace(/^[^A-Za-z0-9+#]+/, "").replace(/[.;:,]+$/, "");
    if (!token) return;
    if (/^\d/.test(token)) return; // handled by extractNumbers

    const isAcronym = /^[A-Z0-9][A-Z0-9+#./-]{1,}$/.test(token) && /[A-Z]/.test(token);
    const isDotted = /[A-Za-z][./+#][A-Za-z0-9]/.test(token);
    const isCapitalised = /^[A-Z][a-z]/.test(token);
    const isCamel = /^[A-Za-z]+[A-Z]/.test(token) && !isAcronym;

    if (!isAcronym && !isDotted && !isCapitalised && !isCamel) return;
    // Lone capitalised word at the start of the string: likely just a sentence start.
    if (isCapitalised && index === 0 && !isDotted) return;
    const key = techKey(token);
    if (STOPWORDS.has(key)) return;
    // "C++" and "C#" have a one-character core but are still real skills.
    if (key.length < 2 && !/[+#]/.test(key)) return;

    out.push(token);
  });

  return out;
}

export type SupportIndex = {
  numbers: Set<string>;
  keys: string[];
};

export function buildSupportIndex(originalText: string): SupportIndex {
  const numbers = new Set(extractNumbers(originalText));
  const keys = Array.from(
    new Set(
      originalText
        .split(/[\s,;:()[\]"'\n]+/)
        .map(techKey)
        .filter((k) => k.length >= 2),
    ),
  );
  return { numbers, keys };
}

/**
 * A term is supported when its core appears in the original, or when the
 * original holds a token that is a prefix of it (or vice versa) by at least
 * 3 characters - so a resume saying "Node" supports "Node.js", and "Postgres"
 * supports "PostgreSQL".
 */
export function isTermSupported(term: string, index: SupportIndex): boolean {
  const key = techKey(term);
  if (!key) return true;
  if (index.keys.includes(key)) return true;
  return index.keys.some(
    (k) =>
      (k.length >= 3 && key.startsWith(k)) ||
      (key.length >= 3 && k.startsWith(key)) ||
      (key.length >= 4 && k.includes(key)) ||
      (k.length >= 4 && key.includes(k)),
  );
}

export type FabricationFinding = {
  changeId: string;
  /** Terms in `after` with no support in the original resume. */
  unsupported: string[];
};

/** Warnings for one rewritten string. */
export function checkText(after: string, index: SupportIndex): string[] {
  const unsupported: string[] = [];

  for (const n of extractNumbers(after)) {
    if (!index.numbers.has(n)) unsupported.push(n);
  }
  for (const noun of extractProperNouns(after)) {
    if (!isTermSupported(noun, index)) unsupported.push(noun);
  }

  return Array.from(new Set(unsupported));
}

/** Run the check across a whole tailoring result. */
export function checkChanges(
  changes: ProposedChange[],
  originalResumeText: string,
): Record<string, string[]> {
  const index = buildSupportIndex(originalResumeText);
  const byChange: Record<string, string[]> = {};

  for (const change of changes) {
    if (!change.after.trim()) continue;
    // A reorder of bullet ids or skill items introduces no new text to check,
    // but we still verify every piece is something the resume already had.
    const unsupported = checkText(change.after, index);
    if (unsupported.length) {
      byChange[change.id] = unsupported.map(
        (term) => `"${term}" doesn't appear in your original resume - check this before you send it.`,
      );
    }
  }

  return byChange;
}
