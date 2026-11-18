"use client";

import * as React from "react";
import type { MatchReport } from "@/lib/match";
import type { JobAnalysis } from "@/lib/schema";

type Segment = { text: string; state: "matched" | "missing" | null };

/**
 * Highlight the JD text: terms the resume covers in green, ones it misses in
 * red. Matching is done on the raw JD text with word boundaries, so the
 * original wording is preserved exactly.
 */
function buildSegments(jdText: string, analysis: JobAnalysis, report: MatchReport): Segment[] {
  type Span = { start: number; end: number; state: "matched" | "missing" };
  const spans: Span[] = [];

  for (const keyword of analysis.keywords) {
    const hit = report.byKeyword[keyword.term];
    const state: "matched" | "missing" = hit?.found ? "matched" : "missing";
    for (const variant of [keyword.term, ...keyword.synonyms]) {
      const needle = variant.trim();
      if (needle.length < 2) continue;
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(jdText))) {
        spans.push({ start: m.index, end: m.index + m[0].length, state });
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
  }

  // Longest span wins on overlap; matched beats missing at equal length.
  spans.sort((a, b) => {
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    if (a.state !== b.state) return a.state === "matched" ? -1 : 1;
    return a.start - b.start;
  });

  const taken: Span[] = [];
  for (const span of spans) {
    if (taken.some((t) => span.start < t.end && span.end > t.start)) continue;
    taken.push(span);
  }
  taken.sort((a, b) => a.start - b.start);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const span of taken) {
    if (span.start > cursor) segments.push({ text: jdText.slice(cursor, span.start), state: null });
    segments.push({ text: jdText.slice(span.start, span.end), state: span.state });
    cursor = span.end;
  }
  if (cursor < jdText.length) segments.push({ text: jdText.slice(cursor), state: null });
  return segments;
}

export function KeywordHighlighter({
  jdText,
  analysis,
  report,
}: {
  jdText: string;
  analysis: JobAnalysis | null;
  report: MatchReport | null;
}) {
  const segments = React.useMemo(
    () => (analysis && report ? buildSegments(jdText, analysis, report) : null),
    [jdText, analysis, report],
  );

  return (
    <div>
      {segments ? (
        <p className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded bg-green-500/40" /> in your resume
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded bg-red-500/40" /> missing
          </span>
        </p>
      ) : null}
      <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">
        {segments
          ? segments.map((seg, i) =>
              seg.state ? (
                <mark
                  key={i}
                  className={
                    seg.state === "matched"
                      ? "rounded bg-green-200/70 px-0.5 text-inherit dark:bg-green-900/60"
                      : "rounded bg-red-200/70 px-0.5 text-inherit dark:bg-red-900/60"
                  }
                >
                  {seg.text}
                </mark>
              ) : (
                <React.Fragment key={i}>{seg.text}</React.Fragment>
              ),
            )
          : jdText}
      </pre>
    </div>
  );
}
