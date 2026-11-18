"use client";

import * as React from "react";
import { Button, ErrorNote, Label } from "@/components/ui";
import type { Resume } from "@/lib/schema";
import { exportFilename } from "@/lib/utils";

export function ExportDialog({
  resume,
  company,
  role,
  trigger = "Export",
}: {
  resume: Resume;
  company?: string;
  role?: string;
  trigger?: string;
}) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const [format, setFormat] = React.useState<"pdf" | "docx">("pdf");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const filename = exportFilename(resume.contact.name, company, role, format);

  async function download() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, company, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Export failed." }));
        throw new Error(body.error || "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => dialogRef.current?.showModal()}>
        {trigger}
      </Button>
      <dialog
        ref={dialogRef}
        className="w-[min(92vw,420px)] rounded-lg border bg-card p-0 text-card-foreground backdrop:bg-black/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void download();
          }}
        >
          <h2 className="text-sm font-semibold">Export resume</h2>

          <div>
            <Label>Template</Label>
            <p className="mt-1 text-sm">
              ATS-safe (single column) <span className="text-muted-foreground">— the only one in v1</span>
            </p>
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-muted-foreground">Format</legend>
            <div className="mt-1 flex gap-4 text-sm">
              {(["pdf", "docx"] as const).map((f) => (
                <label key={f} className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                  />
                  {f.toUpperCase()}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <Label>Filename</Label>
            <p className="mt-1 break-all rounded border bg-muted/50 p-2 font-mono text-[12px]">
              {filename}
            </p>
          </div>

          <ErrorNote>{error}</ErrorNote>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Preparing…" : `Download ${format.toUpperCase()}`}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
