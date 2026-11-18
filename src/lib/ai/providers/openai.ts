import OpenAI from "openai";
import { toStrictJsonSchema } from "../json-schema";
import {
  AiConfigError,
  AiProviderError,
  type AiProvider,
  type Effort,
  type ModelInfo,
  type StructuredRequest,
} from "../types";

/**
 * Deliberately short and unpriced: OpenAI's line-up moves faster than any list
 * committed to a repo, so the picker's real source is `listModels()`, which
 * asks the account what it can use. These are only a starting suggestion, and
 * OPENAI_MODEL overrides the default.
 */
const CURATED: ModelInfo[] = [
  { id: "gpt-5.5", label: "GPT-5.5", note: "Suggested flagship. Verify against your account." },
  { id: "gpt-5.5-mini", label: "GPT-5.5 mini", note: "Cheaper tier, if your account has it." },
];

/** OpenAI's reasoning efforts line up with ours one-to-one. */
const EFFORT: Record<Effort, "low" | "medium" | "high" | "xhigh" | "max"> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AiConfigError(
      "OPENAI_API_KEY is not set. Add it to .env.local and restart the server, or pick a different provider in Settings.",
    );
  }
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

/** Schema names must be a-z, A-Z, 0-9, underscore or dash. */
const schemaName = (label: string) => label.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || "result";

export const openaiProvider: AiProvider = {
  id: "openai",
  label: "OpenAI (GPT)",
  envVar: "OPENAI_API_KEY",
  docsUrl: "https://platform.openai.com/api-keys",
  isConfigured: () => Boolean(process.env.OPENAI_API_KEY),
  defaultModel: () => process.env.OPENAI_MODEL || CURATED[0].id,
  curatedModels: CURATED,

  async listModels() {
    const models: ModelInfo[] = [];
    for await (const model of getClient().models.list()) {
      // Audio, image and embedding models can't do structured text output.
      if (/embed|whisper|tts|dall-e|image|audio|moderation|realtime/i.test(model.id)) continue;
      models.push({ id: model.id, label: model.id });
    }
    return models.sort((a, b) => a.id.localeCompare(b.id, "en"));
  },

  async generateStructured(model, request: StructuredRequest) {
    const openai = getClient();

    const response = await openai.responses.create({
      model,
      instructions: request.system,
      input: request.repair
        ? `${request.userContent}\n\n${request.repair}`
        : request.userContent,
      max_output_tokens: request.maxTokens,
      reasoning: { effort: EFFORT[request.effort] },
      text: {
        format: {
          type: "json_schema",
          name: schemaName(request.label),
          schema: toStrictJsonSchema(request.jsonSchema) as Record<string, unknown>,
          strict: true,
        },
      },
    });

    if (response.status === "incomplete") {
      throw new AiProviderError(
        response.incomplete_details?.reason === "max_output_tokens"
          ? `The ${request.label} response was cut off before it finished. Try a shorter input.`
          : `The ${request.label} request did not complete.`,
      );
    }

    // A refusal arrives as a content part rather than an error, so look for it
    // before trying to parse the text as JSON.
    const parts = response.output.flatMap((item) => {
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? (content as { type?: string; refusal?: string }[]) : [];
    });
    const refusal = parts.find((part) => part.type === "refusal");
    if (refusal) {
      throw new AiProviderError(`The model declined this request: ${refusal.refusal ?? ""}`.trim());
    }

    const text = response.output_text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
};
