import { describe, it, expect } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { promptForCandidate, assertTTY, type InteractiveChoice } from '../../src/interactive/prompt.js';
import type { RankedCandidate } from '../../src/repair/candidate-ranker.js';
import type { RepairCandidate } from '@pw-doctor/shared';

function makeCandidate(overrides: Partial<RepairCandidate> = {}): RepairCandidate {
  return {
    selector: '.submit-btn',
    method: 'locator',
    confidence: 80,
    strategy: 'attribute_match',
    reasoning: 'matched by attribute',
    elementMatch: {
      tag: 'button',
      text: 'Submit',
      attributes: {},
      isVisible: true,
      isUnique: true,
    },
    ...overrides,
  };
}

function makeRanked(overrides: Partial<RepairCandidate> = {}, score?: number, category?: 'auto_apply' | 'suggest' | 'skip'): RankedCandidate {
  const c = makeCandidate(overrides);
  return {
    candidate: c,
    finalScore: score ?? c.confidence,
    category: category ?? 'suggest',
  };
}

const failure = { file: 'login.spec.ts', line: 15, selector: '.submit-btn' };

function createMockInput(lines: string[]): PassThrough {
  const pt = new PassThrough();
  // Feed lines individually with small delays to let readline process each one
  // before the stream ends
  let i = 0;
  const feedNext = () => {
    if (i < lines.length) {
      pt.write(lines[i] + '\n');
      i++;
      // Use setImmediate to yield to readline's event processing
      setImmediate(feedNext);
    } else {
      setImmediate(() => pt.end());
    }
  };
  // Start feeding on next tick so readline is ready
  setImmediate(feedNext);
  return pt;
}

function createMockOutput(): Writable & { data: string } {
  const chunks: string[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  }) as Writable & { data: string };
  Object.defineProperty(writable, 'data', {
    get: () => chunks.join(''),
  });
  return writable;
}

describe('promptForCandidate', () => {
  const candidates: RankedCandidate[] = [
    makeRanked({ selector: 'button', method: 'getByRole', confidence: 92, strategy: 'attribute_match' }, 92, 'auto_apply'),
    makeRanked({ selector: 'Submit', method: 'getByText', confidence: 75, strategy: 'text_match' }, 75, 'suggest'),
    makeRanked({ selector: 'submit-button', method: 'getByTestId', confidence: 60, strategy: 'ai' }, 60, 'suggest'),
  ];

  it('input "1" selects first candidate', async () => {
    const input = createMockInput(['1']);
    const output = createMockOutput();
    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result).toEqual({ action: 'apply', candidate: candidates[0] });
  });

  it('input "2" selects second candidate', async () => {
    const input = createMockInput(['2']);
    const output = createMockOutput();
    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result).toEqual({ action: 'apply', candidate: candidates[1] });
  });

  it('input "3" selects third candidate', async () => {
    const input = createMockInput(['3']);
    const output = createMockOutput();
    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result).toEqual({ action: 'apply', candidate: candidates[2] });
  });

  it('input "s" returns skip', async () => {
    const input = createMockInput(['s']);
    const output = createMockOutput();
    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result).toEqual({ action: 'skip' });
  });

  it('input "S" returns skip (case insensitive)', async () => {
    const input = createMockInput(['S']);
    const output = createMockOutput();
    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result).toEqual({ action: 'skip' });
  });

  it('input "q" returns quit', async () => {
    const input = createMockInput(['q']);
    const output = createMockOutput();
    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result).toEqual({ action: 'quit' });
  });

  it('input "Q" returns quit (case insensitive)', async () => {
    const input = createMockInput(['Q']);
    const output = createMockOutput();
    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result).toEqual({ action: 'quit' });
  });

  it('input "e" triggers edit flow', async () => {
    const input = createMockInput(['e', 'getByTestId', 'my-custom-id']);
    const output = createMockOutput();
    const result = await promptForCandidate(failure, candidates, { input, output });
    expect(result).toEqual({ action: 'edit', method: 'getByTestId', selector: 'my-custom-id' });
  });

  it('displays failure info and candidates in output', async () => {
    const input = createMockInput(['s']);
    const output = createMockOutput();
    await promptForCandidate(failure, candidates, { input, output });

    expect(output.data).toContain('login.spec.ts:15');
    expect(output.data).toContain('.submit-btn');
    expect(output.data).toContain('Candidates');
    expect(output.data).toContain("getByRole('button')");
    expect(output.data).toContain("getByText('Submit')");
    expect(output.data).toContain("getByTestId('submit-button')");
  });
});

describe('assertTTY', () => {
  it('throws when input is not a TTY', () => {
    const input = createMockInput([]) as NodeJS.ReadableStream;
    expect(() => assertTTY(input)).toThrow('Interactive mode requires a TTY');
  });

  it('does not throw when input is a TTY', () => {
    const input = createMockInput([]) as NodeJS.ReadStream;
    (input as { isTTY: boolean }).isTTY = true;
    expect(() => assertTTY(input)).not.toThrow();
  });
});
