# Resume Tailor: Build Plan

A web app that takes your resume and a job description, then produces a tailored version of the resume for that job. You review every change before you accept it, see how well the resume matches the job's keywords, and export the final version to PDF or Word.

This file is the spec for Claude Code. Build it phase by phase. Each phase ends with acceptance criteria that must pass before you start the next one.

---

## 1. Goals and non-goals

**Goals**
- Import a resume from PDF, DOCX, or pasted text, and convert it into structured data.
- Paste a job description (JD), or provide its URL, and extract requirements and keywords from it.
- **Fit check:** before tailoring, tell the user whether the JD is a **Strong fit**, **Partial fit**, or **Out of scope** for their skills and experience, and explain why (missing must-haves, seniority gap, different domain, hard requirements such as a license or degree).
- **Tailor anyway:** whatever the verdict, the user can still tailor their existing resume to the JD. The fit check is advice and never blocks tailoring.
- Have the AI rewrite the summary, bullets, and skills order to match the JD, **using only facts already in the resume**.
- Show each change as a diff the user can accept, reject, or edit.
- Show a keyword match score before and after tailoring, plus a list of missing keywords.
- Keep one master resume and many tailored versions, one per job.
- Export to PDF and DOCX using a clean, ATS-friendly template.

**Non-goals (for v1)**
- Job board scraping or auto-applying
- Multi-user teams
- Fancy design templates. Use one ATS-safe template first.

**Hard rule (honesty guard):** the AI must never invent employers, titles, dates, degrees, metrics, certifications, or skills. If the JD asks for something the resume doesn't support, the app lists it under **Gaps** and does not write it into the resume.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One repo for UI and API routes |
| UI | Tailwind CSS + shadcn/ui | Fast, consistent components |
| AI | Anthropic API (`@anthropic-ai/sdk`), model `claude-sonnet-5-5` | Strong rewriting; use tool use with a JSON schema for structured output |
| Validation | Zod | Validate every AI response against the schema |
| PDF import | `pdf-parse` (or `unpdf`) | Extract text server-side |
| DOCX import | `mammoth` | DOCX → text/HTML |
| Storage | SQLite + Prisma (local), swappable to Postgres | Simple to start with |
| Diff view | `diff` (jsdiff) word-level diff | Inline highlights for changes |
| PDF export | `@react-pdf/renderer` | Deterministic, ATS-safe PDF |
| DOCX export | `docx` | Native Word file |
| Tests | Vitest (unit) + Playwright (one E2E flow) | |

Environment variables (`.env.local`):
```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
DATABASE_URL="file:./dev.db"
```

---

## 3. User flow

