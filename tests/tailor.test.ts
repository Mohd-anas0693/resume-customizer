import { describe, expect, it } from "vitest";
import { applyChanges, changeLabel, splitList, validateChanges } from "@/lib/apply-changes";
import {
  buildSupportIndex,
  checkChanges,
  checkText,
  extractNumbers,
  extractProperNouns,
  isTermSupported,
} from "@/lib/fabrication";
import { matchScore } from "@/lib/match";
import { resumeToPlainText } from "@/lib/parse";
import type { Change, JobAnalysis, ProposedChange } from "@/lib/schema";
import { ChangeSchema } from "@/lib/schema";
import { softwareResume, strongFitAnalysis } from "./fixtures";

const change = (over: Partial<Change>): Change =>
  ChangeSchema.parse({
    id: "c1",
    target: { section: "summary" },
    kind: "rewrite",
    before: "",
    after: "",
    reason: "",
    keywordsAdded: [],
    sourceEvidence: "",
    status: "pending",
    warnings: [],
    ...over,
  });

const proposed = (over: Partial<ProposedChange>): ProposedChange => ({
  id: "c1",
  target: { section: "summary" },
  kind: "rewrite",
  before: "",
  after: "",
  reason: "",
  keywordsAdded: [],
  sourceEvidence: "",
  ...over,
});

/* ------------------------------------------------------------------ *
 * Validation: every change must map to a real id
 * ------------------------------------------------------------------ */

describe("validateChanges", () => {
  it("accepts a bullet rewrite that points at real ids", () => {
    const { valid, problems } = validateChanges(softwareResume, [
      proposed({
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b1" },
        after: "Built Node.js APIs serving 40k daily requests.",
      }),
    ]);
    expect(problems).toEqual([]);
    expect(valid).toHaveLength(1);
  });

  it("rejects an experience id that does not exist", () => {
    const { valid, problems } = validateChanges(softwareResume, [
      proposed({ target: { section: "experience", itemId: "exp9", bulletId: "x" } }),
    ]);
    expect(valid).toEqual([]);
    expect(problems[0].problem).toContain("no experience item with id exp9");
  });

  it("rejects a bullet id that does not belong to that experience", () => {
    const { problems } = validateChanges(softwareResume, [
      proposed({ target: { section: "experience", itemId: "exp1", bulletId: "exp2-b1" } }),
    ]);
    expect(problems[0].problem).toContain("no bullet with id exp2-b1");
  });

  it("rejects a rewrite with no bulletId", () => {
    const { problems } = validateChanges(softwareResume, [
      proposed({ target: { section: "experience", itemId: "exp1" } }),
    ]);
    expect(problems[0].problem).toContain("needs a bulletId");
  });

  it("rejects a skill reorder that adds or drops an item", () => {
    const { problems } = validateChanges(softwareResume, [
      proposed({
        target: { section: "skills", itemId: "sk1" },
        kind: "reorder",
        after: "TypeScript, JavaScript, Python, SQL, Kubernetes",
      }),
    ]);
    expect(problems[0].problem).toContain("changed the skill items");
  });

  it("accepts a skill reorder that only changes the order", () => {
    const { problems } = validateChanges(softwareResume, [
      proposed({
        target: { section: "skills", itemId: "sk1" },
        kind: "reorder",
        after: "SQL, TypeScript, Python, JavaScript",
      }),
    ]);
    expect(problems).toEqual([]);
  });

  it("rejects a bullet reorder that omits a bullet id", () => {
    const { problems } = validateChanges(softwareResume, [
      proposed({
        target: { section: "experience", itemId: "exp1" },
        kind: "reorder",
        after: "exp1-b2, exp1-b1",
      }),
    ]);
    expect(problems[0].problem).toContain("every bullet id");
  });

  it("accepts a complete bullet reorder", () => {
    const { problems } = validateChanges(softwareResume, [
      proposed({
        target: { section: "experience", itemId: "exp1" },
        kind: "reorder",
        after: "exp1-b2, exp1-b1, exp1-b3",
      }),
    ]);
    expect(problems).toEqual([]);
  });

  it("checks every change in the fixture tailoring maps to a real id", () => {
    const changes = [
      proposed({ id: "c1", target: { section: "summary" }, after: "x" }),
      proposed({
        id: "c2",
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b2" },
        after: "y",
      }),
      proposed({
        id: "c3",
        target: { section: "projects", itemId: "prj1", bulletId: "prj1-b1" },
        after: "z",
      }),
      proposed({ id: "c4", target: { section: "skills", itemId: "sk2" }, kind: "reorder", after: "Node, React, Express" }),
    ];
    expect(validateChanges(softwareResume, changes).problems).toEqual([]);
  });
});

