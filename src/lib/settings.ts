import { defaultModelSettings, ModelSettingsSchema, type AiTask, type ModelChoice, type ModelSettings } from "./ai";
import { prisma } from "./db";

const MODEL_SETTINGS_KEY = "modelSettings";

/**
 * The saved model choices, falling back to the defaults for anything missing
 * or no longer valid - so a settings row written when only one provider had a
 * key keeps working after another is added.
 */
export async function getModelSettings(): Promise<ModelSettings> {
  const defaults = defaultModelSettings();

  const row = await prisma.appSetting.findUnique({ where: { key: MODEL_SETTINGS_KEY } });
  if (!row) return defaults;

  try {
    const parsed = ModelSettingsSchema.partial().safeParse(JSON.parse(row.value));
    if (!parsed.success) return defaults;
    return { ...defaults, ...stripUndefined(parsed.data) };
  } catch {
    return defaults;
  }
}

export async function saveModelSettings(settings: ModelSettings): Promise<ModelSettings> {
  const value = JSON.stringify(settings);
  await prisma.appSetting.upsert({
    where: { key: MODEL_SETTINGS_KEY },
    create: { key: MODEL_SETTINGS_KEY, value },
    update: { value },
  });
  return settings;
}

export async function resetModelSettings(): Promise<ModelSettings> {
  await prisma.appSetting.deleteMany({ where: { key: MODEL_SETTINGS_KEY } });
  return defaultModelSettings();
}

/**
 * Which model to use for one task: an explicit per-request override if the
 * caller sent one, otherwise the saved setting.
 */
export async function resolveModelChoice(
  task: AiTask,
  override?: unknown,
): Promise<ModelChoice> {
  if (override !== undefined && override !== null) {
    const parsed = ModelSettingsSchema.shape[task].safeParse(override);
    if (parsed.success) return parsed.data;
  }
  return (await getModelSettings())[task];
}

function stripUndefined(value: Partial<ModelSettings>): Partial<ModelSettings> {
  const out: Partial<ModelSettings> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v !== undefined) out[key as AiTask] = v;
  }
  return out;
}
