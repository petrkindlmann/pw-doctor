import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

// Mock chokidar before importing the module under test
const mockOn = vi.fn().mockReturnThis();
const mockClose = vi.fn().mockResolvedValue(undefined);
vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: mockOn,
    close: mockClose,
  })),
}));

// Must import after vi.mock
import { watch } from 'chokidar';
import { startWatchMode } from '../../src/commands/watch.js';

describe('startWatchMode', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('creates watcher with correct pattern', () => {
    const cwd = '/project';
    const testDir = './tests';
    const testMatch = '**/*.spec.ts';
    const callback = vi.fn().mockResolvedValue(undefined);

    startWatchMode(cwd, testDir, testMatch, callback);

    const expectedPattern = path.join('/project', './tests', '**/*.spec.ts');
    expect(watch).toHaveBeenCalledWith(expectedPattern, {
      ignoreInitial: true,
      ignored: /node_modules/,
    });
  });

  it('displays watching message with pattern', () => {
    const cwd = '/project';
    const testDir = './tests';
    const testMatch = '**/*.spec.ts';
    const callback = vi.fn().mockResolvedValue(undefined);

    startWatchMode(cwd, testDir, testMatch, callback);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    const expectedPattern = path.join('/project', './tests', '**/*.spec.ts');
    expect(output).toContain(`Watching ${expectedPattern} for changes...`);
    expect(output).toContain('Press Ctrl+C to stop');
  });

  it('registers a change event handler', () => {
    const callback = vi.fn().mockResolvedValue(undefined);

    startWatchMode('/project', './tests', '**/*.spec.ts', callback);

    expect(mockOn).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('triggers callback after debounce on file change', async () => {
    vi.useFakeTimers();
    const callback = vi.fn().mockResolvedValue(undefined);

    startWatchMode('/project', './tests', '**/*.spec.ts', callback);

    // Get the change handler registered with watcher.on('change', handler)
    const changeHandler = mockOn.mock.calls.find((c) => c[0] === 'change')?.[1] as (
      filePath: string,
    ) => void;
    expect(changeHandler).toBeDefined();

    // Trigger a file change
    changeHandler('/project/tests/login.spec.ts');

    // Callback should not be called immediately (debounce)
    expect(callback).not.toHaveBeenCalled();

    // Advance past the 500ms debounce
    await vi.advanceTimersByTimeAsync(500);

    expect(callback).toHaveBeenCalledWith('/project/tests/login.spec.ts');

    vi.useRealTimers();
  });

  it('debounces multiple rapid changes', async () => {
    vi.useFakeTimers();
    const callback = vi.fn().mockResolvedValue(undefined);

    startWatchMode('/project', './tests', '**/*.spec.ts', callback);

    const changeHandler = mockOn.mock.calls.find((c) => c[0] === 'change')?.[1] as (
      filePath: string,
    ) => void;

    // Rapid file changes
    changeHandler('/project/tests/a.spec.ts');
    await vi.advanceTimersByTimeAsync(200);
    changeHandler('/project/tests/b.spec.ts');
    await vi.advanceTimersByTimeAsync(200);
    changeHandler('/project/tests/c.spec.ts');

    // Only 400ms since last change, callback should not have fired yet
    expect(callback).not.toHaveBeenCalled();

    // Advance past debounce from last change
    await vi.advanceTimersByTimeAsync(500);

    // Should only be called once, with the last file
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('/project/tests/c.spec.ts');

    vi.useRealTimers();
  });

  it('ignores node_modules via watcher config', () => {
    const callback = vi.fn().mockResolvedValue(undefined);

    startWatchMode('/project', './tests', '**/*.spec.ts', callback);

    const watchCall = vi.mocked(watch).mock.calls[0];
    const options = watchCall[1] as { ignored: RegExp };
    expect(options.ignored).toEqual(/node_modules/);
    expect(options.ignored.test('node_modules')).toBe(true);
    expect(options.ignored.test('node_modules/dep/test.spec.ts')).toBe(true);
  });

  it('close() stops the watcher', async () => {
    const callback = vi.fn().mockResolvedValue(undefined);

    const handle = startWatchMode('/project', './tests', '**/*.spec.ts', callback);

    await handle.close();

    expect(mockClose).toHaveBeenCalled();
  });

  it('uses ignoreInitial: true to skip existing files', () => {
    const callback = vi.fn().mockResolvedValue(undefined);

    startWatchMode('/project', './tests', '**/*.spec.ts', callback);

    const watchCall = vi.mocked(watch).mock.calls[0];
    const options = watchCall[1] as { ignoreInitial: boolean };
    expect(options.ignoreInitial).toBe(true);
  });
});
