"use client";

import { cn } from "@/lib/utils";

function toneFor(score: number) {
  if (score >= 70) return { ring: "#16a34a", text: "text-green-700 dark:text-green-400" };
  if (score >= 45) return { ring: "#d97706", text: "text-amber-700 dark:text-amber-400" };
  return { ring: "#dc2626", text: "text-red-700 dark:text-red-400" };
}

export function ScoreGauge({
  score,
  label,
  size = 84,
}: {
  score: number;
  label: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tone = toneFor(clamped);
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (clamped / 100) * circumference;

  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label}: ${clamped} out of 100`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-muted"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className={cn("fill-current font-semibold", tone.text)}
          style={{ fontSize: size * 0.28 }}
        >
          {clamped}
        </text>
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export function ScoreDelta({ before, after }: { before: number; after: number }) {
  const delta = Math.round(after) - Math.round(before);
  return (
    <div className="flex items-end gap-3">
      <ScoreGauge score={before} label="Before" size={72} />
      <div className="pb-6 text-center">
        <span
          className={cn(
            "text-sm font-semibold",
            delta > 0
              ? "text-green-700 dark:text-green-400"
              : delta < 0
                ? "text-red-700 dark:text-red-400"
                : "text-muted-foreground",
          )}
        >
          {delta > 0 ? `+${delta}` : delta}
        </span>
      </div>
      <ScoreGauge score={after} label="After" size={72} />
    </div>
  );
}

export function CoverageBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const tone = toneFor(clamped);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold", tone.text)}>{clamped}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, background: tone.ring }}
        />
      </div>
    </div>
  );
}
