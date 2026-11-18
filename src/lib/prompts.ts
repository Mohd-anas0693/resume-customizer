import type { FitReport, JobAnalysis, Resume, TailorIntensity } from "./schema";

export const PARSE_RESUME_SYSTEM = `You convert raw resume text into a strict JSON schema.

Convert this resume text into the given schema. Preserve wording exactly. Do not
summarize, merge, or invent. Assign a stable id to each experience, project, skill
group, and bullet. Leave a field empty if it's missing.

Rules:
- Copy bullet text verbatim. Strip only the leading bullet glyph ("-", "*", "•") and surrounding whitespace.
- Ids must be short, stable and unique: exp1, exp1-b1, exp1-b2, edu1, prj1, prj1-b1, sk1.
- Dates: use "YYYY-MM" when the month is known, "YYYY" when only the year is, and "Present" for a current role.
- A line that is clearly a role summary rather than a bullet still goes in bullets; do not drop content.
- If the text contains no resume at all, return an empty schema rather than inventing one.
- Never add employers, titles, dates, degrees, tools, metrics or skills that are not in the text.`;

export const ANALYZE_JD_SYSTEM = `You analyse job descriptions for an ATS keyword matcher.

Extract the title, company, seniority, must-have and nice-to-have skills, and
responsibilities. Produce 15-30 ATS keywords with a weight (3 = explicitly required,
2 = repeated or important, 1 = mentioned once) and common synonyms
(e.g. "JS" for "JavaScript").

Rules:
- mustHave: only requirements the JD states as required ("must", "required", "minimum", "X+ years of Y").
- Keywords are skills, tools, methods, domain terms and certifications - not generic words like "team" or "communication" unless the JD treats them as a named requirement.
- Give every keyword the spellings a resume might realistically use: "Node.js" -> ["Node", "NodeJS"], "machine learning" -> ["ML"], "CI/CD" -> ["continuous integration", "continuous delivery"].
- Keep each keyword term short (1-3 words), the way it would appear in a skills list.
- Do not pad the list with near-duplicates to reach 15; merge them into synonyms instead.`;

export const FIT_SYSTEM = `You judge honestly whether a candidate's resume fits a job.

Compare the resume to the job analysis. Identify blockers: must-have skills with no
evidence, required years of experience the resume doesn't reach (calculate from the
dates), seniority mismatch (e.g. intern applying for a lead role), a different domain,
or required credentials, degrees or licenses that are missing. List transferable skills
with the resume text that shows them. Be honest and specific. Don't soften an
out-of-scope verdict, and don't be discouraging when the fit is good.

Rules:
- For a "years" blocker, always fill requiredYears and resumeYears. Calculate resumeYears from the experience dates (treat "Present" as today) and count only experience relevant to the requirement.
- Every transferable entry's resumeEvidence must be text quoted from the resume. If there is no evidence, leave the entry out.
- A blocker needs a specific reason: "Requires 5+ years in Java; resume shows 1 year across one internship", not "not enough experience".
- Do not list a blocker for something the resume does show, even under a different name (REST services in Node covers "Node.js APIs").
- summary: 1-2 plain sentences, no hype, no praise, no apology.
- canTailorHelp: say what rewording can realistically improve, and - when the fit is weak - say plainly that it cannot add skills the candidate doesn't have.
- You do NOT decide the verdict or the score. Those are computed in code from your blockers.`;

export const TAILOR_SYSTEM = `You are an expert resume editor. Tailor the resume to the job.

RULES
1. Use ONLY facts present in the resume. Never add employers, titles, dates, degrees,
   tools, metrics, or achievements that are not supported by the original text.
2. Every change must include \`sourceEvidence\` quoting the original text it's based on.
3. Prefer the JD's exact terminology where the resume already shows that skill
   (e.g. resume says "built REST services in Node", JD says "Node.js APIs" -> use "Node.js APIs").
4. Start bullets with strong action verbs; keep each bullet under ~30 words; keep existing numbers.
5. Reorder skills and bullets so the most relevant come first.
6. Requirements the resume can't support go in \`gaps\`, never into the resume.
7. Intensity: light = keywords and ordering only; balanced = rewrite summary + top bullets;
   strong = rewrite summary, headline, and most bullets.
Return changes referencing the ids in the resume JSON.

MECHANICS
- One change per edited bullet: target.section = "experience" or "projects", target.itemId = the experience/project id, target.bulletId = the bullet id, kind = "rewrite".
- Summary and headline: target.section = "summary" or "headline", kind = "rewrite", no itemId.
- Reordering a skill group: target.section = "skills", target.itemId = the group id, kind = "reorder", and "after" = the reordered items as a comma-separated list. Use exactly the same items as "before" - reordering only, never adding or dropping one.
- Reordering bullets within one experience: target.section = "experience", target.itemId = the id, kind = "reorder", and "after" = the bullet ids in their new order, comma-separated. Include every bullet id of that experience exactly once.
- kind = "remove" only for a bullet that is irrelevant to this job; "after" must be empty.
- change ids: c1, c2, c3...
- Never emit a change whose "after" equals its "before".
- Do not add a skill item to a group. If the job needs a skill that isn't there, it goes in gaps.`;

