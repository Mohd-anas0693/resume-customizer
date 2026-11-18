"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorNote,
  Spinner,
  Textarea,
} from "@/components/ui";
import { VERDICT_LABEL } from "@/lib/fit";
import type { FitReport, Resume } from "@/lib/schema";

type JobRow = {
  id: string;
  title: string;
  company: string | null;
  skipped: boolean;
  createdAt: string;
  fitReport: FitReport | null;
  versions: {
    id: string;
    label: string;
    scoreBefore: number;
    scoreAfter: number;
    createdAt: string;
  }[];
};

const verdictTone = { strong: "green", partial: "amber", out_of_scope: "red" } as const;

export default function Dashboard() {
  const router = useRouter();
  const [resume, setResume] = React.useState<Resume | null>(null);
  const [jobs, setJobs] = React.useState<JobRow[] | null>(null);
  const [jdText, setJdText] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showNewJob, setShowNewJob] = React.useState(false);

  const load = React.useCallback(async () => {
    const [r, j] = await Promise.all([
      fetch("/api/resume").then((res) => res.json()),
      fetch("/api/jobs").then((res) => res.json()),
    ]);
    setResume(r.resume ?? null);
    setJobs(j.jobs ?? []);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jdText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't create the job.");
      router.push(`/jobs/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the job.");
    } finally {
      setCreating(false);
    }
  }

  async function duplicate(versionId: string) {
    await fetch(`/api/versions/${versionId}`, { method: "POST" });
    void load();
  }

  async function rename(versionId: string, current: string) {
    const label = window.prompt("New name for this version", current);
    if (!label?.trim()) return;
    await fetch(`/api/versions/${versionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    void load();
  }

  async function removeVersion(versionId: string) {
    await fetch(`/api/versions/${versionId}`, { method: "DELETE" });
    void load();
  }

  const hasResume = Boolean(resume?.contact.name || resume?.experience.length);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Master resume</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {resume === null && jobs === null ? (
              <Spinner label="Loading…" />
            ) : hasResume ? (
              <>
                <p className="text-sm font-medium">{resume?.contact.name || "Unnamed"}</p>
                <p className="text-xs text-muted-foreground">
                  {resume?.experience.length ?? 0} roles · {resume?.skills.length ?? 0} skill groups ·{" "}
                  {resume?.education.length ?? 0} education entries
                </p>
                <Link href="/resume">
                  <Button size="sm" variant="outline">
                    Edit master resume
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Import your resume once. Every tailored version starts from it.
                </p>
                <Link href="/resume">
                  <Button size="sm">Import resume</Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>New job</CardTitle>
            {hasResume ? (
              <Button size="sm" onClick={() => setShowNewJob((v) => !v)}>
                {showNewJob ? "Close" : "New job"}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {!hasResume ? (
              <p className="text-sm text-muted-foreground">
                Import your master resume first, then paste a job description here.
              </p>
            ) : showNewJob ? (
              <form onSubmit={createJob} className="space-y-3">
                <Textarea
                  rows={7}
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="Paste the full job description here…"
                  aria-label="Job description text"
                />
                <ErrorNote>{error}</ErrorNote>
                <Button type="submit" disabled={creating || jdText.trim().length < 80}>
                  {creating ? "Creating…" : "Analyse this job"}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Paste a job description to get a fit check, a keyword score, and a tailored draft.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Jobs and tailored versions</h2>
        {jobs === null ? (
          <Spinner label="Loading jobs…" />
        ) : jobs.length === 0 ? (
          <EmptyState title="No jobs yet">
            Paste your first job description above to see how well your resume matches it.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/jobs/${job.id}`} className="text-sm font-semibold hover:underline">
                            {job.title}
                          </Link>
                          {job.company ? (
                            <span className="text-sm text-muted-foreground">· {job.company}</span>
                          ) : null}
                          {job.fitReport ? (
                            <Badge tone={verdictTone[job.fitReport.verdict]}>
                              {VERDICT_LABEL[job.fitReport.verdict]} · {job.fitReport.score}
                            </Badge>
                          ) : (
                            <Badge>not analysed yet</Badge>
                          )}
                          {job.skipped ? <Badge>skipped</Badge> : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Added {new Date(job.createdAt).toLocaleDateString()} ·{" "}
                          {job.versions.length} version{job.versions.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Link href={`/jobs/${job.id}`}>
                        <Button size="sm" variant="outline">
                          Open
                        </Button>
                      </Link>
                    </div>

                    {job.versions.length > 0 ? (
                      <ul className="mt-3 divide-y border-t text-sm">
                        {job.versions.map((v) => (
                          <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
                            <span className="font-medium">{v.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {v.scoreBefore} → {v.scoreAfter} ·{" "}
                              {new Date(v.createdAt).toLocaleDateString()}
                            </span>
                            <span className="ml-auto flex gap-1">
                              <Link href={`/jobs/${job.id}?version=${v.id}`}>
                                <Button size="sm" variant="ghost">
                                  Reopen
                                </Button>
                              </Link>
                              <Button size="sm" variant="ghost" onClick={() => rename(v.id, v.label)}>
                                Rename
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => duplicate(v.id)}>
                                Duplicate
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => removeVersion(v.id)}>
                                Delete
                              </Button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
