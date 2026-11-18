import type { GoogleGenAI as GoogleGenAIClient } from "@google/genai";
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
 * As with OpenAI, Gemini's line-up moves quickly, so `listModels()` is the real
 * source for the picker and GEMINI_MODEL overrides the default.
 */
const CURATED: ModelInfo[] = [
  {
    id: "gemini-3-pro",
    label: "Gemini 3 Pro",
    note: "Suggested flagship. Verify against your account.",
  },
  {
    id: "gemini-3-flash",
    label: "Gemini 3 Flash",
    note: "Faster and cheaper tier, if available.",
  },
];

/** Gemini takes a coarse thinking level rather than our five efforts. */
const THINKING_LEVEL: Record<Effort, string> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  xhigh: "HIGH",
  max: "HIGH",
};

// The SDK is imported on first use, so a project that only uses another
// provider never loads it.
let clientPromise: Promise<GoogleGenAIClient> | null = null;

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new AiConfigError(
      "GEMINI_API_KEY is not set. Add it to .env.local and restart the server, or pick a different provider in Settings.",
    );
  }
  return key;
}

async function getClient(): Promise<GoogleGenAIClient> {
  const key = apiKey();
  if (!clientPromise) {
    clientPromise = import("@google/genai").then(
      ({ GoogleGenAI }) => new GoogleGenAI({ apiKey: key }),
    );
  }
  return clientPromise;
}

/** Gemini returns ids as "models/gemini-...". The API accepts either form. */
const shortId = (id: string) => id.replace(/^models\//, "");

export const googleProvider: AiProvider = {
  id: "google",
  label: "Google (Gemini)",
  envVar: "GEMINI_API_KEY",
  docsUrl: "https://aistudio.google.com/apikey",
  isConfigured: () => Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  defaultModel: () => process.env.GEMINI_MODEL || CURATED[0].id,
  tiers: () => {
    const override = process.env.GEMINI_MODEL;
    return {
      cheap: override || "gemini-3-flash",
      balanced: override || "gemini-3-flash",
      best: override || "gemini-3-pro",
    };
  },
  curatedModels: CURATED,

  async listModels() {
    const client = await getClient();
    const pager = await client.models.list();
    const models: ModelInfo[] = [];
    for await (const model of pager) {
      const id = shortId(model.name ?? "");
      if (!id) continue;
      // Keep only models that can generate text content.
      const actions = model.supportedActions;
      if (actions && actions.length > 0 && !actions.includes("generateContent")) continue;
      if (/embedding|aqa|imagen|veo|tts/i.test(id)) continue;
      models.push({ id, label: model.displayName || id });
    }
    return models.sort((a, b) => a.id.localeCompare(b.id, "en"));
  },

  async generateStructured(model, request: StructuredRequest) {
    const genai = await getClient();

    const response = await genai.models.generateContent({
      model: shortId(model),
      contents: request.repair
        ? `${request.userContent}\n\n${request.repair}`
        : request.userContent,
      config: {
        systemInstruction: request.system,
        responseMimeType: "application/json",
        responseJsonSchema: toStrictJsonSchema(request.jsonSchema),
        maxOutputTokens: request.maxTokens,
        // Cast: the SDK types this as its own ThinkingLevel enum, whose string
        // values are exactly these.
        thinkingConfig: {
          thinkingLevel: THINKING_LEVEL[request.effort] as never,
        },
      },
    });

    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new AiProviderError(
        `The ${request.label} response was cut off before it finished. Try a shorter input.`,
      );
    }
    if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      throw new AiProviderError("Gemini declined this request on safety grounds.");
    }

    const text = response.text;
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
};