describe("splitList", () => {
  it("splits on commas and newlines and trims", () => {
    expect(splitList(" a, b \n c ,, ")).toEqual(["a", "b", "c"]);
  });
});

/* ------------------------------------------------------------------ *
 * Applying
 * ------------------------------------------------------------------ */

describe("applyChanges", () => {
  it("rejecting every change reproduces the original exactly", () => {
    const changes: Change[] = [
      change({ id: "c1", target: { section: "summary" }, after: "Rewritten", status: "rejected" }),
      change({
        id: "c2",
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b1" },
        after: "Rewritten bullet",
        status: "rejected",
      }),
      change({
        id: "c3",
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b3" },
        kind: "remove",
        status: "rejected",
      }),
      change({
        id: "c4",
        target: { section: "skills", itemId: "sk1" },
        kind: "reorder",
        after: "SQL, Python, TypeScript, JavaScript",
        status: "rejected",
      }),
    ];
    expect(applyChanges(softwareResume, changes)).toEqual(softwareResume);
  });

  it("leaving every change pending also reproduces the original", () => {
    const changes = [change({ after: "Rewritten", status: "pending" })];
    expect(applyChanges(softwareResume, changes)).toEqual(softwareResume);
  });

  it("does not mutate the input resume", () => {
    const snapshot = JSON.parse(JSON.stringify(softwareResume));
    applyChanges(softwareResume, [
      change({
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b1" },
        after: "Changed",
        status: "accepted",
      }),
    ]);
    expect(softwareResume).toEqual(snapshot);
  });

  it("applies an accepted summary rewrite", () => {
    const next = applyChanges(softwareResume, [
      change({ target: { section: "summary" }, after: "New summary.", status: "accepted" }),
    ]);
    expect(next.summary).toBe("New summary.");
  });

  it("applies an edited change using the user's text", () => {
    const next = applyChanges(softwareResume, [
      change({ target: { section: "headline" }, after: "My own wording", status: "edited" }),
    ]);
    expect(next.headline).toBe("My own wording");
  });

  it("applies an accepted bullet rewrite to the right bullet only", () => {
    const next = applyChanges(softwareResume, [
      change({
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b2" },
        after: "Designed PostgreSQL schemas for billing.",
        status: "accepted",
      }),
    ]);
    expect(next.experience[0].bullets[1].text).toBe("Designed PostgreSQL schemas for billing.");
    expect(next.experience[0].bullets[0].text).toBe(softwareResume.experience[0].bullets[0].text);
  });

  it("removes a bullet on an accepted remove", () => {
    const next = applyChanges(softwareResume, [
      change({
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b3" },
        kind: "remove",
        status: "accepted",
      }),
    ]);
    expect(next.experience[0].bullets.map((b) => b.id)).toEqual(["exp1-b1", "exp1-b2"]);
  });

  it("reorders skills without losing or adding one", () => {
    const next = applyChanges(softwareResume, [
      change({
        target: { section: "skills", itemId: "sk1" },
        kind: "reorder",
        after: "SQL, TypeScript, Python, JavaScript",
        status: "accepted",
      }),
    ]);
    expect(next.skills[0].items).toEqual(["SQL", "TypeScript", "Python", "JavaScript"]);
    expect([...next.skills[0].items].sort()).toEqual([...softwareResume.skills[0].items].sort());
  });

  it("keeps a skill the model forgot to list in a reorder", () => {
    const next = applyChanges(softwareResume, [
      change({
        target: { section: "skills", itemId: "sk1" },
        kind: "reorder",
        after: "SQL, TypeScript",
        status: "accepted",
      }),
    ]);
    expect([...next.skills[0].items].sort()).toEqual([...softwareResume.skills[0].items].sort());
    expect(next.skills[0].items.slice(0, 2)).toEqual(["SQL", "TypeScript"]);
  });

  it("reorders bullets by id", () => {
    const next = applyChanges(softwareResume, [
      change({
        target: { section: "experience", itemId: "exp1" },
        kind: "reorder",
        after: "exp1-b3, exp1-b1, exp1-b2",
        status: "accepted",
      }),
    ]);
    expect(next.experience[0].bullets.map((b) => b.id)).toEqual([
      "exp1-b3",
      "exp1-b1",
      "exp1-b2",
    ]);
  });

  it("applies a rewrite and a reorder together, keeping the new text", () => {
    const next = applyChanges(softwareResume, [
      change({
        id: "c1",
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b1" },
        after: "Built Node.js APIs.",
        status: "accepted",
      }),
      change({
        id: "c2",
        target: { section: "experience", itemId: "exp1" },
        kind: "reorder",
        after: "exp1-b2, exp1-b1, exp1-b3",
        status: "accepted",
      }),
    ]);
    const moved = next.experience[0].bullets.find((b) => b.id === "exp1-b1");
    expect(moved?.text).toBe("Built Node.js APIs.");
    expect(next.experience[0].bullets[0].id).toBe("exp1-b2");
  });

  it("never introduces a new employer, title or education entry", () => {
    const next = applyChanges(softwareResume, [
      change({
        target: { section: "experience", itemId: "exp1", bulletId: "exp1-b1" },
        after: "Anything at all",
        status: "accepted",
      }),
    ]);
    expect(next.experience.map((e) => [e.company, e.title, e.start, e.end])).toEqual(
      softwareResume.experience.map((e) => [e.company, e.title, e.start, e.end]),
    );
    expect(next.education).toEqual(softwareResume.education);
    expect(next.contact).toEqual(softwareResume.contact);
  });
});

