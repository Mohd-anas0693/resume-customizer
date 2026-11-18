import { NextResponse } from "next/server";
import { mapError } from "@/lib/api";
import {
  PROVIDER_IDS,
  PROVIDERS,
  TASK_HINT,
  TASK_LABEL,
  TASK_PROFILE,
  TASKS,
  type ModelInfo,
} from "@/lib/ai";
import { getModelSettings } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * The model catalogue for the settings UI: which providers have a key, the
 * curated suggestions, and the current per-task selection.
 *
 * `?refresh=1` additionally asks each configured provider which models the key
 * can really use, since the vendors' line-ups change faster than any list
 * committed to this repo.
 */
export async function GET(req: Request) {
  try {
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";

    const providers = await Promise.all(
      PROVIDER_IDS.map(async (id) => {
        const provider = PROVIDERS[id];
        const configured = provider.isConfigured();

        let live: ModelInfo[] | null = null;
        let liveError: string | null = null;
        if (refresh && configured) {
          try {
            live = await provider.listModels();
          } catch (err) {
            liveError = err instanceof Error ? err.message : "Couldn't list models.";
          }
        }

        return {
          id,
          label: provider.label,
          envVar: provider.envVar,
          docsUrl: provider.docsUrl,
          configured,
          defaultModel: configured ? provider.defaultModel() : null,
          curatedModels: provider.curatedModels,
          liveModels: live,
          liveError,
        };
      }),
    );

    return NextResponse.json({
      providers,
      settings: await getModelSettings(),
      tasks: TASKS.map((task) => ({
        id: task,
        label: TASK_LABEL[task],
        hint: TASK_HINT[task],
        effort: TASK_PROFILE[task].effort,
      })),
    });
  } catch (err) {
    return mapError(err);
  }
}
