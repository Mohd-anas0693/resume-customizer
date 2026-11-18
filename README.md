# Resume Tailor

Takes your resume and a job description, tells you honestly whether you fit, then
tailors the resume to that job using **only facts already in your resume**. You
review every change before it is applied, see a keyword match score before and
after, and export an ATS-safe PDF or DOCX.

Built to the spec in [plan.md](plan.md).

## Quick start

```bash
npm install
cp .env.example .env.local        # then add your ANTHROPIC_API_KEY
npm run db:push                   # creates prisma/dev.db
npm run dev                       # http://localhost:3000
```

`.env.local` — **one** provider key is enough. OpenAI is the default; Claude and
Gemini are optional alternatives:

```
OPENAI_API_KEY=sk-...            # OpenAI (GPT), the default
# ANTHROPIC_API_KEY=sk-ant-...   # Anthropic (Claude), optional
# GEMINI_API_KEY=...             # Google (Gemini), optional
DATABASE_URL="file:./dev.db"
```

Comment out the providers you aren't using rather than leaving them assigned
but empty: `FOO=` counts as "set to empty" and shadows the same variable in
`.env`.

The app works without any key for everything deterministic (scoring, editing,
export); the AI routes return a clear 503 naming the provider and the variable
that is missing.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Vitest unit suite (137 tests, no API key needed) |
| `npm run test:e2e` | Playwright flow; the AI test skips without a key |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Sync the SQLite schema |
| `npm run fixtures` | Regenerate `fixtures/sample-resume.{pdf,docx}` |

## How it works

1. **Import** (`/resume`) — upload a PDF or DOCX, or paste text. The text is
   extracted server-side, then Claude converts it into the `Resume` JSON schema
   with a stable id on every experience, project, skill group and bullet. You fix
   any parsing mistakes in the form editor and save it as your master resume.
2. **New job** (`/`) — paste a job description. Claude extracts the title,
   company, seniority, must-haves, nice-to-haves, responsibilities and 15–30
   weighted ATS keywords with synonyms.
3. **Fit check** (`/jobs/[id]`) — a **Strong fit / Partial fit / Out of scope**
   banner with the reasons, the blockers, the transferable skills you already
   show, and the match score. The verdict is **advice, never a gate**: every
   verdict offers *Tailor my resume* (named *Tailor anyway* when out of scope)
   and *Skip this job*.
4. **Tailor** — pick Light, Balanced or Strong intensity. Claude returns
   proposed changes, each carrying a `reason` and a `sourceEvidence` quote from
   your original resume, plus a list of **gaps** it refused to write in.
5. **Review** — inline or side-by-side diff per change, with Accept, Reject and
   Edit, plus Accept all / Reject all. The preview and the after-score update as
   you go. Nothing touches the resume until you accept it.
6. **Export** — PDF or DOCX from one ATS-safe template, named
   `Firstname_Lastname_Company_Role.pdf`.

## Choosing AI models

Three providers are supported — **OpenAI (GPT)**, **Anthropic (Claude)** and
**Google (Gemini)**. None is required: set the key for whichever one you want
and ignore the others. Each of the four AI tasks can use a different provider
and model, chosen under **AI models** in the nav (`/settings`):

| Task | What it does | Model tier used |
|---|---|---|
| Resume parsing | Mechanical transcription into the schema | cheapest |
| Job analysis | Keywords and requirements out of the JD | balanced |
| Fit check | Blockers and transferable skills | balanced |
| Tailoring | The rewriting itself | strongest |

Each provider supplies its own cheap/balanced/best ladder, so the defaults put a
cheap model on the mechanical work and the strongest on tailoring whichever
provider you use:

| Provider | cheapest | balanced | strongest |
|---|---|---|---|
| OpenAI | `gpt-5.5-mini` | `gpt-5.5-mini` | `gpt-5.5` |
| Anthropic | `claude-haiku-5-5` | `claude-sonnet-5-5` | `claude-opus-5-5` |
| Google | `gemini-3-flash` | `gemini-3-flash` | `gemini-3-pro` |

The defaults are built from the first provider that has a key, in the order
OpenAI → Anthropic → Google. `PROVIDER_DEFAULT` changes that order, and
`OPENAI_MODEL` / `ANTHROPIC_MODEL` / `GEMINI_MODEL` pin one model for every task
on that provider.

**Model lists are fetched from the provider, not hardcoded.** "Refresh model
lists" on the settings page calls each provider's models endpoint and shows what
your key can actually use — vendors' line-ups change faster than any list
committed to a repo. Until you refresh, the picker shows a few suggestions, and
the model field accepts any id you type.

The job workspace also has a per-run model override next to the intensity
control, so you can try a different model on one tailoring run without changing
your defaults.

### How one interface covers three providers

`src/lib/ai/` holds the seam. Each provider implements `AiProvider`
(`generateStructured`, `listModels`, `isConfigured`), and `callStructured()`
does the Zod validation and the single retry once, for all of them — so
behaviour does not drift between providers.

The tricky part is that all three accept JSON Schema but accept *different
subsets*. `src/lib/ai/json-schema.ts` normalises one schema into the strictest
common dialect (OpenAI strict mode: every object closed, every property
required, optional fields expressed as nullable unions), which Gemini's
`responseJsonSchema` and Anthropic's structured outputs both accept. All three
therefore return nulls for absent fields, and `stripNulls` turns them back into
missing keys so the Zod schemas' `.optional()` and `.default()` still apply.
Each provider maps the task's effort onto its own control
(`output_config.effort`, `reasoning.effort`, `thinkingConfig.thinkingLevel`).

Nothing deterministic depends on the model: the keyword score, the fit verdict
rules, the fabrication check and the exports all run in code.

## The honesty guard

