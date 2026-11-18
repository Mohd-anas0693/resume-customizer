import { z } from "zod";
import type { JsonSchemaInput } from "./json-schema";

export const ProviderIdSchema = z.enum(["anthropic", "openai", "google"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** The four jobs the app asks a model to do. Each can use a different model. */
export const AiTaskSchema = z.enum(["parse", "analyze", "fit", "tailor"]);
export type AiTask = z.infer<typeof AiTaskSchema>;

export const EffortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type Effort = z.infer<typeof EffortSchema>;

export const ModelChoiceSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1).max(120),
});
export type ModelChoice = z.infer<typeof ModelChoiceSchema>;

export const ModelSettingsSchema = z.object({
  parse: ModelChoiceSchema,
  analyze: ModelChoiceSchema,
  fit: ModelChoiceSchema,
  tailor: ModelChoiceSchema,
});
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

export type StructuredRequest = {
  system: string;
  userContent: string;
  /** JSON Schema describing the expected response object. */
  jsonSchema: JsonSchemaInput;
  maxTokens: number;
  effort: Effort;
  /** Short name used in error messages, e.g. "tailoring". */
  label: string;
  /** Appended on a retry to tell the model what was wrong last time. */
  repair?: string;
};

export type ModelInfo = {
  id: string;
  label: string;
  /** USD per million tokens, when known. */
  inputPer1M?: number;
  outputPer1M?: number;
  /** Shown as a hint in the picker. */
  note?: string;
};

/**
 * One provider's implementation. Each returns a parsed JSON object; validating
 * it against Zod and retrying is handled once, in `callStructured`.
 */
export type AiProvider = {
  id: ProviderId;
  label: string;
  /** Environment variable holding this provider's key. */
  envVar: string;
  docsUrl: string;
  /** Whether the key is present in the server environment. */
  isConfigured: () => boolean;
  /** Fallback model when the user has not chosen one. */
  defaultModel: () => string;
  /** Models we can describe without calling the provider. */
  curatedModels: ModelInfo[];
  /** Ask the provider which models this key can actually use. */
  listModels: () => Promise<ModelInfo[]>;
  generateStructured: (model: string, request: StructuredRequest) => Promise<unknown>;
};

export class AiConfigError extends Error {}
export class AiValidationError extends Error {}
export class AiProviderError extends Error {}
