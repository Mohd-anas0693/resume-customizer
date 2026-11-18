import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Resume — the single source of truth. Never edit raw text.
 * ------------------------------------------------------------------ */

export const LinkSchema = z.object({
  label: z.string().default(""),
  url: z.string().default(""),
});

export const ContactSchema = z.object({
  name: z.string().default(""),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(LinkSchema).default([]),
});

export const BulletSchema = z.object({
  id: z.string().min(1),
  text: z.string().default(""),
});

export const ExperienceSchema = z.object({
  id: z.string().min(1),
  company: z.string().default(""),
  title: z.string().default(""),
  location: z.string().optional(),
  start: z.string().default(""),
  end: z.string().optional(),
  bullets: z.array(BulletSchema).default([]),
});

export const EducationSchema = z.object({
  id: z.string().min(1),
  school: z.string().default(""),
  degree: z.string().optional(),
  field: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  details: z.array(z.string()).default([]),
});

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  link: z.string().optional(),
  bullets: z.array(BulletSchema).default([]),
});

export const SkillGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  items: z.array(z.string()).default([]),
});

export const CertificationSchema = z.object({
  name: z.string().default(""),
  issuer: z.string().optional(),
  date: z.string().optional(),
});

export const ResumeSchema = z.object({
  contact: ContactSchema,
  headline: z.string().optional(),
  summary: z.string().optional(),
  experience: z.array(ExperienceSchema).default([]),
  education: z.array(EducationSchema).default([]),
  skills: z.array(SkillGroupSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  certifications: z.array(CertificationSchema).default([]),
});

/* ------------------------------------------------------------------ *
 * Job analysis
 * ------------------------------------------------------------------ */

export const KeywordSchema = z.object({
  term: z.string().min(1),
  weight: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  synonyms: z.array(z.string()).default([]),
});

export const JobAnalysisSchema = z.object({
  title: z.string().default("Untitled role"),
  company: z.string().optional(),
  seniority: z.string().optional(),
  mustHave: z.array(z.string()).default([]),
  niceToHave: z.array(z.string()).default([]),
  keywords: z.array(KeywordSchema).default([]),
  responsibilities: z.array(z.string()).default([]),
});

/* ------------------------------------------------------------------ *
 * Fit report
 * ------------------------------------------------------------------ */

export const VerdictSchema = z.enum(["strong", "partial", "out_of_scope"]);

export const BlockerTypeSchema = z.enum([
  "skill",
  "years",
  "seniority",
  "domain",
  "credential",
  "location",
]);

export const BlockerSchema = z.object({
  requirement: z.string().default(""),
  reason: z.string().default(""),
  type: BlockerTypeSchema,
  /** Only for type "years": needed to apply the "less than half" verdict rule. */
  requiredYears: z.number().optional(),
  resumeYears: z.number().optional(),
});

export const TransferableSchema = z.object({
  jdNeed: z.string().default(""),
  resumeEvidence: z.string().default(""),
});

/** What the AI is asked to judge (score/verdict are computed in code). */
export const FitJudgmentSchema = z.object({
  blockers: z.array(BlockerSchema).default([]),
  transferable: z.array(TransferableSchema).default([]),
  summary: z.string().default(""),
  canTailorHelp: z.string().default(""),
});

export const FitReportSchema = FitJudgmentSchema.extend({
  verdict: VerdictSchema,
  score: z.number(),
  mustHaveCoverage: z.number(),
});

/* ------------------------------------------------------------------ *
 * Changes
 * ------------------------------------------------------------------ */

export const ChangeTargetSchema = z.object({
  section: z.enum(["summary", "headline", "experience", "projects", "skills"]),
  itemId: z.string().optional(),
  bulletId: z.string().optional(),
});

export const ChangeStatusSchema = z.enum(["pending", "accepted", "rejected", "edited"]);

export const ProposedChangeSchema = z.object({
  id: z.string().min(1),
  target: ChangeTargetSchema,
  kind: z.enum(["rewrite", "reorder", "remove"]),
  before: z.string().default(""),
  after: z.string().default(""),
  reason: z.string().default(""),
  keywordsAdded: z.array(z.string()).default([]),
  sourceEvidence: z.string().default(""),
});

export const ChangeSchema = ProposedChangeSchema.extend({
  status: ChangeStatusSchema.default("pending"),
  warnings: z.array(z.string()).default([]),
});

export const TailorIntensitySchema = z.enum(["light", "balanced", "strong"]);

export const TailorResultSchema = z.object({
  changes: z.array(ProposedChangeSchema).default([]),
  gaps: z.array(z.string()).default([]),
});

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type Link = z.infer<typeof LinkSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type Bullet = z.infer<typeof BulletSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type SkillGroup = z.infer<typeof SkillGroupSchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type Resume = z.infer<typeof ResumeSchema>;
export type Keyword = z.infer<typeof KeywordSchema>;
export type JobAnalysis = z.infer<typeof JobAnalysisSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
export type BlockerType = z.infer<typeof BlockerTypeSchema>;
export type Blocker = z.infer<typeof BlockerSchema>;
export type Transferable = z.infer<typeof TransferableSchema>;
export type FitJudgment = z.infer<typeof FitJudgmentSchema>;
export type FitReport = z.infer<typeof FitReportSchema>;
export type ChangeTarget = z.infer<typeof ChangeTargetSchema>;
export type ChangeStatus = z.infer<typeof ChangeStatusSchema>;
export type ProposedChange = z.infer<typeof ProposedChangeSchema>;
export type Change = z.infer<typeof ChangeSchema>;
export type TailorIntensity = z.infer<typeof TailorIntensitySchema>;
export type TailorResult = z.infer<typeof TailorResultSchema>;

export const emptyResume = (): Resume => ({
  contact: { name: "", links: [] },
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
});
