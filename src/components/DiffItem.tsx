"use client";

import { diffWords } from "diff";
import * as React from "react";
import { Badge, Button, Textarea } from "@/components/ui";
import type { Change } from "@/lib/schema";
import { cn } from "@/lib/utils";

export function InlineDiff({ before, after }: { before: string; after: string }) {
  const parts = React.useMemo(() => diffWords(before, after), [before, after]);
  return (
    <p className="text-[13px] leading-relaxed">
      {parts.map((part, i) =>
        part.added ? (
          <ins key={i} className="ins px-0.5">
            {part.value}
          </ins>
        ) : part.removed ? (
          <del key={i} className="del px-0.5">
            {part.value}
          </del>
        ) : (
          <React.Fragment key={i}>{part.value}</React.Fragment>
        ),
      )}
    </p>
  );
}

const statusTone: Record<Change["status"], "muted" | "green" | "red" | "blue"> = {
  pending: "muted",
  accepted: "green",
  rejected: "red",
  edited: "blue",
};

export function DiffItem({
  change,
  label,
  view,
  onAccept,
  onReject,
  onEdit,
}: {
  change: Change;
  label: string;
  view: "inline" | "side-by-side";
  onAccept: () => void;
  onReject: () => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(change.after);

  React.useEffect(() => {
    if (!editing) setDraft(change.after);
  }, [change.after, editing]);

  const isReorder = change.kind === "reorder";

  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        change.status === "accepted" && "border-green-300 dark:border-green-900",
        change.status === "rejected" && "border-red-200 opacity-60 dark:border-red-950",
        change.status === "edited" && "border-blue-300 dark:border-blue-900",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">{label}</span>
        <Badge>{change.kind}</Badge>
        <Badge tone={statusTone[change.status]}>{change.status}</Badge>
        {change.warnings.length > 0 ? (
          <Badge tone="amber" title={change.warnings.join("\n")}>
            ⚠ check facts
          </Badge>
        ) : null}
        {change.keywordsAdded.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            +{change.keywordsAdded.join(", ")}
          </span>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            rows={3}
            aria-label={`Edit the rewritten text for ${label}`}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onEdit(draft);
                setEditing(false);
              }}
            >
              Save edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : isReorder ? (
        <div className="space-y-1 text-[13px]">
          <p className="text-muted-foreground">New order:</p>
          <p>{change.after}</p>
        </div>
      ) : view === "inline" ? (
        <InlineDiff before={change.before} after={change.after} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded border bg-muted/40 p-2">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Before</p>
            <p className="text-[13px] leading-relaxed">{change.before || <em>empty</em>}</p>
          </div>
          <div className="rounded border bg-muted/40 p-2">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">After</p>
            <p className="text-[13px] leading-relaxed">{change.after || <em>removed</em>}</p>
          </div>
        </div>
      )}

      <details className="mt-2 text-[12px] text-muted-foreground">
        <summary className="cursor-pointer select-none">Why this change</summary>
        <p className="mt-1">{change.reason}</p>
        {change.sourceEvidence ? (
          <p className="mt-1">
            <span className="font-medium">Evidence from your resume:</span>{" "}
            <q className="italic">{change.sourceEvidence}</q>
          </p>
        ) : null}
        {change.warnings.length > 0 ? (
          <ul className="mt-1 list-disc pl-4 text-amber-700 dark:text-amber-400">
            {change.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </details>

      {editing ? null : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={change.status === "accepted" ? "success" : "outline"}
            onClick={onAccept}
            aria-pressed={change.status === "accepted"}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant={change.status === "rejected" ? "destructive" : "outline"}
            onClick={onReject}
            aria-pressed={change.status === "rejected"}
          >
            Reject
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}
    </li>
  );
}