1. **Upload resume** → the app parses it into structured JSON → the user fixes any parsing mistakes in a form editor → saved as the **Master Resume**.
2. **New job** → paste the JD text (URL fetching is optional) → the app extracts the role, company, must-have skills, nice-to-have skills, and keywords.
3. **Fit check** → shows a verdict banner (Strong fit / Partial fit / Out of scope) with reasons, the match score, matched and missing keywords, and gaps. No AI rewriting yet.
   - **Strong fit** (green): "Good match. Tailoring will sharpen the wording."
   - **Partial fit** (amber): lists the missing must-haves and transferable skills the resume already shows.
   - **Out of scope** (red): "This role needs skills or experience your resume doesn't show yet," with the specific reasons (e.g. "Requires 5+ years in Java; resume shows 1 year", "Requires a CA license"). It also says what tailoring **can** do (highlight transferable skills, use the JD's terms) and what it **can't** (add skills you don't have).
   - Two buttons on every verdict: **Tailor my resume** (named **Tailor anyway** when the verdict is Out of scope) and **Skip this job**.
4. **Tailor** → the user picks an intensity (Light, Balanced, or Strong) → the AI returns proposed changes. If the verdict was Out of scope, the tailoring focuses on transferable skills and the closest related experience, and the honesty guard stays fully on.
5. **Review** → a side-by-side or inline diff for each section and bullet, with Accept, Reject, or Edit on each change, plus Accept all.
6. **Export** → PDF or DOCX, with the filename `Firstname_Lastname_Company_Role.pdf`.
7. **Versions** → a list of tailored resumes by job, each of which can be reopened and edited.

---

## 4. Data model

The structured resume JSON is the single source of truth. Never edit raw text.

```ts
// src/lib/schema.ts (Zod schemas mirror these types)
type Resume = {
  contact: { name: string; email?: string; phone?: string; location?: string; links: { label: string; url: string }[] };
  headline?: string;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: SkillGroup[];        // e.g. { name: "Languages", items: ["TypeScript", "Python"] }
  projects: Project[];
  certifications: { name: string; issuer?: string; date?: string }[];
};

type Experience = {
  id: string;                  // stable id, needed to map AI changes back
  company: string; title: string; location?: string;
  start: string; end?: string; // "2022-03" | "Present"
  bullets: Bullet[];
};
type Bullet = { id: string; text: string };
type Education = { id: string; school: string; degree?: string; field?: string; start?: string; end?: string; details?: string[] };
type Project = { id: string; name: string; link?: string; bullets: Bullet[] };
type SkillGroup = { id: string; name: string; items: string[] };

type JobAnalysis = {
  title: string; company?: string; seniority?: string;
  mustHave: string[]; niceToHave: string[];
  keywords: { term: string; weight: 1 | 2 | 3; synonyms: string[] }[]; // 3 = critical
  responsibilities: string[];
};

type FitReport = {
  verdict: "strong" | "partial" | "out_of_scope";
  score: number;                 // keyword match score from match.ts (0-100)
  mustHaveCoverage: number;      // % of must-have skills the resume shows
  blockers: { requirement: string; reason: string; type: "skill" | "years" | "seniority" | "domain" | "credential" | "location" }[];
  transferable: { jdNeed: string; resumeEvidence: string }[]; // related skills the resume already has
  summary: string;               // 1–2 plain sentences shown in the banner
  canTailorHelp: string;         // what tailoring can realistically improve
};

type Change = {
  id: string;
  target: { section: "summary" | "headline" | "experience" | "projects" | "skills"; itemId?: string; bulletId?: string };
  kind: "rewrite" | "reorder" | "remove";
  before: string; after: string;
  reason: string;               // why this helps for this JD
  keywordsAdded: string[];
  sourceEvidence: string;       // the original resume text that justifies the claim
  status: "pending" | "accepted" | "rejected" | "edited";
};
```

Prisma tables: `Resume` (master, JSON column), `Job` (JD text, JobAnalysis JSON, FitReport JSON, `skipped` flag), `TailoredVersion` (jobId, resume JSON, changes JSON, scoreBefore, scoreAfter, createdAt).

---

## 5. API routes

| Route | Input | Output |
|---|---|---|
| `POST /api/resume/parse` | file (pdf/docx) or text | `Resume` (AI converts raw text into the schema) |
| `POST /api/job/analyze` | JD text | `JobAnalysis` |
| `POST /api/match` | resume, analysis | score report (deterministic, **no AI**) |
| `POST /api/fit` | resume, analysis | `FitReport` (score from `match.ts` + AI judgment on years, seniority, domain, credentials) |
| `POST /api/tailor` | resume, analysis, fitReport, intensity | `Change[]` + gaps (always allowed, whatever the verdict) |
| `POST /api/export/pdf` | resume | PDF file |
| `POST /api/export/docx` | resume | DOCX file |

All AI routes:
- Use **tool use with a JSON schema** so Claude returns structured data. Validate the response with Zod, and retry once with the validation error included if it fails.
- Run server-side only, so the API key never reaches the browser.
- Stream progress to the UI where it helps (tailoring takes the longest).

---

## 6. AI prompts (in `src/lib/prompts.ts`)

**Parse resume**: "Convert this resume text into the given schema. Preserve wording exactly. Do not summarize, merge, or invent. Assign a stable id to each experience, project, and bullet. Leave a field empty if it's missing."

**Analyze JD**: "Extract the title, company, seniority, must-have and nice-to-have skills, and responsibilities. Produce 15–30 ATS keywords with a weight (3 = explicitly required, 2 = repeated or important, 1 = mentioned once) and common synonyms (e.g. 'JS' for 'JavaScript')."

**Fit check**: "Compare the resume to the job analysis. Identify blockers: must-have skills with no evidence, required years of experience the resume doesn't reach (calculate from the dates), seniority mismatch (e.g. intern applying for a lead role), a different domain, or required credentials, degrees, or licenses that are missing. List transferable skills with the resume text that shows them. Be honest and specific. Don't soften an out-of-scope verdict, and don't be discouraging when the fit is good. Return a FitReport."

**Tailor** (the core prompt):
```
You are an expert resume editor. Tailor the resume to the job.

RULES
1. Use ONLY facts present in the resume. Never add employers, titles, dates, degrees,
   tools, metrics, or achievements that are not supported by the original text.
2. Every change must include `sourceEvidence` quoting the original text it's based on.
3. Prefer the JD's exact terminology where the resume already shows that skill
   (e.g. resume says "built REST services in Node", JD says "Node.js APIs" → use "Node.js APIs").
4. Start bullets with strong action verbs; keep each bullet under ~30 words; keep existing numbers.
5. Reorder skills and bullets so the most relevant come first.
6. Requirements the resume can't support go in `gaps`, never into the resume.
7. Intensity: light = keywords and ordering only; balanced = rewrite summary + top bullets;
   strong = rewrite summary, headline, and most bullets.
Return changes referencing the ids in the resume JSON.
```

**Post-check (a second, cheaper call or a code check)**: for each `after`, confirm that every number, tool, and proper noun appears somewhere in the original resume. Flag any that don't with a warning badge in the review UI.

---

## 7. Match score (deterministic, in `src/lib/match.ts`)

Run this in code rather than with the AI, so the score is repeatable and explainable.

1. Normalize text: lowercase, strip punctuation, simple stemming, and expand synonyms from `JobAnalysis.keywords[].synonyms`.
2. For each keyword, check whether it appears in the resume, with extra credit when it appears in experience bullets (not just the skills list).
3. `score = Σ(weight × found) / Σ(weight) × 100`, and report must-have coverage separately.
4. Output: `{ score, mustHaveCoverage, matched: string[], missing: string[], byKeyword: {...} }`.
5. Show the before and after scores side by side once tailoring is done.

**Fit verdict rules** (in `src/lib/fit.ts`, combining the code score with the AI's blockers):
- **Out of scope** if any of these are true: must-have coverage < 40%; a `credential` blocker (required license or degree missing); a `years` blocker where the resume shows less than half the required years; or a `domain` blocker together with must-have coverage < 60%.
- **Strong fit** if must-have coverage ≥ 70%, there are no blockers of type `credential`, `years`, or `seniority`, and the score is ≥ 65.
- Otherwise **Partial fit**.
- Keep the thresholds in one config object so they're easy to tune. Unit-test each rule.

Unit-test this thoroughly (synonyms, plurals, multi-word terms like "machine learning").

---

## 8. UI screens

- **Dashboard** (`/`): the master resume card, a "New job" button, and a list of tailored versions with company, role, score, and date.
- **Resume editor** (`/resume`): form editor for each section (add, remove, and drag-reorder bullets), with a live preview on the right.
- **Job workspace** (`/jobs/[id]`), in three columns:
  - Top: the **fit verdict banner** (green, amber, or red) with the summary, the blockers list, the transferable skills, and the **Tailor my resume / Tailor anyway** and **Skip this job** buttons.
  - Left: the JD text with matched keywords highlighted green and missing ones red.
  - Center: the change list or diff review (Accept, Reject, and Edit per change; Accept all; warning badges).
  - Right: a live resume preview, plus a score gauge for before and after.
- **Export dialog**: template (one ATS template for v1), PDF or DOCX, filename preview.

ATS template rules: single column, standard section headings (Summary, Experience, Education, Skills), real text (no images or text in shapes), common fonts, and no tables for layout.

---

## 9. Folder structure

```
src/
  app/
    page.tsx                 # dashboard
    resume/page.tsx
    jobs/[id]/page.tsx
    api/resume/parse/route.ts
    api/job/analyze/route.ts
    api/match/route.ts
    api/tailor/route.ts
    api/export/pdf/route.ts
    api/export/docx/route.ts
  components/                # ResumePreview, DiffItem, ScoreGauge, KeywordHighlighter, ...
  lib/
    schema.ts  prompts.ts  anthropic.ts  match.ts  parse.ts  export-pdf.tsx  export-docx.ts
prisma/schema.prisma
tests/  (vitest + playwright)
fixtures/ sample-resume.pdf, sample-resume.docx, sample-jd.txt
```

---

## 10. Build phases

### Phase 1: Skeleton and resume input
- Next.js + Tailwind + shadcn + Prisma set up; `.env.example`.
- Zod schemas for `Resume`, `JobAnalysis`, `Change`.
- `/api/resume/parse` for PDF, DOCX, and text; resume form editor; save the master resume.
- ✅ Uploading the fixture PDF and DOCX gives a correctly structured resume that can be edited and persists after a reload.

### Phase 2: JD analysis, match score, and fit check
- `/api/job/analyze`, `match.ts` with unit tests, JD keyword highlighting, score gauge.
- `/api/fit`, `fit.ts` verdict rules, fit verdict banner with the Tailor and Skip buttons.
- Add fixtures: `jd-strong-fit.txt`, `jd-partial-fit.txt`, `jd-out-of-scope.txt` (e.g. a software resume against a nursing or chartered accountant JD).
- ✅ For the fixture JD, the analysis returns 15 or more keywords; the score is identical across repeated runs; each of the three fit fixtures gets the expected verdict; **Tailor anyway** works on the out-of-scope fixture; tests pass.

### Phase 3: Tailoring and review (the core)
- `/api/tailor` with the honesty rules, Zod validation and retry, and the fabrication post-check.
- Diff review UI; applying accepted changes produces a new `TailoredVersion`.
- ✅ Every change maps to a real id; rejecting all changes reproduces the original exactly; the after score is at least the before score on the fixture; no new numbers or employers appear (automated test).

### Phase 4: Export
- PDF and DOCX export from the same resume JSON with the ATS template.
- ✅ The exported PDF's text can be extracted again with `pdf-parse` in the same order; the DOCX opens in Word and Google Docs.

### Phase 5: Versions and polish
- Dashboard version list, duplicate or rename versions, loading and error states, empty states, keyboard access.
- Optional: a cover letter generator using the same honesty rules, and JD fetching from a URL.
- ✅ The Playwright E2E test passes: upload → new job → tailor → accept all → export PDF.

---

## 11. Quality and safety checklist
- API key server-side only; rate-limit the AI routes.
- Resume data stays local (SQLite); no third-party analytics on resume content.
- Every AI output is validated with Zod; malformed output never reaches the UI.
- The fabrication check runs on every tailoring result.
- Clear errors: "Couldn't read this PDF. It may be a scanned image. Try DOCX or paste the text."

---

## 12. Future ideas (after v1)
- Multiple templates; a browser extension that grabs JDs from LinkedIn or Naukri pages; tracking application status for each version; an interview-prep question list generated from the gaps.