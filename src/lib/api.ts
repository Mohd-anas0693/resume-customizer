import { NextResponse } from "next/server";
import { AiConfigError, AiProviderError, AiValidationError } from "./ai";
import { ResumeReadError } from "./parse";
import { clientKey, rateLimit } from "./rate-limit";

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Shared guard for the AI routes: rate limit + uniform error mapping. */
export async function withAiGuard<T>(
  req: Request,
  handler: () => Promise<T>,
  limit = 20,
): Promise<NextResponse> {
  const gate = rateLimit(clientKey(req), limit);
  if (!gate.ok) {
    return jsonError(
      `Too many requests. Try again in ${gate.retryAfter}s.`,
      429,
      { retryAfter: gate.retryAfter },
    );
  }

  try {
    return NextResponse.json(await handler());
  } catch (err) {
    return mapError(err);
  }
}

export function mapError(err: unknown): NextResponse {
  if (err instanceof AiConfigError) return jsonError(err.message, 503);
  if (err instanceof AiProviderError) return jsonError(err.message, 502);
  if (err instanceof ResumeReadError) return jsonError(err.message, 422);
  if (err instanceof AiValidationError) {
    return jsonError(err.message, 502);
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  if (/rate.?limit|429/i.test(message)) {
    return jsonError("The Anthropic API is rate-limiting us. Wait a moment and retry.", 429);
  }
  if (/api key|401|authentication/i.test(message)) {
    return jsonError("The Anthropic API rejected the key in ANTHROPIC_API_KEY.", 503);
  }
  console.error("[api]", err);
  return jsonError(message, 500);
}
