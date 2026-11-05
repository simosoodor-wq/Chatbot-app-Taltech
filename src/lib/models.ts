export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export function isModelId(value: unknown): value is ModelId {
  return MODELS.some((model) => model.id === value);
}
