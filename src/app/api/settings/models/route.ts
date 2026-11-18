import { NextResponse } from "next/server";
import { jsonError, mapError } from "@/lib/api";
import { ModelSettingsSchema, PROVIDERS } from "@/lib/ai";
import { getModelSettings, resetModelSettings, saveModelSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ settings: await getModelSettings() });
  } catch (err) {
    return mapError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const parsed = ModelSettingsSchema.safeParse(body.settings);
    if (!parsed.success) {
      return jsonError("Invalid model settings.", 400, {
        issues: parsed.error.issues.slice(0, 8),
      });
    }

    // Warn, but don't block: a user may be setting up a key they add next.
    const unconfigured = Array.from(
      new Set(
        Object.values(parsed.data)
          .map((choice) => choice.provider)
          .filter((id) => !PROVIDERS[id].isConfigured()),
      ),
    );

    return NextResponse.json({
      settings: await saveModelSettings(parsed.data),
      warnings: unconfigured.map(
        (id) => `${PROVIDERS[id].label} is selected but ${PROVIDERS[id].envVar} is not set.`,
      ),
    });
  } catch (err) {
    return mapError(err);
  }
}

export async function DELETE() {
  try {
    return NextResponse.json({ settings: await resetModelSettings() });
  } catch (err) {
    return mapError(err);
  }
}
