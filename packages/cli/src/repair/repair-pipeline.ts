import type { RepairCandidate } from '@pw-doctor/shared';
import type { SelectorFailure } from '../core/test-runner.js';
import type { AiRepairAdapter } from '../ai/ai-adapter.js';
import { DomAnalyzer } from '../core/dom-analyzer.js';
import { tryTextMatch } from './text-match.js';
import { tryAttributeMatch } from './attribute-match.js';
import { tryStructuralMatch } from './structural-match.js';
import { tryAnchorMatch } from './anchor-match.js';
import { rankCandidates, type RankedCandidate } from './candidate-ranker.js';
import { validateAiSelector } from '../ai/selector-validator.js';
import { verifyAgainstDom } from './dom-hard-gate.js';

export interface GenerateRepairOptions {
  aiAdapter?: AiRepairAdapter;
  contextCode?: string;
  /**
   * When set, skip the AI call if any heuristic candidate already meets
   * this confidence. Saves cost and latency when a heuristic clearly wins.
   * Pass `repair.autoApplyThreshold` from config.
   */
  aiShortCircuitThreshold?: number;
}

export async function generateRepairCandidates(
  failure: SelectorFailure,
  html: string,
  options?: GenerateRepairOptions,
): Promise<{ candidates: RepairCandidate[]; aiTokensUsed?: number; aiInputTokens?: number; aiOutputTokens?: number; aiSkipped?: 'heuristic_sufficient' }> {
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

  // Strategy 3: Structural similarity
  const structCandidate = tryStructuralMatch({
    failedSelector: failure.selector,
    failedMethod: failure.method,
    analyzer,
  });
  if (structCandidate) candidates.push(structCandidate);

  // Strategy 4: Anchor match
  const anchorCandidate = tryAnchorMatch({
    failedSelector: failure.selector,
    failedMethod: failure.method,
    analyzer,
  });
  if (anchorCandidate) candidates.push(anchorCandidate);

  // Fallback ladder: skip AI when a heuristic already clears the threshold.
  let aiSkipped: 'heuristic_sufficient' | undefined;
  const threshold = options?.aiShortCircuitThreshold;
  if (threshold !== undefined && candidates.some((c) => c.confidence >= threshold)) {
    aiSkipped = 'heuristic_sufficient';
  }

  // Strategy 5: AI-powered repair (when adapter is provided, HTML is available,
  // and no heuristic already clears the short-circuit threshold).
  let aiTokensUsed: number | undefined;
  let aiInputTokens: number | undefined;
  let aiOutputTokens: number | undefined;
  if (options?.aiAdapter && html && !aiSkipped) {
    try {
      const aiResponse = await options.aiAdapter.suggestRepair({
        failedSelector: failure.selector,
        failedMethod: failure.method,
        errorMessage: failure.error,
        filePath: failure.file,
        line: failure.line,
        redactedHtml: html,
        contextCode: options?.contextCode ?? '',
      });

      aiTokensUsed = aiResponse.tokensUsed;
      aiInputTokens = aiResponse.inputTokens;
      aiOutputTokens = aiResponse.outputTokens;

      for (const aiCandidate of aiResponse.candidates) {
        const validation = validateAiSelector(aiCandidate.selector, aiCandidate.method);
        if (!validation.valid) continue;

        const domGate = verifyAgainstDom(
          { selector: aiCandidate.selector, method: aiCandidate.method },
          analyzer,
          { expectedAction: failure.action },
        );
        if (!domGate.passes) continue;

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

  return { candidates, aiTokensUsed, aiInputTokens, aiOutputTokens, aiSkipped };
}

export interface RepairPlan {
  failure: SelectorFailure;
  bestCandidate: RankedCandidate | null;
  allCandidates: RankedCandidate[];
  aiTokensUsed?: number;
  aiInputTokens?: number;
  aiOutputTokens?: number;
  aiSkipped?: 'heuristic_sufficient';
}

export async function buildRepairPlan(
  failure: SelectorFailure,
  html: string,
  options?: { autoApplyThreshold?: number; suggestThreshold?: number; aiAdapter?: AiRepairAdapter; contextCode?: string },
): Promise<RepairPlan> {
  const { candidates, aiTokensUsed, aiInputTokens, aiOutputTokens, aiSkipped } = await generateRepairCandidates(failure, html, {
    aiAdapter: options?.aiAdapter,
    contextCode: options?.contextCode,
    aiShortCircuitThreshold: options?.autoApplyThreshold,
  });
  // Rank once — rankCandidates records fragility/reasons on each candidate, so
  // re-ranking would double-append those reason lines. The best is the head.
  const ranked = rankCandidates(candidates, options);
  const best = ranked.length > 0 ? ranked[0] : null;

  return {
    failure,
    bestCandidate: best,
    allCandidates: ranked,
    aiTokensUsed,
    aiInputTokens,
    aiOutputTokens,
    aiSkipped,
  };
}
