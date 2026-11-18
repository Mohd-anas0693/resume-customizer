/**
 * Every provider accepts JSON Schema, but each accepts a different subset.
 *
 * The strictest common denominator is OpenAI's strict mode:
 *   - every object must set `additionalProperties: false`
 *   - every property must appear in `required`
 *   - so an "optional" field is expressed as a union with null
 *
 * Gemini's `responseJsonSchema` accepts that shape too, and Anthropic's
 * structured outputs apply the same transform inside their SDK. Producing it
 * once here keeps the three providers behaving identically: absent values come
 * back as null, and `stripNulls` turns them back into missing keys so the Zod
 * schemas' `.optional()` and `.default()` still apply.
 */

/** The normalised schema this module produces. */
export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  additionalProperties?: boolean;
  [key: string]: unknown;
};

/**
 * What callers may pass in. Readonly throughout, so the `as const` schemas in
 * `src/lib/tool-schemas.ts` are accepted without copying or casting.
 */
export type JsonSchemaInput = {
  readonly type?: string | readonly string[];
  readonly properties?: { readonly [key: string]: JsonSchemaInput };
  readonly required?: readonly string[];
  readonly items?: JsonSchemaInput;
  readonly enum?: readonly unknown[];
  readonly description?: string;
  readonly additionalProperties?: boolean;
  readonly [key: string]: unknown;
};

/** Keywords no provider needs and some reject outright. */
const DROPPED_KEYWORDS = new Set([
  "format",
  "default",
  "examples",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
]);

/**
 * Rewrite a schema into the strict dialect: all properties required, absent
 * values expressed as null, no extra keys allowed.
 */
export function toStrictJsonSchema(schema: JsonSchemaInput): JsonSchema {
  return transform(schema, true);
}

function transform(schema: JsonSchemaInput, topLevel = false): JsonSchema {
  const out: JsonSchema = {};

  for (const [key, value] of Object.entries(schema)) {
    if (DROPPED_KEYWORDS.has(key)) continue;
    if (key === "properties" || key === "items" || key === "required" || key === "type") continue;
    out[key] = Array.isArray(value) ? [...value] : value;
  }

  if (schema.type === "object" && schema.properties) {
    const originallyRequired = new Set<string>(schema.required ?? []);
    const properties: Record<string, JsonSchema> = {};

    for (const [name, child] of Object.entries(schema.properties) as [
      string,
      JsonSchemaInput,
    ][]) {
      const transformed = transform(child);
      // A property the model may legitimately omit becomes nullable instead,
      // because strict mode will not let us leave it out of `required`.
      properties[name] = originallyRequired.has(name) ? transformed : nullable(transformed);
    }

    out.type = "object";
    out.properties = properties;
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  } else if (schema.type === "array" && schema.items) {
    out.type = "array";
    out.items = transform(schema.items);
  } else if (schema.type !== undefined) {
    out.type = typeof schema.type === "string" ? schema.type : [...schema.type];
  }

  // A strict response must be an object at the top level.
  if (topLevel && out.type !== "object") {
    throw new Error("The top level of a structured-output schema must be an object.");
  }

  return out;
}

/** Widen a schema's type to allow null, leaving an already-nullable one alone. */
function nullable(schema: JsonSchema): JsonSchema {
  const { type } = schema;
  if (type === undefined) return schema;
  if (Array.isArray(type)) {
    return type.includes("null") ? schema : { ...schema, type: [...type, "null"] };
  }
  if (type === "null") return schema;
  return { ...schema, type: [type, "null"] };
}

/**
 * Structured outputs make every field required, so absent values arrive as
 * null. Strip them so Zod's `.optional()` and `.default()` apply.
 */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null).map((v) => stripNulls(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[key] = stripNulls(v);
    }
    return out as T;
  }
  return value;
}
