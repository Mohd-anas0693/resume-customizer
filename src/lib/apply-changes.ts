import type { Change, ProposedChange, Resume } from "./schema";

/* ------------------------------------------------------------------ *
 * Validation: every change must point at an id that really exists
 * ------------------------------------------------------------------ */

export type ChangeProblem = { changeId: string; problem: string };

export function validateChanges(
  resume: Resume,
  changes: ProposedChange[],
): { valid: ProposedChange[]; problems: ChangeProblem[] } {
  const valid: ProposedChange[] = [];
  const problems: ChangeProblem[] = [];

  for (const change of changes) {
    const problem = findProblem(resume, change);
    if (problem) problems.push({ changeId: change.id, problem });
    else valid.push(change);
  }
  return { valid, problems };
}

function findProblem(resume: Resume, change: ProposedChange): string | null {
  const { section, itemId, bulletId } = change.target;

  if (section === "summary" || section === "headline") {
    if (change.kind !== "rewrite") return `${section} supports rewrite only`;
    return null;
  }

  if (section === "skills") {
    const group = resume.skills.find((g) => g.id === itemId);
    if (!group) return `no skill group with id ${itemId}`;
    if (change.kind === "reorder") {
      const next = splitList(change.after);
      const same =
        next.length === group.items.length &&
        [...next].sort().join("|").toLowerCase() ===
          [...group.items].sort().join("|").toLowerCase();
      if (!same) return "reorder changed the skill items, not just their order";
    }
    return null;
  }

  const items = section === "experience" ? resume.experience : resume.projects;
  const item = items.find((i) => i.id === itemId);
  if (!item) return `no ${section} item with id ${itemId}`;

  if (change.kind === "reorder") {
    const ids = splitList(change.after);
    const existing = item.bullets.map((b) => b.id);
    const same =
      ids.length === existing.length && [...ids].sort().join("|") === [...existing].sort().join("|");
    if (!same) return "bullet reorder must list every bullet id of that item exactly once";
    return null;
  }

  if (!bulletId) return "rewrite/remove needs a bulletId";
  if (!item.bullets.some((b) => b.id === bulletId)) {
    return `no bullet with id ${bulletId} in ${itemId}`;
  }
  return null;
}

export function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Applying
 * ------------------------------------------------------------------ */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Apply the accepted and edited changes to the resume.
 *
 * Guarantee: with no accepted or edited change, the result deep-equals the
 * input, so "reject all" always reproduces the original exactly.
 */
export function applyChanges(resume: Resume, changes: Change[]): Resume {
  const live = changes.filter((c) => c.status === "accepted" || c.status === "edited");
  if (live.length === 0) return clone(resume);

  const next = clone(resume);

  // Rewrites and removals first, then reorders, so a reorder sees final text.
  const ordered = [...live].sort((a, b) => Number(a.kind === "reorder") - Number(b.kind === "reorder"));

  for (const change of ordered) {
    const { section, itemId, bulletId } = change.target;

    if (section === "summary") {
      next.summary = change.after;
      continue;
    }
    if (section === "headline") {
      next.headline = change.after;
      continue;
    }
    if (section === "skills") {
      const group = next.skills.find((g) => g.id === itemId);
      if (!group) continue;
      if (change.kind === "reorder") {
        const wanted = splitList(change.after);
        const byKey = new Map(group.items.map((i) => [i.trim().toLowerCase(), i]));
        const reordered: string[] = [];
        for (const w of wanted) {
          const original = byKey.get(w.toLowerCase());
          if (original !== undefined && !reordered.includes(original)) reordered.push(original);
        }
        // Anything the model dropped stays, at the end: never lose a skill.
        for (const item of group.items) if (!reordered.includes(item)) reordered.push(item);
        group.items = reordered;
      }
      continue;
    }

    const items = section === "experience" ? next.experience : next.projects;
    const item = items.find((i) => i.id === itemId);
    if (!item) continue;

    if (change.kind === "reorder") {
      const wanted = splitList(change.after);
      const byId = new Map(item.bullets.map((b) => [b.id, b]));
      const reordered = wanted.map((id) => byId.get(id)).filter((b): b is NonNullable<typeof b> => !!b);
      for (const b of item.bullets) if (!reordered.includes(b)) reordered.push(b);
      item.bullets = reordered;
      continue;
    }

    if (change.kind === "remove") {
      item.bullets = item.bullets.filter((b) => b.id !== bulletId);
      continue;
    }

    const bullet = item.bullets.find((b) => b.id === bulletId);
    if (bullet) bullet.text = change.after;
  }

  return next;
}

/** Human-readable label for the review UI. */
export function changeLabel(resume: Resume, change: Change | ProposedChange): string {
  const { section, itemId } = change.target;
  if (section === "summary") return "Summary";
  if (section === "headline") return "Headline";
  if (section === "skills") {
    const group = resume.skills.find((g) => g.id === itemId);
    return `Skills - ${group?.name || itemId || "group"}`;
  }
  const items = section === "experience" ? resume.experience : resume.projects;
  const item = items.find((i) => i.id === itemId);
  if (!item) return section;
  if (section === "experience") {
    const exp = item as Resume["experience"][number];
    return `${exp.title} at ${exp.company}`;
  }
  return `Project - ${(item as Resume["projects"][number]).name}`;
}
