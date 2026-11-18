"use client";

import * as React from "react";
import { Badge, Input, Label } from "@/components/ui";
import type { ModelChoice, ModelInfo, ProviderId } from "@/lib/ai/types";

export type ProviderCatalogue = {
  id: ProviderId;
  label: string;
  envVar: string;
  docsUrl: string;
  configured: boolean;
  defaultModel: string | null;
  curatedModels: ModelInfo[];
  liveModels: ModelInfo[] | null;
  liveError: string | null;
};

export function priceHint(model: ModelInfo | undefined): string | null {
  if (!model?.inputPer1M && !model?.outputPer1M) return null;
  return `$${model.inputPer1M}/$${model.outputPer1M} per 1M tokens`;
}

/** Live list when we have one, otherwise the curated suggestions. */
export function modelsFor(provider: ProviderCatalogue | undefined): ModelInfo[] {
  if (!provider) return [];
  return provider.liveModels?.length ? provider.liveModels : provider.curatedModels;
}

/**
 * Provider + model selector. The model field is a datalist-backed text input
 * rather than a plain dropdown, so a model id we don't know about can still be
 * typed in.
 */
export function ModelPicker({
  providers,
  value,
  onChange,
  idPrefix,
  compact = false,
}: {
  providers: ProviderCatalogue[];
  value: ModelChoice;
  onChange: (choice: ModelChoice) => void;
  idPrefix: string;
  compact?: boolean;
}) {
  const provider = providers.find((p) => p.id === value.provider);
  const options = modelsFor(provider);
  const selected = options.find((m) => m.id === value.model);
  const listId = `${idPrefix}-models`;

  return (
    <div className={compact ? "flex flex-wrap items-end gap-2" : "grid gap-2 sm:grid-cols-2"}>
      <div className={compact ? "w-[150px]" : ""}>
        <Label htmlFor={`${idPrefix}-provider`}>Provider</Label>
        <select
          id={`${idPrefix}-provider`}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={value.provider}
          onChange={(e) => {
            const next = e.target.value as ProviderId;
            const nextProvider = providers.find((p) => p.id === next);
            // Switching provider carries a model id that won't exist there, so
            // move to that provider's default.
            onChange({
              provider: next,
              model: nextProvider?.defaultModel || modelsFor(nextProvider)[0]?.id || "",
            });
          }}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.configured ? "" : " — no key"}
            </option>
          ))}
        </select>
      </div>

      <div className={compact ? "w-[220px]" : ""}>
        <Label htmlFor={`${idPrefix}-model`}>Model</Label>
        <Input
          id={`${idPrefix}-model`}
          className="mt-1"
          list={listId}
          value={value.model}
          placeholder={provider?.defaultModel ?? "model id"}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
        <datalist id={listId}>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </datalist>
      </div>

      {!compact ? (
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {priceHint(selected) ? <Badge tone="blue">{priceHint(selected)}</Badge> : null}
          {selected?.note ? <span>{selected.note}</span> : null}
          {!provider?.configured ? (
            <span className="text-amber-700 dark:text-amber-400">
              Set {provider?.envVar} in .env.local to use this provider.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
