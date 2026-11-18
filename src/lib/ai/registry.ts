import { anthropicProvider } from "./providers/anthropic";
import { googleProvider } from "./providers/google";
import { openaiProvider } from "./providers/openai";
import {
  AiConfigError,
  type AiProvider,
  type AiTask,
  type Effort,
  type ModelChoice,
  type ModelSettings,
  type ProviderId,
} from "./types";

export const PROVIDERS: Record<ProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
};

export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "google"];

export function getProvider(id: ProviderId): AiProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new AiConfigError(`Unknown provider "${id}".`);
  return provider;
}

export function configuredProviders(): ProviderId[] {
  return PROVIDER_IDS.filter((id) => PROVIDERS[id].isConfigured());
}

/** How much thinking each task warrants, and how long its answer can be. */
export const TASK_PROFILE: Record<AiTask, { effort: Effort; maxTokens: number; label: string }> = {
  parse: { effort: "medium", maxTokens: 16000, label: "resume" },
  analyze: { effort: "medium", maxTokens: 8000, label: "job analysis" },
  fit: { effort: "high", maxTokens: 8000, label: "fit check" },
  tailor: { effort: "high", maxTokens: 32000, label: "tailoring" },
};

export const TASK_LABEL: Record<AiTask, string> = {
  parse: "Resume parsing",
  analyze: "Job analysis",
  fit: "Fit check",
  tailor: "Tailoring",
};

export const TASK_HINT: Record<AiTask, string> = {
  parse: "Mechanical transcription into the schema. A cheap model does this well.",
  analyze: "Pulling keywords and requirements out of the job description.",
  fit: "Judging blockers and transferable skills honestly.",
  tailor: "The hardest task, and the one where quality shows most.",
};

export const TASKS: AiTask[] = ["parse", "analyze", "fit", "tailor"];

/**
 * Defaults put the cheapest capable model on the mechanical work and the
 * strongest on tailoring. They use whichever provider has a key, preferring
 * Anthropic since that is what the app was built against.
 */
export function defaultModelSettings(): ModelSettings {
  const available = configuredProviders();
  const preferred: ProviderId = available.includes("anthropic")
    ? "anthropic"
    : (available[0] ?? "anthropic");

  if (preferred === "anthropic") {
    const envOverride = process.env.ANTHROPIC_MODEL;
    const cheap = envOverride || "claude-haiku-5-5";
    const mid = envOverride || "claude-sonnet-5-5";
    const best = envOverride || "claude-opus-5-5";
    return {
      parse: { provider: "anthropic", model: cheap },
      analyze: { provider: "anthropic", model: mid },
      fit: { provider: "anthropic", model: mid },
      tailor: { provider: "anthropic", model: best },
    };
  }

  // For the other providers we don't hardcode a tier ladder, since their
  // line-ups change; use the provider's single default everywhere.
  const model = getProvider(preferred).defaultModel();
  const choice: ModelChoice = { provider: preferred, model };
  return { parse: choice, analyze: choice, fit: choice, tailor: choice };
}
