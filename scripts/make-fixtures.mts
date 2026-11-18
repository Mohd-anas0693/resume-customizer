/**
 * Generates fixtures/sample-resume.pdf and fixtures/sample-resume.docx from the
 * same resume object the unit tests use, so the upload path has real files to
 * parse. Run with: npx tsx scripts/make-fixtures.mts (or npm run fixtures).
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { renderResumeDocx } from "../src/lib/export-docx";
import { renderResumePdf } from "../src/lib/export-pdf";
import { softwareResume } from "../tests/fixtures";

const dir = path.resolve(import.meta.dirname, "..", "fixtures");

await writeFile(path.join(dir, "sample-resume.pdf"), await renderResumePdf(softwareResume));
await writeFile(path.join(dir, "sample-resume.docx"), await renderResumeDocx(softwareResume));
console.log("Wrote sample-resume.pdf and sample-resume.docx to", dir);