describe("changeLabel", () => {
  it("names the section for the review UI", () => {
    expect(changeLabel(softwareResume, change({ target: { section: "summary" } }))).toBe("Summary");
    expect(
      changeLabel(softwareResume, change({ target: { section: "experience", itemId: "exp1" } })),
    ).toBe("Software Engineer at Kettle Labs");
    expect(
      changeLabel(softwareResume, change({ target: { section: "skills", itemId: "sk1" } })),
    ).toBe("Skills - Languages");
    expect(
      changeLabel(softwareResume, change({ target: { section: "projects", itemId: "prj1" } })),
    ).toBe("Project - Ledgerly");
  });
});

/* ------------------------------------------------------------------ *
 * The score should not go down
 * ------------------------------------------------------------------ */

describe("score after tailoring", () => {
  it("accepting keyword-aligning rewrites does not lower the score", () => {
    const before = matchScore(softwareResume, strongFitAnalysis);
    const after = matchScore(
      applyChanges(softwareResume, [
        change({
          id: "c1",
          target: { section: "experience", itemId: "exp1", bulletId: "exp1-b1" },
          before: softwareResume.experience[0].bullets[0].text,
          after: "Built REST APIs in Node.js and Express serving 40k daily requests.",
          status: "accepted",
        }),
      ]),
      strongFitAnalysis,
    );
    expect(after.score).toBeGreaterThanOrEqual(before.score);
  });

  it("raises the score when a listed skill becomes evidenced in a bullet", () => {
    // "Git" sits only in the skills list, so it earns the listed credit (0.8).
    // Moving it into a bullet should earn full credit.
    const gitOnly: JobAnalysis = {
      title: "Test role",
      mustHave: [],
      niceToHave: [],
      keywords: [{ term: "Git", weight: 3, synonyms: [] }],
      responsibilities: [],
    };
    const before = matchScore(softwareResume, gitOnly);
    expect(before.score).toBe(80);
    expect(before.byKeyword.Git.inBullets).toBe(false);

    const after = matchScore(
      applyChanges(softwareResume, [
        change({
          id: "c1",
          target: { section: "experience", itemId: "exp1", bulletId: "exp1-b3" },
          after: "Added Jest unit tests and managed releases with Git tags.",
          status: "accepted",
        }),
      ]),
      gitOnly,
    );
    expect(after.score).toBe(100);
    expect(after.score).toBeGreaterThan(before.score);
  });
});