The AI is told never to invent employers, titles, dates, degrees, metrics,
certifications or skills, and that unsupported requirements belong in `gaps`.
Three mechanisms back that up rather than trusting the prompt:

- **Fabrication post-check** (`src/lib/fabrication.ts`) runs in code on every
  tailoring result. For each rewritten string it extracts every number and proper
  noun and checks it is supported somewhere in the original resume, allowing
  genuine synonyms ("Node" supports "Node.js"). Anything unsupported gets a
  **⚠ check facts** badge on that change in the review UI.
- **Id validation** (`src/lib/apply-changes.ts`) drops any change pointing at an
  id that does not exist, and rejects a "reorder" that quietly adds or removes a
  skill or bullet.
- **Structural invariants** — changes can only rewrite the summary, the headline,
  bullet text, or ordering. There is no code path by which the AI can add an
  employer, a role, a date or an education entry, so `applyChanges` cannot
  produce one. Covered by tests.

## Match score (deterministic)

`src/lib/match.ts` runs in code, not through the model, so the number is
repeatable and explainable:

```
score = Σ(weight × credit) / Σ(weight) × 100
```

`credit` is **1.0** when the term appears in an experience or project bullet,
**0.8** when it only appears elsewhere (skills list, summary, education), and
**0** when absent — so evidence of doing the work counts for more than listing
it. Text is lowercased, punctuation that is not part of a tech term is stripped,
words are stemmed, and each keyword's synonyms are tried too. Must-have coverage
is reported separately. Keywords are sorted before scoring, so the output does
not depend on the order the model emitted them in.

## Fit verdict rules

In `src/lib/fit.ts`, with every threshold in one `FIT_THRESHOLDS` object and a
unit test per rule:

- **Out of scope** if any of: must-have coverage < 40%; a `credential` blocker; a
  `years` blocker where the resume shows under half the required years; or a
  `domain` blocker together with coverage < 60%.
- **Strong fit** if coverage ≥ 70%, score ≥ 65, and no `credential`, `years` or
  `seniority` blocker.
- **Partial fit** otherwise.

The model supplies the blockers and transferable skills; the verdict and score
are computed from them in code.

## Layout

```
src/
  app/
    page.tsx                    dashboard: master resume, new job, version list
    resume/page.tsx             import + form editor + live preview
    jobs/[id]/page.tsx          fit banner, JD highlighting, diff review, scores
    api/resume/parse            PDF/DOCX/text -> Resume JSON (AI)
    api/job/analyze             JD -> JobAnalysis (AI)
    api/match                   score report (deterministic, no AI)
    api/fit                     FitReport (code score + AI judgment)
    api/tailor                  Change[] + gaps (AI, + fabrication check)
    api/export/{pdf,docx}       ATS template download
    api/models                  provider catalogue + live model lists
    api/settings/models         saved per-task model choices
    api/resume, api/jobs, ...   persistence
    settings/page.tsx           model picker per task
  components/                   ResumePreview, DiffItem, ScoreGauge,
                                KeywordHighlighter, FitBanner, ExportDialog,
                                ModelPicker, ui/
  lib/ai/                       provider seam: types.ts registry.ts
                                json-schema.ts index.ts
                                providers/{anthropic,openai,google}.ts
  lib/                          schema.ts prompts.ts match.ts fit.ts parse.ts
                                fabrication.ts apply-changes.ts settings.ts
                                tool-schemas.ts export-pdf.tsx export-docx.ts
prisma/schema.prisma            Resume, Job, TailoredVersion, AppSetting
tests/                          match, fit, tailor, parse, export, ai + e2e/
fixtures/                       sample-resume.{pdf,docx}, sample-jd.txt,
                                jd-{strong-fit,partial-fit,out-of-scope}.txt
```

## Notes on the implementation

A few places where the build differs from `plan.md`, and why:

- **Structured outputs instead of forced tool use.** The plan specified tool use
  with a JSON schema, but `tool_choice: {type: "tool"}` returns a 400 on
  `claude-sonnet-5-5`. The routes use each provider's structured-output mode
  with the same hand-written JSON schemas in `src/lib/tool-schemas.ts`. Every
  response is still validated with Zod and retried once with the validation
  error fed back, exactly as specified.
- **Multiple providers, none required.** The plan named Anthropic only; model
  choice across OpenAI, Anthropic and Google was added afterwards, with OpenAI
  as the default. Each provider's SDK is imported on first use, so a project
  that only uses one never loads the other two. See "Choosing AI models".
- **`unpdf` for PDF import**, which the plan allowed as the alternative to
  `pdf-parse`; it bundles cleanly under Next's server runtime.
- **The fabrication post-check runs in code**, not as a second model call — the
  plan allowed either. It is free, deterministic and unit-tested.
- **UI primitives are hand-written** in `src/components/ui/` in the shadcn/ui
  style (same class tokens and API shape), so the project has no generator step
  and no component vendoring.
- **Bullet reordering in the editor uses ↑/↓ buttons** rather than drag and
  drop, which keeps it keyboard-accessible without a drag library.
- **TypeScript is pinned to 5.x.** Next 15's tsconfig reader breaks under
  TypeScript 7, which silently drops the `@/*` path aliases.
- **Progress is reported in stages** ("Analysing the job description…",
  "Tailoring your resume…") rather than streamed token by token.

Not built, both listed as optional in the plan: fetching a JD from a URL (the
`Job.jdUrl` column exists), and the cover-letter generator.

## Privacy

Resume data stays in local SQLite, and provider keys are read server-side only —
they never reach the browser. The AI routes are rate-limited per client, and
there is no analytics on resume content.

Be aware that the AI steps send your resume text and the job description to
**whichever provider you select**. If that matters to you, the model picker is
also the privacy control: choose the provider you are willing to share with, and
check its data-retention terms.
