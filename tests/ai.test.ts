import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { callStructured } from "@/lib/ai";
import { stripNulls, toStrictJsonSchema, type JsonSchema } from "@/lib/ai/json-schema";
import { configuredProviders, defaultModelSettings, getProvider, PROVIDER_IDS, PROVIDERS, TASK_PROFILE } from "@/lib/ai/registry";
import { AiConfigError, AiValidationError, ModelSettingsSchema, type AiProvider } from "@/lib/ai/types";
import { fitJudgmentJsonSchema, jobAnalysisJsonSchema, resumeJsonSchema, tailorJsonSchema } from "@/lib/tool-schemas";
import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Schema dialect transform
 * ------------------------------------------------------------------ */

describe("toStrictJsonSchema", () => {
  it("marks every property required and forbids extra keys", () => {
    const out = toStrictJsonSchema({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a"],
    });
    expect(out.required).toEqual(["a", "b"]);
    expect(out.additionalProperties).toBe(false);
  });

  it("makes an originally-optional property nullable instead", () => {
    const out = toStrictJsonSchema({
      type: "object",
      properties: { name: { type: "string" }, email: { type: "string" } },
      required: ["name"],
    });
    expect(out.properties!.name.type).toBe("string");
    expect(out.properties!.email.type).toEqual(["string", "null"]);
  });

  it("leaves an already-nullable type alone", () => {
    const out = toStrictJsonSchema({
      type: "object",
      properties: { x: { type: ["string", "null"] } },
      required: [],
    });
    expect(out.properties!.x.type).toEqual(["string", "null"]);
  });

  it("recurses into nested objects and arrays", () => {
    const out = toStrictJsonSchema({
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, note: { type: "string" } },
            required: ["id"],
          },
        },
      },
      required: ["items"],
    });
    const item = out.properties!.items.items!;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(["id", "note"]);
    expect(item.properties!.note.type).toEqual(["string", "null"]);
  });

  it("keeps descriptions and enums, which steer the model", () => {
    const out = toStrictJsonSchema({
      type: "object",
      properties: {
        weight: { type: "integer", enum: [1, 2, 3], description: "how important" },
      },
      required: ["weight"],
    });
    expect(out.properties!.weight.enum).toEqual([1, 2, 3]);
    expect(out.properties!.weight.description).toBe("how important");
  });

  it("drops keywords that providers reject in strict mode", () => {
    const out = toStrictJsonSchema({
      type: "object",
      properties: { when: { type: "string", format: "date", minLength: 3, default: "x" } },
      required: ["when"],
    });
    expect(out.properties!.when).toEqual({ type: "string" });
  });

  it("refuses a non-object at the top level", () => {
    expect(() => toStrictJsonSchema({ type: "array", items: { type: "string" } })).toThrow(
      /must be an object/,
    );
  });

  it("does not mutate the schema it was given", () => {
    const input = {
      type: "object",
      properties: { a: { type: "string" } },
      required: [] as string[],
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    toStrictJsonSchema(input);
    expect(input).toEqual(snapshot);
  });

  it("accepts the app's four real schemas and makes each strict", () => {
    for (const schema of [
      resumeJsonSchema,
      jobAnalysisJsonSchema,
      fitJudgmentJsonSchema,
      tailorJsonSchema,
    ]) {
      const out = toStrictJsonSchema(schema);
      expect(out.type).toBe("object");
      assertStrict(out);
    }
  });
});

/** Every object in the tree must be closed and fully required. */
function assertStrict(schema: JsonSchema) {
  if (schema.type === "object" && schema.properties) {
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required ?? [])].sort()).toEqual(Object.keys(schema.properties).sort());
    for (const child of Object.values(schema.properties)) assertStrict(child);
  }
  if (schema.items) assertStrict(schema.items);
}

describe("stripNulls", () => {
  it("undoes the nullable-instead-of-optional trick", () => {
    expect(stripNulls({ name: "A", email: null, links: [] })).toEqual({ name: "A", links: [] });
  });
});

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

describe("provider registry", () => {
  it("has an entry for every provider id", () => {
    for (const id of PROVIDER_IDS) {
      const provider = getProvider(id);
      expect(provider.id).toBe(id);
      expect(provider.label.length).toBeGreaterThan(0);
      expect(provider.envVar).toMatch(/API_KEY$/);
    }
  });

  it("throws on an unknown provider id", () => {
    // @ts-expect-error -- deliberately invalid
    expect(() => getProvider("mistral")).toThrow(AiConfigError);
  });

  it("gives every task an effort and a token budget", () => {
    for (const profile of Object.values(TASK_PROFILE)) {
      expect(profile.maxTokens).toBeGreaterThan(1000);
      expect(profile.effort).toBeTruthy();
    }
  });

  it("spends the most tokens and effort on tailoring", () => {
    expect(TASK_PROFILE.tailor.maxTokens).toBeGreaterThan(TASK_PROFILE.analyze.maxTokens);
    expect(TASK_PROFILE.tailor.effort).toBe("high");
  });
});

