"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import * as React from "react";
import { DiffItem } from "@/components/DiffItem";
import { ExportDialog } from "@/components/ExportDialog";
import { FitBanner } from "@/components/FitBanner";
import { KeywordHighlighter } from "@/components/KeywordHighlighter";
import { ModelPicker, type ProviderCatalogue } from "@/components/ModelPicker";
import { ResumePreview } from "@/components/ResumePreview";
import { CoverageBar, ScoreDelta } from "@/components/ScoreGauge";
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
} from "@/components/ui";
import { applyChanges, changeLabel } from "@/lib/apply-changes";
import type { MatchReport } from "@/lib/match";
import { matchScore } from "@/lib/match";
import type { ModelChoice, ModelSettings } from "@/lib/ai/types";
import type {
  Change,
  FitReport,
  JobAnalysis,
  Resume,
  TailorIntensity,
} from "@/lib/schema";

type JobPayload = {
  job: {
    id: string;
    title: string;
    company: string | null;
    jdText: string;
    skipped: boolean;
    analysis: JobAnalysis | null;
    fitReport: FitReport | null;
  };
  masterResume: Resume;
  versions: {
    id: string;
    label: string;
    resume: Resume;
    changes: Change[];
    scoreBefore: number;
    scoreAfter: number;
    createdAt: string;
  }[];
};

const INTENSITIES: { value: TailorIntensity; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Keywords and ordering only" },
  { value: "balanced", label: "Balanced", hint: "Summary + top bullets" },
  { value: "strong", label: "Strong", hint: "Summary, headline, most bullets" },
];

