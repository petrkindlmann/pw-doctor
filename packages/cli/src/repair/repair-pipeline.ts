import type { RepairCandidate } from '@pw-doctor/shared';
import type { SelectorFailure } from '../core/test-runner.js';
import type { AiRepairAdapter } from '../ai/ai-adapter.js';
import { DomAnalyzer } from '../core/dom-analyzer.js';
import { tryTextMatch } from './text-match.js';
import { tryAttributeMatch } from './attribute-match.js';
import { rankCandidates, selectBestCandidate, type RankedCandidate } from './candidate-ranker.js';

export interface GenerateRepairOptions {
  aiAdapter?: AiRepairAdapter;
}

export async function generateRepairCandidates(
  failure: SelectorFailure,
  html: string,
  options?: GenerateRepairOptions,
): Promise<{ candidates: RepairCandidate[]; aiTokensUsed?: number }> {
  const analyzer = new DomAnalyzer(html);
  const candidates: RepairCandidate[] = [];

  // Strategy 1: Attribute match (highest confidence for semantic selectors)
  const attrCandidate = tryAttributeMatch({
    failedSelector: failure.selector,
    failedMethod: failure.method,
    analyzer,
  });
  if (attrCandidate) candidates.push(attrCandidate);

  // Strategy 2: Text match
  const textCandidate = tryTextMatch({
    failedSelector: failure.selector,
    failedMethod: failure.method,
    contextCode: '',
    analyzer,
  });
  if (textCandidate) candidates.push(textCandidate);

  // Strategy 3: AI-powered repair (when adapter is provided and HTML is available)
  let aiTokensUsed: number | undefined;
  if (options?.aiAdapter && html) {
    try {
      const aiResponse = await options.aiAdapter.suggestRepair({
        failedSelector: failure.selector,
        failedMethod: failure.method,
        errorMessage: failure.error,
        filePath: failure.file,
        line: failure.line,
        redactedHtml: html,
        contextCode: '',
      });

      aiTokensUsed = aiResponse.tokensUsed;

      for (const aiCandidate of aiResponse.candidates) {
        candidates.push({
          selector: aiCandidate.selector,
          method: aiCandidate.method,
          confidence: aiCandidate.confidence,
          strategy: 'ai',
          reasoning: aiCandidate.reasoning,
          elementMatch: {
            tag: '',
            text: '',
            attributes: {},
            isVisible: true,
            isUnique: true,
          },
        });
      }
    } catch {
      // AI failures are non-fatal — fall back to heuristic candidates only
    }
  }

  return { candidates, aiTokensUsed };
}

export interface RepairPlan {
  failure: SelectorFailure;
  bestCandidate: RankedCandidate | null;
  allCandidates: RankedCandidate[];
  aiTokensUsed?: number;
}

export async function buildRepairPlan(
  failure: SelectorFailure,
  html: string,
  options?: { autoApplyThreshold?: number; suggestThreshold?: number; aiAdapter?: AiRepairAdapter },
): Promise<RepairPlan> {
  const { candidates, aiTokensUsed } = await generateRepairCandidates(failure, html, {
    aiAdapter: options?.aiAdapter,
  });
  const ranked = rankCandidates(candidates, options);
  const best = selectBestCandidate(candidates, options);

  return {
    failure,
    bestCandidate: best,
    allCandidates: ranked,
    aiTokensUsed,
  };
}
