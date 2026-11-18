"use client";

import * as React from "react";
import { ModelPicker, type ProviderCatalogue } from "@/components/ModelPicker";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorNote,
  Spinner,
} from "@/components/ui";
import type { AiTask, ModelChoice, ModelSettings } from "@/lib/ai/types";

type TaskInfo = { id: AiTask; label: string; hint: string; effort: string };

type Catalogue = {
  providers: ProviderCatalogue[];
  settings: ModelSettings;
  tasks: TaskInfo[];
};

export default function SettingsPage() {
  const [data, setData] = React.useState<Catalogue | null>(null);
  const [draft, setDraft] = React.useState<ModelSettings | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [warnings, setWarnings] = React.useState<string[]>([]);

  const load = React.useCallback(async (refresh = false) => {
    setError("");
    const res = await fetch(`/api/models${refresh ? "?refresh=1" : ""}`);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Couldn't load the model list.");
      return;
    }
    setData(body);
    setDraft(body.settings);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function refreshFromProviders() {
    setRefreshing(true);
    setStatus("");
    await load(true);
    setRefreshing(false);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch("/api/settings/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't save.");
      setWarnings(body.warnings ?? []);
      setStatus("Saved. New jobs and tailoring runs will use these models.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    const res = await fetch("/api/settings/models", { method: "DELETE" });
    const body = await res.json();
    setDraft(body.settings);
    setWarnings([]);
    setStatus("Reset to the defaults.");
    setSaving(false);
  }

  if (!data || !draft) {
    return error ? <ErrorNote>{error}</ErrorNote> : <Spinner label="Loading model settings…" />;
  }

  const configuredCount = data.providers.filter((p) => p.configured).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">AI model settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each of the four AI tasks can use a different provider and model. The deterministic
          parts of the app — the keyword score, the fit verdict rules, the fabrication check and
          the exports — run in code and are unaffected by what you choose here.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Providers</CardTitle>
          <Button size="sm" variant="outline" onClick={refreshFromProviders} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh model lists"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.providers.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{p.label}</span>
              {p.configured ? (
                <Badge tone="green">key set</Badge>
              ) : (
                <Badge tone="amber">no key</Badge>
              )}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{p.envVar}</code>
              {p.liveModels ? (
                <span className="text-[11px] text-muted-foreground">
                  {p.liveModels.length} models available
                </span>
              ) : null}
              {p.liveError ? (
                <span className="text-[11px] text-red-700 dark:text-red-400">{p.liveError}</span>
              ) : null}
              {!p.configured ? (
                <a
                  href={p.docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[11px] underline"
                >
                  get a key
                </a>
              ) : null}
            </div>
          ))}
          {configuredCount === 0 ? (
            <p className="pt-1 text-sm text-amber-700 dark:text-amber-400">
              No provider keys are set, so the AI steps can&apos;t run. Add at least one key to
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">.env.local</code>
              and restart the server.
            </p>
          ) : null}
          <p className="pt-1 text-[11px] text-muted-foreground">
            &quot;Refresh model lists&quot; asks each provider which models your key can actually
            use. Until then the picker shows suggestions, and you can type any model id.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model per task</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.tasks.map((task) => (
            <div key={task.id} className="border-t pt-4 first:border-t-0 first:pt-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{task.label}</h3>
                <Badge>effort: {task.effort}</Badge>
              </div>
              <p className="mb-2 text-[12px] text-muted-foreground">{task.hint}</p>
              <ModelPicker
                providers={data.providers}
                idPrefix={task.id}
                value={draft[task.id]}
                onChange={(choice: ModelChoice) =>
                  setDraft({ ...draft, [task.id]: choice })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <ErrorNote>{error}</ErrorNote>
      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <ul className="list-disc pl-4">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 shadow">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        <Button variant="ghost" onClick={reset} disabled={saving}>
          Reset to defaults
        </Button>
        {status ? <Badge tone="green">{status}</Badge> : null}
      </div>
    </div>
  );
}
