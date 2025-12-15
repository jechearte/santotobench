const FALLBACK_COLOR = "#6b7280";

export const PROVIDER_COLORS: Record<string, string> = {
  openai: "#1E9B75",
  gemini: "#1668F7",
  anthropic: "#C48E73",
  xai: "#000000",
};

export function getProviderColor(provider?: string): string {
  if (!provider) return FALLBACK_COLOR;
  const key = provider.toLowerCase();
  return PROVIDER_COLORS[key] ?? FALLBACK_COLOR;
}