describe("defaultModelSettings", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("always returns a valid settings object", () => {
    expect(ModelSettingsSchema.safeParse(defaultModelSettings()).success).toBe(true);
  });

  it("puts a cheap model on parsing and the strongest on tailoring", () => {
    process.env.ANTHROPIC_API_KEY = "test";
    const settings = defaultModelSettings();
    expect(settings.parse.model).toBe("claude-haiku-5-5");
    expect(settings.tailor.model).toBe("claude-opus-5-5");
  });

  it("honours ANTHROPIC_MODEL as an override for every task", () => {
    process.env.ANTHROPIC_API_KEY = "test";
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    const settings = defaultModelSettings();
    expect(new Set(Object.values(settings).map((c) => c.model))).toEqual(
      new Set(["claude-sonnet-5-5"]),
    );
  });

  it("falls back to whichever provider has a key", () => {
    process.env.OPENAI_API_KEY = "test";
    process.env.OPENAI_MODEL = "gpt-test";
    const settings = defaultModelSettings();
    expect(settings.tailor).toEqual({ provider: "openai", model: "gpt-test" });
  });

  it("prefers Anthropic when more than one key is set", () => {
    process.env.ANTHROPIC_API_KEY = "test";
    process.env.OPENAI_API_KEY = "test";
    process.env.GEMINI_API_KEY = "test";
    expect(defaultModelSettings().tailor.provider).toBe("anthropic");
  });

  it("reports which providers are configured", () => {
    process.env.GEMINI_API_KEY = "test";
    expect(configuredProviders()).toEqual(["google"]);
  });

  it("treats GOOGLE_API_KEY as an alias for GEMINI_API_KEY", () => {
    process.env.GOOGLE_API_KEY = "test";
    expect(PROVIDERS.google.isConfigured()).toBe(true);
  });

  it("still produces settings when no key is set at all", () => {
    const settings = defaultModelSettings();
    expect(settings.tailor.provider).toBe("anthropic");
  });
});

/* ------------------------------------------------------------------ *
 * callStructured: validation and retry, independent of provider
 * ------------------------------------------------------------------ */

const Shape = z.object({ name: z.string(), count: z.number().default(0) });

/** A stand-in provider, so the shared logic can be tested without a network. */
function fakeProvider(
  responses: unknown[],
  overrides: Partial<AiProvider> = {},
): AiProvider & { calls: { model: string; repair?: string }[] } {
  const calls: { model: string; repair?: string }[] = [];
  let index = 0;
  return {
    id: "anthropic",
    label: "Fake",
    envVar: "FAKE_API_KEY",
    docsUrl: "https://example.com",
    isConfigured: () => true,
    defaultModel: () => "fake-default",
    curatedModels: [],
    listModels: async () => [],
    generateStructured: async (model, request) => {
      calls.push({ model, repair: request.repair });
      return responses[Math.min(index++, responses.length - 1)];
    },
    calls,
    ...overrides,
  };
}

/**
 * callStructured resolves its provider through the registry, so swapping the
 * registry entry is how the fake gets injected.
 */
const call = (model = "fake-model") =>
  callStructured({
    task: "analyze",
    choice: { provider: "anthropic", model },
    jsonSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    system: "s",
    userContent: "u",
    schema: Shape,
  });

describe("callStructured", () => {
  const originalAnthropic = PROVIDERS.anthropic;

  afterEach(() => {
    PROVIDERS.anthropic = originalAnthropic;
  });

  it("returns validated data on the first try", async () => {
    const provider = fakeProvider([{ name: "ok" }]);
    PROVIDERS.anthropic = provider;
    await expect(call()).resolves.toEqual({ name: "ok", count: 0 });
    expect(provider.calls).toHaveLength(1);
  });

  it("applies Zod defaults and strips nulls from the response", async () => {
    const provider = fakeProvider([{ name: "ok", count: null }]);
    PROVIDERS.anthropic = provider;
    await expect(call()).resolves.toEqual({ name: "ok", count: 0 });
  });

  it("retries once with the validation error fed back, then succeeds", async () => {
    const provider = fakeProvider([{ name: 42 }, { name: "fixed" }]);
    PROVIDERS.anthropic = provider;
    await expect(call()).resolves.toEqual({ name: "fixed", count: 0 });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[0].repair).toBeUndefined();
    expect(provider.calls[1].repair).toContain("failed validation");
  });

  it("gives up after one retry and names the provider and model", async () => {
    const provider = fakeProvider([{ name: 1 }, { name: 2 }]);
    PROVIDERS.anthropic = provider;
    await expect(call("bad-model")).rejects.toThrow(AiValidationError);
    await expect(call("bad-model")).rejects.toThrow(/Fake \(bad-model\)/);
  });

  it("retries when the provider could not produce JSON at all", async () => {
    const provider = fakeProvider([null, { name: "recovered" }]);
    PROVIDERS.anthropic = provider;
    await expect(call()).resolves.toEqual({ name: "recovered", count: 0 });
    expect(provider.calls).toHaveLength(2);
  });

  it("refuses to call a provider whose key is missing", async () => {
    const provider = fakeProvider([{ name: "ok" }], { isConfigured: () => false });
    PROVIDERS.anthropic = provider;
    await expect(call()).rejects.toThrow(AiConfigError);
    await expect(call()).rejects.toThrow(/FAKE_API_KEY is not set/);
    expect(provider.calls).toHaveLength(0);
  });

  it("falls back to the provider's default when the model id is blank", async () => {
    const provider = fakeProvider([{ name: "ok" }]);
    PROVIDERS.anthropic = provider;
    await call("   ");
    expect(provider.calls[0].model).toBe("fake-default");
  });
});