/* ------------------------------------------------------------------ *
 * Fabrication post-check
 * ------------------------------------------------------------------ */

describe("extractNumbers", () => {
  it("finds plain, decimal and grouped numbers", () => {
    expect(extractNumbers("Cut latency 40% for 1,200 users over 2.5 years")).toEqual([
      "40",
      "1200",
      "2.5",
    ]);
  });

  it("finds none in text without digits", () => {
    expect(extractNumbers("Improved reliability")).toEqual([]);
  });
});

describe("extractProperNouns", () => {
  it("finds tool names and acronyms", () => {
    const found = extractProperNouns("Shipped Kubernetes and GraphQL behind an AWS ALB");
    expect(found).toContain("Kubernetes");
    expect(found).toContain("GraphQL");
    expect(found).toContain("AWS");
  });

  it("finds dotted and slashed tech names", () => {
    const found = extractProperNouns("Built Node.js services with CI/CD in C++");
    expect(found).toContain("Node.js");
    expect(found).toContain("CI/CD");
    expect(found).toContain("C++");
  });

  it("ignores ordinary words and a capitalised sentence start", () => {
    expect(extractProperNouns("Led the team through a migration")).toEqual([]);
  });
});

describe("isTermSupported", () => {
  const index = buildSupportIndex("Built REST services in Node with Postgres and Express");

  it("accepts an exact term", () => {
    expect(isTermSupported("Express", index)).toBe(true);
  });

  it("accepts the JD's spelling of a skill the resume shows", () => {
    expect(isTermSupported("Node.js", index)).toBe(true);
    expect(isTermSupported("PostgreSQL", index)).toBe(true);
  });

  it("rejects a tool the resume never mentions", () => {
    expect(isTermSupported("Kubernetes", index)).toBe(false);
    expect(isTermSupported("Terraform", index)).toBe(false);
  });
});

describe("checkText", () => {
  const index = buildSupportIndex(resumeToPlainText(softwareResume));

  it("passes a rewrite that only rewords the original", () => {
    expect(
      checkText("Built Node.js REST APIs on Express serving 40k daily requests.", index),
    ).toEqual([]);
  });

  it("flags a number that is not in the original resume", () => {
    expect(checkText("Cut latency by 73% across the service.", index)).toContain("73");
  });

  it("flags a tool the resume never claimed", () => {
    expect(checkText("Ran Kubernetes clusters in production.", index)).toContain("Kubernetes");
  });

  it("flags an invented employer", () => {
    expect(checkText("Led the billing team at Infosys.", index)).toContain("Infosys");
  });

  it("keeps the original's own numbers", () => {
    expect(checkText("Raised coverage from 35% to 78% with Jest.", index)).toEqual([]);
  });
});

describe("checkChanges", () => {
  const originalText = resumeToPlainText(softwareResume);

  it("returns no warnings for faithful rewrites", () => {
    const warnings = checkChanges(
      [
        proposed({
          id: "c1",
          target: { section: "experience", itemId: "exp1", bulletId: "exp1-b1" },
          after: "Built Node.js REST APIs on Express handling 40k daily requests.",
        }),
      ],
      originalText,
    );
    expect(warnings).toEqual({});
  });

  it("warns per change, naming the unsupported term", () => {
    const warnings = checkChanges(
      [
        proposed({ id: "c1", after: "Built Node.js REST APIs on Express." }),
        proposed({ id: "c2", after: "Scaled Kafka pipelines to 5,000,000 events." }),
      ],
      originalText,
    );
    expect(warnings.c1).toBeUndefined();
    expect(warnings.c2.join(" ")).toContain("Kafka");
    expect(warnings.c2.join(" ")).toContain("5000000");
  });

  it("flags nothing for an empty after (a removal)", () => {
    expect(checkChanges([proposed({ id: "c1", kind: "remove", after: "" })], originalText)).toEqual(
      {},
    );
  });

  it("catches a fabricated metric anywhere in a full tailoring result", () => {
    const warnings = checkChanges(
      [
        proposed({ id: "c1", after: "Mentored 4 engineers across two squads." }),
        proposed({ id: "c2", after: "Designed PostgreSQL schemas and wrote migrations." }),
      ],
      originalText,
    );
    expect(Object.keys(warnings)).toEqual(["c1"]);
  });
});
