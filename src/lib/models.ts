/**
 * The OpenAI models ResolveFlow is allowed to call, using OpenAI's own model
 * ids (the app talks to api.openai.com with your OPENAI_API_KEY). Both AI
 * surfaces validate against this list so an edited settings.json can never
 * send an unsupported id.
 */
export const ALLOWED_MODELS = [
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "o4-mini",
] as const;

export const DEFAULT_MODEL = "gpt-4.1";

export const MODEL_LABELS: Record<string, string> = {
  "gpt-4.1": "GPT-4.1 — strongest general reasoning",
  "gpt-4.1-mini": "GPT-4.1 mini — balanced, cheaper",
  "gpt-4o": "GPT-4o — fast multimodal flagship",
  "gpt-4o-mini": "GPT-4o mini — fastest, high volume",
  "o4-mini": "o4-mini — reasoning model",
};

export function resolveModel(model: string | undefined): string {
  if (!model) return DEFAULT_MODEL;
  // Tolerate legacy gateway-prefixed ids saved in older configs.
  const bare = model.includes("/") ? model.slice(model.indexOf("/") + 1) : model;
  return (ALLOWED_MODELS as readonly string[]).includes(bare) ? bare : DEFAULT_MODEL;
}