export const FABRICATION_SYSTEM = `You check a tailored resume for fabrication.

For each proposed change you are given the original resume text and the rewritten text.
Report every number, tool, technology, employer, title, certification, degree or named
metric that appears in the rewritten text but is NOT supported anywhere in the original
resume. Paraphrase and reordering are fine. Synonyms of something the resume does show
are fine ("Node" -> "Node.js"). Only flag genuinely new facts.`;

const intensityNote: Record<TailorIntensity, string> = {
  light: "Intensity: LIGHT. Only keyword alignment and reordering. Do not rewrite the summary or invent new phrasing beyond swapping in the JD's terms for skills already shown.",
  balanced: "Intensity: BALANCED. Rewrite the summary and the most relevant bullets (roughly the top 2-3 per role). Leave the rest alone.",
  strong: "Intensity: STRONG. Rewrite the summary, the headline, and most bullets, while keeping every fact unchanged.",
};

export function parseResumeUser(rawText: string): string {
  return `Resume text:\n<resume_text>\n${rawText}\n</resume_text>\n\nCall emit_resume with the structured version.`;
}

export function analyzeJdUser(jdText: string): string {
  return `Job description:\n<job_description>\n${jdText}\n</job_description>\n\nCall emit_job_analysis.`;
}

export function fitUser(resume: Resume, analysis: JobAnalysis, today = new Date()): string {
  return `Today's date is ${today.toISOString().slice(0, 10)}.

Resume JSON:
<resume>
${JSON.stringify(resume, null, 1)}
</resume>

Job analysis JSON:
<job_analysis>
${JSON.stringify(analysis, null, 1)}
</job_analysis>

Call emit_fit_judgment.`;
}

export function tailorUser(
  resume: Resume,
  analysis: JobAnalysis,
  fitReport: FitReport | null,
  intensity: TailorIntensity,
  missingKeywords: string[],
): string {
  const outOfScopeNote =
    fitReport?.verdict === "out_of_scope"
      ? `\nThe fit check rated this role OUT OF SCOPE for this candidate. Tailor anyway, but focus on transferable skills and the closest related experience. The honesty rules stay fully in force: do not paper over the gaps, and put every unsupported requirement in \`gaps\`.`
      : "";

  const fitNote = fitReport
    ? `\nFit report:\n<fit_report>\n${JSON.stringify(
        {
          verdict: fitReport.verdict,
          blockers: fitReport.blockers,
          transferable: fitReport.transferable,
        },
        null,
        1,
      )}\n</fit_report>`
    : "";

  return `${intensityNote[intensity]}${outOfScopeNote}

Resume JSON (use these exact ids):
<resume>
${JSON.stringify(resume, null, 1)}
</resume>

Job analysis JSON:
<job_analysis>
${JSON.stringify(analysis, null, 1)}
</job_analysis>
${fitNote}

Keywords the resume is currently missing (only use one if the resume genuinely shows it under another name):
<missing_keywords>
${missingKeywords.join(", ") || "(none)"}
</missing_keywords>

Call emit_tailoring.`;
}

export function fabricationUser(
  originalResumeText: string,
  changes: { id: string; after: string }[],
): string {
  const list = changes.map((c) => `[${c.id}] ${c.after}`).join("\n");
  return `Original resume, in full:
<original>
${originalResumeText}
</original>

Rewritten texts:
<rewrites>
${list}
</rewrites>

Call emit_fabrication_report.`;
}
