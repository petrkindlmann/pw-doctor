import { describe, it, expect } from 'vitest';
import { estimateCost } from '../../src/ai/cost-estimator.js';

describe('estimateCost', () => {
  it('returns correct cost for claude-sonnet-4-20250514', () => {
    // 1000 input tokens at 300 cents/1M = 0.3 cents
    // 500 output tokens at 1500 cents/1M = 0.75 cents
    // Total = 1.05 cents
    const cost = estimateCost('anthropic', 'claude-sonnet-4-20250514', 1000, 500);
    expect(cost).toBe(1.05);
  });

  it('returns correct cost for claude-haiku-4-5-20251001', () => {
    // 10000 input tokens at 80 cents/1M = 0.8 cents
    // 2000 output tokens at 400 cents/1M = 0.8 cents
    // Total = 1.6 cents
    const cost = estimateCost('anthropic', 'claude-haiku-4-5-20251001', 10000, 2000);
    expect(cost).toBe(1.6);
  });

  it('returns correct cost for gpt-4o', () => {
    // 5000 input tokens at 250 cents/1M = 1.25 cents
    // 1000 output tokens at 1000 cents/1M = 1.0 cents
    // Total = 2.25 cents
    const cost = estimateCost('openai', 'gpt-4o', 5000, 1000);
    expect(cost).toBe(2.25);
  });

  it('returns correct cost for gpt-4o-mini', () => {
    // 100000 input tokens at 15 cents/1M = 1.5 cents
    // 50000 output tokens at 60 cents/1M = 3.0 cents
    // Total = 4.5 cents
    const cost = estimateCost('openai', 'gpt-4o-mini', 100000, 50000);
    expect(cost).toBe(4.5);
  });

  it('returns 0 for unknown model', () => {
    const cost = estimateCost('anthropic', 'some-unknown-model', 1000, 500);
    expect(cost).toBe(0);
  });

  it('returns 0 with 0 input and 0 output tokens', () => {
    const cost = estimateCost('anthropic', 'claude-sonnet-4-20250514', 0, 0);
    expect(cost).toBe(0);
  });

  it('handles input-only tokens (0 output)', () => {
    // 1_000_000 input tokens at 300 cents/1M = 300 cents
    const cost = estimateCost('anthropic', 'claude-sonnet-4-20250514', 1_000_000, 0);
    expect(cost).toBe(300);
  });

  it('handles output-only tokens (0 input)', () => {
    // 1_000_000 output tokens at 1500 cents/1M = 1500 cents
    const cost = estimateCost('anthropic', 'claude-sonnet-4-20250514', 0, 1_000_000);
    expect(cost).toBe(1500);
  });

  it('rounds to 2 decimal places', () => {
    // 1 input token at 300 cents/1M = 0.0003 cents
    // 1 output token at 1500 cents/1M = 0.0015 cents
    // Total = 0.0018 cents → rounded to 0.00
    const cost = estimateCost('anthropic', 'claude-sonnet-4-20250514', 1, 1);
    expect(cost).toBe(0);
  });

  it('rounds correctly for mid-range values', () => {
    // 3333 input tokens at 300 cents/1M = 0.9999 cents
    // 0 output tokens
    // Total = 0.9999 → rounded to 1.00
    const cost = estimateCost('anthropic', 'claude-sonnet-4-20250514', 3333, 0);
    expect(cost).toBe(1);
  });

  it('returns 0 for unknown model regardless of provider', () => {
    expect(estimateCost('openai', 'unknown-model', 5000, 2000)).toBe(0);
    expect(estimateCost('anthropic', 'nonexistent', 10000, 5000)).toBe(0);
  });

  it('computes large token counts accurately', () => {
    // 500000 input at 250/1M = 125 cents
    // 200000 output at 1000/1M = 200 cents
    // Total = 325 cents
    const cost = estimateCost('openai', 'gpt-4o', 500000, 200000);
    expect(cost).toBe(325);
  });
});
