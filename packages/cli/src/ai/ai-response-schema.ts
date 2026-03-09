import { z } from 'zod';

export const AiCandidateSchema = z.object({
  selector: z.string(),
  method: z.string(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
});

export const AiResponseSchema = z.object({
  candidates: z.array(AiCandidateSchema),
});
