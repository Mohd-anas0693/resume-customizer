import type { ZodType } from "zod";
import type { JsonSchemaInput } from "./json-schema";
import { stripNulls } from "./json-schema";
import { getProvider, TASK_PROFILE } from "./registry";
import {
  AiConfigError,
  AiValidationError,
  type AiTask,
  type Effort,
  type ModelChoice,
} from "./types";

export * from "./types";
export { stripNulls, toStrictJsonSchema } from "./json-schema";
export {
  configuredProviders,
  defaultModelSettings,
  getProvider,
  PROVIDER_IDS,
  PROVIDERS,
  TASK_HINT,
  TASK_LABEL,
  TASK_PROFILE,
  TASKS,
} from "./registry";

type CallArgs<T> = {
  /** Which job this is; sets the effort, token budget and error label. */
  task: AiTask;
  /** Which provider and model to use. */
  choice: ModelChoice;
  jsonSchema: JsonSchemaInput;
  system: string;
  userContent: string;
  /** Validated before anything reaches the UI. */
  schema: ZodType<T>;
  /** Overrides the task profile when a caller needs to. */
  effort?: Effort;
  maxTokens?: number;
};

/**
 * Ask the selected model for structured data, validate it with Zod, and retry
 * once - feeding the validation error back - when the first attempt is
 * malformed. Identical behaviour whichever provider is chosen.
 */
export async function callStructured<T>({
  task,
  choice,
  jsonSchema,
  system,
  userContent,
  schema,
  effort,
  maxTokens,
}: CallArgs<T>): Promise<T> {
  const profile = TASK_PROFILE[task];
  const provider = getProvider(choice.provider);

  if (!provider.isConfigured()) {
    throw new AiConfigError(
      `${provider.label} is selected for ${profile.label}, but ${provider.envVar} is not set. Add it to .env.local, or choose a different provider in Settings.`,
    );
  }

  const model = choice.model.trim() || provider.defaultModel();
  const request = {
    system,
    userContent,
    jsonSchema,
    maxTokens: maxTokens ?? profile.maxTokens,
    effort: effort ?? profile.effort,
    label: profile.label,
  };

  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.generateStructured(model, {
      ...request,
      repair:
        attempt === 0
          ? undefined
          : `Your previous answer failed validation. Fix these problems and return the complete, corrected JSON:\n${lastError}`,
    });

    if (raw == null) {
      lastError = "The response was not valid JSON for the requested schema.";
      continue;
    }

    const parsed = schema.safeParse(stripNulls(raw));
    if (parsed.success) return parsed.data;
    lastError = JSON.stringify(parsed.error.issues.slice(0, 12), null, 1);
  }

  throw new AiValidationError(
    `${provider.label} (${model}) did not return a valid ${profile.label} after a retry. ${lastError}`,
  );
}