export default function JobWorkspace() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const versionParam = searchParams.get("version");

  const [data, setData] = React.useState<JobPayload | null>(null);
  const [analysis, setAnalysis] = React.useState<JobAnalysis | null>(null);
  const [fit, setFit] = React.useState<FitReport | null>(null);
  const [changes, setChanges] = React.useState<Change[] | null>(null);
  const [gaps, setGaps] = React.useState<string[]>([]);
  const [intensity, setIntensity] = React.useState<TailorIntensity>("balanced");
  const [view, setView] = React.useState<"inline" | "side-by-side">("inline");
  const [stage, setStage] = React.useState("");
  const [tailoring, setTailoring] = React.useState(false);
  const [savingVersion, setSavingVersion] = React.useState(false);
  const [error, setError] = React.useState("");
  const [savedVersionId, setSavedVersionId] = React.useState<string | null>(null);
  const [providers, setProviders] = React.useState<ProviderCatalogue[] | null>(null);
  const [tailorModel, setTailorModel] = React.useState<ModelChoice | null>(null);
  const [showModel, setShowModel] = React.useState(false);

  /* ---------------- load, and run the analysis + fit check once -------------- */

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        const body = (await res.json()) as JobPayload & { error?: string };
        if (!res.ok) throw new Error(body.error || "Couldn't load this job.");
        if (cancelled) return;

        setData(body);
        setAnalysis(body.job.analysis);
        setFit(body.job.fitReport);

        const restored = versionParam
          ? body.versions.find((v) => v.id === versionParam)
          : undefined;
        if (restored) {
          setChanges(restored.changes);
          setSavedVersionId(restored.id);
        }

        let currentAnalysis = body.job.analysis;
        if (!currentAnalysis) {
          setStage("Analysing the job description…");
          const aRes = await fetch("/api/job/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jdText: body.job.jdText }),
          });
          const aBody = await aRes.json();
          if (!aRes.ok) throw new Error(aBody.error || "Couldn't analyse the job description.");
          currentAnalysis = aBody.analysis as JobAnalysis;
          if (cancelled) return;
          setAnalysis(currentAnalysis);
          await fetch(`/api/jobs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ analysis: currentAnalysis }),
          });
        }

        if (!body.job.fitReport && currentAnalysis) {
          setStage("Checking how well your resume fits…");
          const fRes = await fetch("/api/fit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resume: body.masterResume, analysis: currentAnalysis }),
          });
          const fBody = await fRes.json();
          if (!fRes.ok) throw new Error(fBody.error || "Couldn't run the fit check.");
          if (cancelled) return;
          setFit(fBody.fitReport as FitReport);
          await fetch(`/api/jobs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fitReport: fBody.fitReport }),
          });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (!cancelled) setStage("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, versionParam]);

  // The model catalogue, so this run's tailoring model can be overridden here
  // without going to Settings.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) return;
        const body = (await res.json()) as {
          providers: ProviderCatalogue[];
          settings: ModelSettings;
        };
        if (cancelled) return;
        setProviders(body.providers);
        setTailorModel(body.settings.tailor);
      } catch {
        // Non-fatal: tailoring still uses the saved setting server-side.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* -------------------------- derived, in-browser state -------------------------- */

  const master = data?.masterResume ?? null;

  const tailored = React.useMemo(
    () => (master && changes ? applyChanges(master, changes) : master),
    [master, changes],
  );

  const beforeReport: MatchReport | null = React.useMemo(
    () => (master && analysis ? matchScore(master, analysis) : null),
    [master, analysis],
  );
  const afterReport: MatchReport | null = React.useMemo(
    () => (tailored && analysis ? matchScore(tailored, analysis) : null),
    [tailored, analysis],
  );

  const touchedIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const c of changes ?? []) {
      if (c.status !== "accepted" && c.status !== "edited") continue;
      if (c.target.section === "summary") set.add("summary");
      else if (c.target.section === "headline") set.add("headline");
      else if (c.target.bulletId) set.add(c.target.bulletId);
      else if (c.target.itemId) set.add(c.target.itemId);
    }
    return set;
  }, [changes]);

  const pendingCount = (changes ?? []).filter((c) => c.status === "pending").length;
  const liveCount = (changes ?? []).filter(
    (c) => c.status === "accepted" || c.status === "edited",
  ).length;
  const warningCount = (changes ?? []).filter((c) => c.warnings.length > 0).length;

  /* -------------------------------- actions -------------------------------- */

  async function tailor() {
    if (!master || !analysis) return;
    setTailoring(true);
    setError("");
    setStage("Tailoring your resume…");
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: master,
          analysis,
          fitReport: fit,
          intensity,
          model: tailorModel ?? undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Tailoring failed.");
      setChanges(body.changes as Change[]);
      setGaps(body.gaps ?? []);
      setSavedVersionId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tailoring failed.");
    } finally {
      setTailoring(false);
      setStage("");
    }
  }

  async function toggleSkip() {
    if (!data) return;
    const skipped = !data.job.skipped;
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skipped }),
    });
    setData({ ...data, job: { ...data.job, skipped } });
  }

  function setStatus(changeId: string, status: Change["status"], after?: string) {
    setChanges(
      (current) =>
        current?.map((c) =>
          c.id === changeId ? { ...c, status, after: after ?? c.after } : c,
        ) ?? null,
    );
  }

  function setAll(status: Change["status"]) {
    setChanges((current) => current?.map((c) => ({ ...c, status })) ?? null);
  }

  async function saveVersion() {
    if (!tailored || !changes || !beforeReport || !afterReport) return;
    setSavingVersion(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: tailored,
          changes,
          scoreBefore: beforeReport.score,
          scoreAfter: afterReport.score,
          label: data?.job.company ? `${data.job.company} — ${data.job.title}` : data?.job.title,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't save this version.");
      setSavedVersionId(body.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this version.");
    } finally {
      setSavingVersion(false);
    }
  }

  /* --------------------------------- render --------------------------------- */

  if (!data) {
    return error ? (
      <div className="space-y-3">
        <ErrorNote>{error}</ErrorNote>
        <Link href="/" className="text-sm underline">
          Back to dashboard
        </Link>
      </div>
    ) : (
      <Spinner label="Loading this job…" />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">
            {analysis?.title ?? data.job.title}
            {analysis?.company || data.job.company ? (
              <span className="text-muted-foreground">
                {" "}
                · {analysis?.company ?? data.job.company}
              </span>
            ) : null}
          </h1>
          {analysis?.seniority ? (
            <p className="text-xs text-muted-foreground">Seniority: {analysis.seniority}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {tailored ? (
            <ExportDialog
              resume={tailored}
              company={analysis?.company ?? data.job.company ?? undefined}
              role={analysis?.title ?? data.job.title}
              trigger="Export…"
            />
          ) : null}
          <Link href="/">
            <Button size="sm" variant="ghost">
              Dashboard
            </Button>
          </Link>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {stage ? <Spinner label={stage} /> : null}

      {fit ? (
        <FitBanner
          fit={fit}
          tailoring={tailoring}
          skipped={data.job.skipped}
          onTailor={tailor}
          onSkip={toggleSkip}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(260px,1fr)_minmax(380px,1.3fr)_minmax(300px,1fr)]">
        {/* Left: the JD with keyword highlighting */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Job description</CardTitle>
          </CardHeader>
          <CardContent>
            <KeywordHighlighter
              jdText={data.job.jdText}
              analysis={analysis}
              report={beforeReport}
            />
            {analysis && beforeReport ? (
              <div className="mt-4 space-y-2 border-t pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Missing keywords ({beforeReport.missing.length})
                </h3>
                <div className="flex flex-wrap gap-1">
                  {beforeReport.missing.length ? (
                    beforeReport.missing.map((m) => (
                      <Badge key={m} tone="red">
                        {m}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">None — good coverage.</span>
                  )}
                </div>
                <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Matched ({beforeReport.matched.length})
                </h3>
                <div className="flex flex-wrap gap-1">
                  {beforeReport.matched.map((m) => (
                    <Badge key={m} tone="green">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Center: tailoring controls + diff review */}
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>
              Review changes
              {changes ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  {liveCount} on · {pendingCount} pending
                </span>
              ) : null}
            </CardTitle>
            {changes ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setView((v) => (v === "inline" ? "side-by-side" : "inline"))}
              >
                {view === "inline" ? "Side by side" : "Inline diff"}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <fieldset className="rounded-md border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">Intensity</legend>
              <div className="flex flex-wrap gap-3">
                {INTENSITIES.map((opt) => (
                  <label key={opt.value} className="flex items-start gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="intensity"
                      className="mt-1"
                      checked={intensity === opt.value}
                      onChange={() => setIntensity(opt.value)}
                    />
                    <span>
                      <span className="font-medium">{opt.label}</span>
                      <span className="block text-[11px] text-muted-foreground">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {providers && tailorModel ? (
                <div className="mt-3 border-t pt-3">
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground underline"
                    onClick={() => setShowModel((v) => !v)}
                    aria-expanded={showModel}
                  >
                    {showModel ? "Hide model" : `Model: ${tailorModel.model}`}
                  </button>
                  {showModel ? (
                    <div className="mt-2">
                      <ModelPicker
                        providers={providers}
                        idPrefix="tailor-run"
                        value={tailorModel}
                        onChange={setTailorModel}
                        compact
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Applies to this run only.{" "}
                        <Link href="/settings" className="underline">
                          Change the defaults
                        </Link>
                        .
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={tailor} disabled={tailoring || !analysis}>
                  {tailoring ? "Tailoring…" : changes ? "Re-tailor" : "Tailor my resume"}
                </Button>
                {changes ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setAll("accepted")}>
                      Accept all
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAll("rejected")}>
                      Reject all
                    </Button>
                  </>
                ) : null}
              </div>
            </fieldset>

            {warningCount > 0 ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {warningCount} change{warningCount === 1 ? "" : "s"} mention something that isn&apos;t
                in your original resume. They are flagged — check each before accepting.
              </p>
            ) : null}

            {changes === null ? (
              <EmptyState title="No changes proposed yet">
                Pick an intensity and tailor your resume. Nothing is applied until you accept it.
              </EmptyState>
            ) : changes.length === 0 ? (
              <EmptyState title="The AI proposed no changes">
                Your resume already matches this job&apos;s wording closely. Try a stronger intensity.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {changes.map((change) => (
                  <DiffItem
                    key={change.id}
                    change={change}
                    label={master ? changeLabel(master, change) : change.target.section}
                    view={view}
                    onAccept={() => setStatus(change.id, "accepted")}
                    onReject={() => setStatus(change.id, "rejected")}
                    onEdit={(text) => setStatus(change.id, "edited", text)}
                  />
                ))}
              </ul>
            )}

            {gaps.length > 0 ? (
              <div className="rounded-md border p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Gaps — not written into your resume
                </h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                  {gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {changes && changes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button onClick={saveVersion} disabled={savingVersion}>
                  {savingVersion ? "Saving…" : "Save this version"}
                </Button>
                {savedVersionId ? <Badge tone="green">Saved</Badge> : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Right: live preview + scores */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Match score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {beforeReport && afterReport ? (
                <>
                  <ScoreDelta before={beforeReport.score} after={afterReport.score} />
                  <CoverageBar
                    value={afterReport.mustHaveCoverage}
                    label="Must-have coverage (after)"
                  />
                  {afterReport.mustHaveMissing.length ? (
                    <div>
                      <p className="text-xs text-muted-foreground">Must-haves still missing:</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {afterReport.mustHaveMissing.map((m) => (
                          <Badge key={m} tone="red">
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <Spinner label="Scoring…" />
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Resume preview {liveCount > 0 ? "(with accepted changes)" : ""}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-auto bg-white p-5 text-black dark:bg-neutral-50">
              {tailored ? <ResumePreview resume={tailored} highlight={touchedIds} /> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
