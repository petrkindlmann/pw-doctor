import type { AiRepairInput, AiRepairResponse } from '@pw-doctor/shared';

export interface AiRepairAdapter {
  readonly provider: 'anthropic' | 'openai';
  suggestRepair(input: AiRepairInput): Promise<AiRepairResponse>;
}

export class AiAdapterError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = 'AiAdapterError';
  }
}
