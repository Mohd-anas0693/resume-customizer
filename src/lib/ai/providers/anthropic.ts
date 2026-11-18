import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { toStrictJsonSchema } from "../json-schema";
import {
  AiConfigError,
  AiProviderError,
  type AiProvider,
  type ModelInfo,
  type StructuredRequest,
} from "../types";

/**
 * Pricing is USD per million tokens. Kept here only for the hints in the
 * model picker; `listModels()` is what tells you what your key can really use.
 */
const CURATED: ModelInfo[] = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    inputPer1M: 4,
    outputPer1M: 20,
    note: "Most capable. Best for tailoring.",
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    inputPer1M: 2,
    outputPer1M: 10,
    note: "Balanced speed and quality.",
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    inputPer1M: 0.1,
    outputPer1M: 0.5,
    note: "Cheapest. Fine for resume parsing.",
  },
  {
    id: "claude-fable-5-2",
    label: "Claude Fable 5.2",
    inputPer1M: 8,
    outputPer1M: 40,
    note: "Deepest reasoning, highest cost.",
  },
];

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiConfigError(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the server.",
    );
  }
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",
  label: "Anthropic (Claude)",
  envVar: "ANTHROPIC_API_KEY",
  docsUrl: "https://console.anthropic.com/settings/keys",
  isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  defaultModel: () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  curatedModels: CURATED,

  async listModels() {
    const page = await getClient().models.list({ limit: 50 });
    return page.data.map((m) => {
      const curated = CURATED.find((c) => c.id === m.id);
      return {
        id: m.id,
        label: m.display_name || m.id,
        inputPer1M: curated?.inputPer1M,
        outputPer1M: curated?.outputPer1M,
        note: curated?.note,
      };
    });
  },

  async generateStructured(model, request: StructuredRequest) {
    const anthropic = getClient();

    // The SDK applies its own strict transform; feed it the shape we already
    // normalised so all three providers see the same schema.
    const format = jsonSchemaOutputFormat(
      toStrictJsonSchema(request.jsonSchema) as Parameters<typeof jsonSchemaOutputFormat>[0],
    );

    const response = await anthropic.messages.parse({
      model,
      max_tokens: request.maxTokens,
      system: request.system,
      output_config: { format, effort: request.effort },
      messages: [
        {
          role: "user",
          content: request.repair
            ? `${request.userContent}\n\n${request.repair}`
            : request.userContent,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new AiProviderError(
        `Claude declined this request (${response.stop_details?.category ?? "unspecified"}).`,
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiProviderError(
        `The ${request.label} response was cut off before it finished. Try a shorter input.`,
      );
    }

    return response.parsed_output ?? null;
  },
};
