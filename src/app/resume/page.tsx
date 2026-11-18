"use client";

import * as React from "react";
import { ExportDialog } from "@/components/ExportDialog";
import { ResumePreview } from "@/components/ResumePreview";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorNote,
  Input,
  Label,
  Spinner,
  Textarea,
} from "@/components/ui";
import { emptyResume, type Resume } from "@/lib/schema";

type Draft = Resume;

let seq = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export default function ResumePage() {
  const [resume, setResume] = React.useState<Draft | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [parsing, setParsing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [pasted, setPasted] = React.useState("");

  React.useEffect(() => {
    void (async () => {
      const res = await fetch("/api/resume");
      const body = await res.json();
      setResume(body.resume ?? null);
      setLoading(false);
    })();
  }, []);

  function update(fn: (draft: Draft) => void) {
    setResume((current) => {
      const next = JSON.parse(JSON.stringify(current ?? emptyResume())) as Draft;
      fn(next);
      return next;
    });
    setStatus("");
  }

  async function importFile(file: File) {
    setParsing(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resume/parse", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't parse that file.");
      setResume(body.resume);
      setStatus("Imported. Check the fields below for parsing mistakes, then save.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't parse that file.");
    } finally {
      setParsing(false);
    }
  }

  async function importText() {
    setParsing(true);
    setError("");
    try {
      const res = await fetch("/api/resume/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasted }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't parse that text.");
      setResume(body.resume);
      setStatus("Imported. Check the fields below for parsing mistakes, then save.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't parse that text.");
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!resume) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/resume", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't save.");
      setStatus("Saved as your master resume.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading your resume…" />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,440px)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="file">PDF or DOCX</Label>
              <input
                id="file"
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="mt-1 block w-full text-sm"
                disabled={parsing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                …or paste the text instead
              </summary>
              <div className="mt-2 space-y-2">
                <Textarea
                  rows={6}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="Paste your resume text…"
                  aria-label="Resume text"
                />
                <Button size="sm" onClick={importText} disabled={parsing || pasted.trim().length < 80}>
                  Parse pasted text
                </Button>
              </div>
            </details>
            {parsing ? <Spinner label="Reading your resume…" /> : null}
            <ErrorNote>{error}</ErrorNote>
            {status ? <p className="text-sm text-green-700 dark:text-green-400">{status}</p> : null}
          </CardContent>
        </Card>

        {resume ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Contact</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Full name"
                  value={resume.contact.name}
                  onChange={(v) => update((d) => void (d.contact.name = v))}
                />
                <Field
                  label="Email"
                  value={resume.contact.email ?? ""}
                  onChange={(v) => update((d) => void (d.contact.email = v))}
                />
                <Field
                  label="Phone"
                  value={resume.contact.phone ?? ""}
                  onChange={(v) => update((d) => void (d.contact.phone = v))}
                />
                <Field
                  label="Location"
                  value={resume.contact.location ?? ""}
                  onChange={(v) => update((d) => void (d.contact.location = v))}
                />
                <div className="sm:col-span-2">
                  <Label>Links</Label>
                  <div className="mt-1 space-y-2">
                    {resume.contact.links.map((link, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={link.label}
                          placeholder="LinkedIn"
                          aria-label={`Link ${i + 1} label`}
                          onChange={(e) =>
                            update((d) => void (d.contact.links[i].label = e.target.value))
                          }
                        />
                        <Input
                          value={link.url}
                          placeholder="https://…"
                          aria-label={`Link ${i + 1} URL`}
                          onChange={(e) =>
                            update((d) => void (d.contact.links[i].url = e.target.value))
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove link ${i + 1}`}
                          onClick={() => update((d) => void d.contact.links.splice(i, 1))}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => update((d) => void d.contact.links.push({ label: "", url: "" }))}
                    >
                      Add link
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Headline and summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field
                  label="Headline"
                  value={resume.headline ?? ""}
                  onChange={(v) => update((d) => void (d.headline = v))}
                />
                <div>
                  <Label htmlFor="summary">Summary</Label>
                  <Textarea
                    id="summary"
                    rows={4}
                    className="mt-1"
                    value={resume.summary ?? ""}
                    onChange={(e) => update((d) => void (d.summary = e.target.value))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Experience</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update((d) =>
                      void d.experience.push({
                        id: nextId("exp"),
                        company: "",
                        title: "",
                        start: "",
                        end: "",
                        bullets: [],
                      }),
                    )
                  }
                >
                  Add role
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {resume.experience.map((exp, i) => (
                  <div key={exp.id} className="rounded-md border p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field
                        label="Title"
                        value={exp.title}
                        onChange={(v) => update((d) => void (d.experience[i].title = v))}
                      />
                      <Field
                        label="Company"
                        value={exp.company}
                        onChange={(v) => update((d) => void (d.experience[i].company = v))}
                      />
                      <Field
                        label="Start (YYYY-MM)"
                        value={exp.start}
                        onChange={(v) => update((d) => void (d.experience[i].start = v))}
                      />
                      <Field
                        label="End (YYYY-MM or Present)"
                        value={exp.end ?? ""}
                        onChange={(v) => update((d) => void (d.experience[i].end = v))}
                      />
                      <Field
                        label="Location"
                        value={exp.location ?? ""}
                        onChange={(v) => update((d) => void (d.experience[i].location = v))}
                      />
                    </div>

                    <div className="mt-3">
                      <Label>Bullets</Label>
                      <ul className="mt-1 space-y-2">
                        {exp.bullets.map((b, bi) => (
                          <li key={b.id} className="flex items-start gap-2">
                            <Textarea
                              rows={2}
                              value={b.text}
                              aria-label={`${exp.title || "Role"} bullet ${bi + 1}`}
                              onChange={(e) =>
                                update((d) => void (d.experience[i].bullets[bi].text = e.target.value))
                              }
                            />
                            <div className="flex flex-col gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Move bullet up"
                                disabled={bi === 0}
                                onClick={() =>
                                  update((d) => {
                                    const arr = d.experience[i].bullets;
                                    [arr[bi - 1], arr[bi]] = [arr[bi], arr[bi - 1]];
                                  })
                                }
                              >
                                ↑
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Move bullet down"
                                disabled={bi === exp.bullets.length - 1}
                                onClick={() =>
                                  update((d) => {
                                    const arr = d.experience[i].bullets;
                                    [arr[bi + 1], arr[bi]] = [arr[bi], arr[bi + 1]];
                                  })
                                }
                              >
                                ↓
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Remove bullet"
                                onClick={() =>
                                  update((d) => void d.experience[i].bullets.splice(bi, 1))
                                }
                              >
                                ✕
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            update((d) =>
                              void d.experience[i].bullets.push({ id: nextId("b"), text: "" }),
                            )
                          }
                        >
                          Add bullet
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => update((d) => void d.experience.splice(i, 1))}
                        >
                          Remove role
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {resume.experience.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No roles yet.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Skills</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update((d) => void d.skills.push({ id: nextId("sk"), name: "", items: [] }))
                  }
                >
                  Add group
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {resume.skills.map((group, i) => (
                  <div key={group.id} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                    <Input
                      value={group.name}
                      placeholder="Languages"
                      aria-label={`Skill group ${i + 1} name`}
                      onChange={(e) => update((d) => void (d.skills[i].name = e.target.value))}
                    />
                    <Input
                      value={group.items.join(", ")}
                      placeholder="TypeScript, Python"
                      aria-label={`Skill group ${i + 1} items`}
                      onChange={(e) =>
                        update(
                          (d) =>
                            void (d.skills[i].items = e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)),
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove skill group ${i + 1}`}
                      onClick={() => update((d) => void d.skills.splice(i, 1))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                {resume.skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No skill groups yet.</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Education</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update((d) => void d.education.push({ id: nextId("edu"), school: "", details: [] }))
                  }
                >
                  Add entry
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {resume.education.map((edu, i) => (
                  <div key={edu.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                    <Field
                      label="School"
                      value={edu.school}
                      onChange={(v) => update((d) => void (d.education[i].school = v))}
                    />
                    <Field
                      label="Degree"
                      value={edu.degree ?? ""}
                      onChange={(v) => update((d) => void (d.education[i].degree = v))}
                    />
                    <Field
                      label="Field"
                      value={edu.field ?? ""}
                      onChange={(v) => update((d) => void (d.education[i].field = v))}
                    />
                    <Field
                      label="End (YYYY)"
                      value={edu.end ?? ""}
                      onChange={(v) => update((d) => void (d.education[i].end = v))}
                    />
                    <div className="sm:col-span-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update((d) => void d.education.splice(i, 1))}
                      >
                        Remove entry
                      </Button>
                    </div>
                  </div>
                ))}
                {resume.education.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No education entries yet.</p>
                ) : null}
              </CardContent>
            </Card>

            <div className="sticky bottom-3 flex items-center gap-3 rounded-lg border bg-card p-3 shadow">
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save master resume"}
              </Button>
              <ExportDialog resume={resume} trigger="Export master" />
              {status ? <Badge tone="green">{status}</Badge> : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Import a resume above to start editing it.
          </p>
        )}
      </div>

      <aside className="lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]">
        <Card className="h-full overflow-hidden">
          <CardHeader>
            <CardTitle>Live preview</CardTitle>
          </CardHeader>
          <CardContent className="h-[calc(100%-3rem)] overflow-auto bg-white p-5 text-black dark:bg-neutral-50">
            {resume ? (
              <ResumePreview resume={resume} />
            ) : (
              <p className="text-sm text-neutral-500">Nothing to preview yet.</p>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = React.useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
