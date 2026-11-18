"use client";

import type { Resume } from "@/lib/schema";

/** On-screen mirror of the ATS export template. */
export function ResumePreview({ resume, highlight }: { resume: Resume; highlight?: Set<string> }) {
  const c = resume.contact;
  const isNew = (id: string) => highlight?.has(id) ?? false;

  return (
    <article className="space-y-3 text-[12.5px] leading-relaxed">
      <header>
        <h1 className="text-lg font-bold leading-tight">{c.name || "Your name"}</h1>
        {resume.headline ? <p className={isNew("headline") ? "ins" : ""}>{resume.headline}</p> : null}
        <p className="text-[11.5px] text-muted-foreground">
          {[c.email, c.phone, c.location].filter(Boolean).join("  •  ")}
        </p>
        {c.links.length ? (
          <p className="text-[11.5px]">
            {c.links.map((l, i) => (
              <span key={`${l.url}-${i}`}>
                {i > 0 ? "  •  " : ""}
                <a href={l.url} className="text-blue-700 underline dark:text-blue-400">
                  {l.label || l.url}
                </a>
              </span>
            ))}
          </p>
        ) : null}
      </header>

      {resume.summary ? (
        <Section title="Summary">
          <p className={isNew("summary") ? "ins" : ""}>{resume.summary}</p>
        </Section>
      ) : null}

      {resume.experience.length ? (
        <Section title="Experience">
          {resume.experience.map((e) => (
            <div key={e.id} className="mt-2">
              <p className="font-semibold">
                {e.title}
                {e.company ? ` — ${e.company}` : ""}
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                {[`${e.start}${e.start ? " – " : ""}${e.end || "Present"}`, e.location]
                  .filter(Boolean)
                  .join("  •  ")}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {e.bullets.map((b) => (
                  <li key={b.id} className={isNew(b.id) ? "ins" : ""}>
                    {b.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      ) : null}

      {resume.projects.length ? (
        <Section title="Projects">
          {resume.projects.map((p) => (
            <div key={p.id} className="mt-2">
              <p className="font-semibold">{p.name}</p>
              {p.link ? (
                <a href={p.link} className="text-[11.5px] text-blue-700 underline dark:text-blue-400">
                  {p.link}
                </a>
              ) : null}
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {p.bullets.map((b) => (
                  <li key={b.id} className={isNew(b.id) ? "ins" : ""}>
                    {b.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      ) : null}

      {resume.education.length ? (
        <Section title="Education">
          {resume.education.map((e) => (
            <div key={e.id} className="mt-2">
              <p className="font-semibold">
                {[e.degree, e.field].filter(Boolean).join(", ") || e.school}
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                {[
                  [e.degree, e.field].filter(Boolean).length ? e.school : "",
                  [e.start, e.end].filter(Boolean).join(" – "),
                ]
                  .filter(Boolean)
                  .join("  •  ")}
              </p>
              {e.details.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {e.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </Section>
      ) : null}

      {resume.skills.length ? (
        <Section title="Skills">
          {resume.skills.map((g) => (
            <p key={g.id} className={isNew(g.id) ? "ins" : ""}>
              <span className="font-semibold">{g.name}: </span>
              {g.items.join(", ")}
            </p>
          ))}
        </Section>
      ) : null}

      {resume.certifications.length ? (
        <Section title="Certifications">
          {resume.certifications.map((cert, i) => (
            <p key={`${cert.name}-${i}`}>
              {[cert.name, cert.issuer, cert.date].filter(Boolean).join(" — ")}
            </p>
          ))}
        </Section>
      ) : null}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mt-3 border-b pb-0.5 text-[11px] font-bold uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
  );
}
