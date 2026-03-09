// packages/cli/src/ai/cost-estimator.ts

/**
 * Per-1M-token prices in cents for known models.
 */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 300, output: 1500 },
  'claude-haiku-4-5-20251001': { input: 80, output: 400 },
  'gpt-4o': { input: 250, output: 1000 },
  'gpt-4o-mini': { input: 15, output: 60 },
};

/**
 * Estimate the cost of an AI call in cents.
 *
 * @param _provider - The AI provider (currently unused, reserved for future per-provider pricing)
 * @param model - The model identifier
 * @param inputTokens - Number of input tokens consumed
 * @param outputTokens - Number of output tokens consumed
 * @returns Cost in cents, rounded to 2 decimal places. Returns 0 for unknown models.
 */
export function estimateCost(
  _provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const prices = MODEL_PRICES[model];
  if (!prices) return 0;

  const cost =
    (inputTokens * prices.input) / 1_000_000 +
    (outputTokens * prices.output) / 1_000_000;

  return Math.round(cost * 100) / 100;
}
