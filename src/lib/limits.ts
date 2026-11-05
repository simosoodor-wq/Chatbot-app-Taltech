export const MAX_MESSAGE_LENGTH = 20_000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const HISTORY_MESSAGES = 20;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const ACCEPTED_FILES = ".pdf,.txt,.md,.csv,.json,image/jpeg,image/png,image/gif,image/webp";

export function dailyMessageLimit(): number {
  const parsed = Number(process.env.DAILY_MESSAGE_LIMIT);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 200;
}

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
