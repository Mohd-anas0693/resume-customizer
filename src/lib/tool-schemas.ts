/**
 * Hand-written JSON Schemas for Anthropic tool use.
 * These mirror src/lib/schema.ts (Zod) and are what Claude is forced to fill in.
 */

const bullets = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string", description: "Stable id, e.g. 'exp1-b1'" },
      text: { type: "string" },
    },
    required: ["id", "text"],
  },
} as const;

export const resumeJsonSchema = {
  type: "object",
  properties: {
    contact: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        links: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, url: { type: "string" } },
            required: ["label", "url"],
          },
        },
      },
      required: ["name", "links"],
    },
    headline: { type: "string" },
    summary: { type: "string" },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          company: { type: "string" },
          title: { type: "string" },
          location: { type: "string" },
          start: { type: "string", description: "YYYY-MM or YYYY" },
          end: { type: "string", description: "YYYY-MM, YYYY or 'Present'" },
          bullets,
        },
        required: ["id", "company", "title", "start", "bullets"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          school: { type: "string" },
          degree: { type: "string" },
          field: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          details: { type: "array", items: { type: "string" } },
        },
        required: ["id", "school"],
      },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "Group name, e.g. 'Languages'" },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "items"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          link: { type: "string" },
          bullets,
        },
        required: ["id", "name", "bullets"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          issuer: { type: "string" },
          date: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  required: ["contact", "experience", "education", "skills", "projects", "certifications"],
} as const;

export const jobAnalysisJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    company: { type: "string" },
    seniority: { type: "string", description: "e.g. intern, junior, mid, senior, lead" },
    mustHave: { type: "array", items: { type: "string" } },
    niceToHave: { type: "array", items: { type: "string" } },
    keywords: {
      type: "array",
      description: "15-30 ATS keywords",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          weight: {
            type: "integer",
            enum: [1, 2, 3],
            description: "3 = explicitly required, 2 = repeated/important, 1 = mentioned once",
          },
          synonyms: { type: "array", items: { type: "string" } },
        },
        required: ["term", "weight", "synonyms"],
      },
    },
    responsibilities: { type: "array", items: { type: "string" } },
  },
  required: ["title", "mustHave", "niceToHave", "keywords", "responsibilities"],
} as const;

export const fitJudgmentJsonSchema = {
  type: "object",
  properties: {
    blockers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string", description: "The JD requirement, quoted or paraphrased" },
          reason: { type: "string", description: "Why the resume does not meet it, specifically" },
          type: {
            type: "string",
            enum: ["skill", "years", "seniority", "domain", "credential", "location"],
          },
          requiredYears: {
            type: "number",
            description: "For type 'years' only: years of experience the JD requires.",
          },
          resumeYears: {
            type: "number",
            description:
              "For type 'years' only: years the resume actually shows, calculated from the dates.",
          },
        },
        required: ["requirement", "reason", "type"],
      },
    },
    transferable: {
      type: "array",
      items: {
        type: "object",
        properties: {
          jdNeed: { type: "string" },
          resumeEvidence: { type: "string", description: "Text quoted from the resume" },
        },
        required: ["jdNeed", "resumeEvidence"],
      },
    },
    summary: { type: "string", description: "1-2 plain sentences for the banner" },
    canTailorHelp: { type: "string", description: "What tailoring can realistically improve" },
  },
  required: ["blockers", "transferable", "summary", "canTailorHelp"],
} as const;

export const tailorJsonSchema = {
  type: "object",
  properties: {
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          target: {
            type: "object",
            properties: {
              section: {
                type: "string",
                enum: ["summary", "headline", "experience", "projects", "skills"],
              },
              itemId: {
                type: "string",
                description: "Experience / project / skill-group id from the resume JSON",
              },
              bulletId: { type: "string", description: "Bullet id when rewriting one bullet" },
            },
            required: ["section"],
          },
          kind: { type: "string", enum: ["rewrite", "reorder", "remove"] },
          before: { type: "string" },
          after: {
            type: "string",
            description:
              "For 'reorder' on skills: the comma-separated reordered items. For bullets: the new text.",
          },
          reason: { type: "string" },
          keywordsAdded: { type: "array", items: { type: "string" } },
          sourceEvidence: {
            type: "string",
            description: "Original resume text that justifies every claim in 'after'",
          },
        },
        required: [
          "id",
          "target",
          "kind",
          "before",
          "after",
          "reason",
          "keywordsAdded",
          "sourceEvidence",
        ],
      },
    },
    gaps: {
      type: "array",
      items: { type: "string" },
      description: "JD requirements the resume cannot support. Never written into the resume.",
    },
  },
  required: ["changes", "gaps"],
} as const;
