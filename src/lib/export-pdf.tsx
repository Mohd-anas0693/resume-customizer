/* eslint-disable jsx-a11y/alt-text */
import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import React from "react";
import type { Resume } from "./schema";

/**
 * One ATS-safe template: single column, standard section headings, real text
 * (no images, no text inside shapes), a common font, and no tables for layout.
 */
const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111111",
    lineHeight: 1.35,
  },
  name: { fontSize: 19, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  headline: { fontSize: 11, marginBottom: 3 },
  contactLine: { fontSize: 9, color: "#333333", marginBottom: 2 },
  sectionHeading: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 5,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: "#999999",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  itemHeader: { marginTop: 7 },
  itemTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold" },
  itemMeta: { fontSize: 9, color: "#444444", marginTop: 1 },
  bulletRow: { flexDirection: "row", marginTop: 3, paddingLeft: 2 },
  bulletGlyph: { width: 9 },
  bulletText: { flex: 1 },
  body: { marginTop: 1 },
  skillRow: { marginTop: 3 },
  skillName: { fontFamily: "Helvetica-Bold" },
  link: { color: "#1a4f8a", textDecoration: "none" },
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.sectionHeading}>{title}</Text>
      {children}
    </View>
  );
}

function Bullets({ items }: { items: { id: string; text: string }[] }) {
  return (
    <>
      {items
        .filter((b) => b.text.trim())
        .map((b) => (
          <View key={b.id} style={styles.bulletRow} wrap={false}>
            <Text style={styles.bulletGlyph}>•</Text>
            <Text style={styles.bulletText}>{b.text}</Text>
          </View>
        ))}
    </>
  );
}

function dateRange(start?: string, end?: string) {
  const s = start?.trim();
  const e = end?.trim() || "Present";
  if (!s) return e === "Present" ? "" : e;
  return `${s} – ${e}`;
}

export function ResumeDocument({ resume }: { resume: Resume }) {
  const c = resume.contact;
  const contactBits = [c.email, c.phone, c.location].filter(Boolean) as string[];

  return (
    <Document
      title={`${c.name || "Resume"}`}
      author={c.name || undefined}
      creator="Resume Tailor"
      producer="Resume Tailor"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{c.name || "Your name"}</Text>
        {resume.headline ? <Text style={styles.headline}>{resume.headline}</Text> : null}
        {contactBits.length ? (
          <Text style={styles.contactLine}>{contactBits.join("  •  ")}</Text>
        ) : null}
        {c.links.length ? (
          <Text style={styles.contactLine}>
            {c.links.map((l, i) => (
              <React.Fragment key={`${l.url}-${i}`}>
                {i > 0 ? "  •  " : ""}
                <Link src={l.url} style={styles.link}>
                  {l.label || l.url}
                </Link>
              </React.Fragment>
            ))}
          </Text>
        ) : null}

        {resume.summary?.trim() ? (
          <Section title="Summary">
            <Text style={styles.body}>{resume.summary}</Text>
          </Section>
        ) : null}

        {resume.experience.length ? (
          <Section title="Experience">
            {resume.experience.map((exp) => (
              <View key={exp.id}>
                <View style={styles.itemHeader} wrap={false}>
                  <Text style={styles.itemTitle}>
                    {exp.title}
                    {exp.company ? ` — ${exp.company}` : ""}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {[dateRange(exp.start, exp.end), exp.location].filter(Boolean).join("  •  ")}
                  </Text>
                </View>
                <Bullets items={exp.bullets} />
              </View>
            ))}
          </Section>
        ) : null}

        {resume.projects.length ? (
          <Section title="Projects">
            {resume.projects.map((p) => (
              <View key={p.id}>
                <View style={styles.itemHeader} wrap={false}>
                  <Text style={styles.itemTitle}>{p.name}</Text>
                  {p.link ? (
                    <Text style={styles.itemMeta}>
                      <Link src={p.link} style={styles.link}>
                        {p.link}
                      </Link>
                    </Text>
                  ) : null}
                </View>
                <Bullets items={p.bullets} />
              </View>
            ))}
          </Section>
        ) : null}

        {resume.education.length ? (
          <Section title="Education">
            {resume.education.map((e) => (
              <View key={e.id}>
                <View style={styles.itemHeader} wrap={false}>
                  <Text style={styles.itemTitle}>
                    {[e.degree, e.field].filter(Boolean).join(", ") || e.school}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {[
                      [e.degree, e.field].filter(Boolean).length ? e.school : "",
                      dateRange(e.start, e.end === undefined ? "" : e.end),
                    ]
                      .filter(Boolean)
                      .join("  •  ")}
                  </Text>
                </View>
                <Bullets items={e.details.map((d, i) => ({ id: `${e.id}-d${i}`, text: d }))} />
              </View>
            ))}
          </Section>
        ) : null}

        {resume.skills.length ? (
          <Section title="Skills">
            {resume.skills.map((g) => (
              <Text key={g.id} style={styles.skillRow}>
                <Text style={styles.skillName}>{g.name}: </Text>
                {g.items.join(", ")}
              </Text>
            ))}
          </Section>
        ) : null}

        {resume.certifications.length ? (
          <Section title="Certifications">
            {resume.certifications.map((cert, i) => (
              <Text key={`${cert.name}-${i}`} style={styles.skillRow}>
                {[cert.name, cert.issuer, cert.date].filter(Boolean).join(" — ")}
              </Text>
            ))}
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderResumePdf(resume: Resume): Promise<Buffer> {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return renderToBuffer(<ResumeDocument resume={resume} />);
}
