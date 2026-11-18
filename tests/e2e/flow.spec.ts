import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The Phase 5 end-to-end flow: upload -> new job -> tailor -> accept all -> export PDF.
 *
 * This test calls the real Anthropic API, so it needs ANTHROPIC_API_KEY. It is
 * skipped (not failed) when the key is absent, so `npm test` stays runnable
 * offline.
 */
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
// Playwright runs from the project root.
const fixtures = path.resolve(process.cwd(), "fixtures");

test.describe("tailoring flow", () => {
  test.skip(!hasKey, "ANTHROPIC_API_KEY is not set");

  test("upload, analyse, tailor, accept all, export PDF", async ({ page }) => {
    // 1. Import the master resume from the fixture PDF.
    await page.goto("/resume");
    await page.setInputFiles("#file", path.join(fixtures, "sample-resume.pdf"));

    await expect(page.getByLabel("Full name")).toHaveValue(/Asha Verma/, { timeout: 120_000 });
    await expect(page.getByText("Software Engineer").first()).toBeVisible();

    await page.getByRole("button", { name: "Save master resume" }).click();
    await expect(page.getByText("Saved as your master resume.")).toBeVisible();

    // The edits survive a reload.
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue(/Asha Verma/);

    // 2. Create a job from the strong-fit JD.
    const jd = await readFile(path.join(fixtures, "jd-strong-fit.txt"), "utf8");
    await page.goto("/");
    await page.getByRole("button", { name: "New job" }).click();
    await page.getByLabel("Job description text").fill(jd);
    await page.getByRole("button", { name: "Analyse this job" }).click();

    // 3. The fit verdict banner appears, with the tailor button on it.
    await expect(page.getByRole("heading", { name: /fit|scope/i })).toBeVisible({
      timeout: 180_000,
    });
    const tailorButton = page.getByRole("button", { name: /^Tailor my resume$|^Tailor anyway$/ });
    await expect(tailorButton).toBeVisible();

    // The before score is rendered.
    await expect(page.getByText(/score \d+\/100/)).toBeVisible();

    // 4. Tailor.
    await tailorButton.first().click();
    await expect(page.getByRole("button", { name: "Accept all" })).toBeVisible({
      timeout: 240_000,
    });

    // 5. Accept all, then save the version.
    await page.getByRole("button", { name: "Accept all" }).click();
    await expect(page.getByText("accepted").first()).toBeVisible();

    await page.getByRole("button", { name: "Save this version" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    // 6. Export a PDF and confirm the download.
    await page.getByRole("button", { name: "Export…" }).click();
    await expect(page.getByText(/\.pdf$/)).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download PDF/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^Asha_Verma_.*\.pdf$/);

    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // 7. The version shows up on the dashboard.
    await page.goto("/");
    await expect(page.getByText(/→/).first()).toBeVisible();
  });
});

test("the dashboard loads and shows its cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Resume\s*Tailor/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Master resume" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New job" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Jobs and tailored versions" }),
  ).toBeVisible();
  // With no master resume yet, the dashboard shows its empty state.
  await expect(page.getByRole("link", { name: "Import resume" })).toBeVisible();
});
