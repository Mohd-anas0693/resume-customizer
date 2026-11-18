"use client";

import { Badge, Button } from "@/components/ui";
import { VERDICT_LABEL } from "@/lib/fit";
import type { FitReport } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { CoverageBar } from "./ScoreGauge";

const tone = {
  strong: {
    wrap: "border-green-400 bg-green-50 dark:border-green-800 dark:bg-green-950/40",
    pill: "green" as const,
  },
  partial: {
    wrap: "border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
    pill: "amber" as const,
  },
  out_of_scope: {
    wrap: "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
    pill: "red" as const,
  },
};

const blockerLabel: Record<string, string> = {
  skill: "Skill",
  years: "Experience",
  seniority: "Seniority",
  domain: "Domain",
  credential: "Credential",
  location: "Location",
};

export function FitBanner({
  fit,
  tailoring,
  onTailor,
  onSkip,
  skipped,
}: {
  fit: FitReport;
  tailoring: boolean;
  onTailor: () => void;
  onSkip: () => void;
  skipped: boolean;
}) {
  const t = tone[fit.verdict];
  const tailorLabel = fit.verdict === "out_of_scope" ? "Tailor anyway" : "Tailor my resume";

  return (
    <section
      aria-labelledby="fit-verdict"
      className={cn("rounded-lg border p-4", t.wrap)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[280px] flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h2 id="fit-verdict" className="text-base font-semibold">
              {VERDICT_LABEL[fit.verdict]}
            </h2>
            <Badge tone={t.pill}>score {fit.score}/100</Badge>
            {skipped ? <Badge>skipped</Badge> : null}
          </div>
          <p className="text-sm">{fit.summary}</p>

          <div className="mt-3 max-w-xs">
            <CoverageBar value={fit.mustHaveCoverage} label="Must-have coverage" />
          </div>

          {fit.blockers.length > 0 ? (
            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Why
              </h3>
              <ul className="mt-1 space-y-1 text-sm">
                {fit.blockers.map((b, i) => (
                  <li key={`${b.requirement}-${i}`} className="flex gap-2">
                    <Badge tone={t.pill} className="mt-0.5 shrink-0">
                      {blockerLabel[b.type] ?? b.type}
                    </Badge>
                    <span>
                      <span className="font-medium">{b.requirement}</span>
                      {b.reason ? <span className="text-muted-foreground"> — {b.reason}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {fit.transferable.length > 0 ? (
            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Transferable skills you already show
              </h3>
              <ul className="mt-1 space-y-1 text-sm">
                {fit.transferable.map((t2, i) => (
                  <li key={`${t2.jdNeed}-${i}`}>
                    <span className="font-medium">{t2.jdNeed}</span>
                    <span className="text-muted-foreground"> — “{t2.resumeEvidence}”</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="mt-3 text-sm text-muted-foreground">{fit.canTailorHelp}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          <Button onClick={onTailor} disabled={tailoring} size="lg">
            {tailoring ? "Tailoring…" : tailorLabel}
          </Button>
          <Button onClick={onSkip} variant="outline">
            {skipped ? "Un-skip this job" : "Skip this job"}
          </Button>
        </div>
      </div>
    </section>
  );
}
