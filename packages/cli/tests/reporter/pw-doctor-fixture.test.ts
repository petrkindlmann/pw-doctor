// packages/cli/tests/reporter/pw-doctor-fixture.test.ts
import { describe, it, expect } from 'vitest';

describe('pw-doctor-fixture', () => {
  it('exports test and expect', async () => {
    const mod = await import('../../src/reporter/pw-doctor-fixture.js');
    expect(mod.test).toBeDefined();
    expect(mod.expect).toBeDefined();
  });

  it('test is a function (extended Playwright test)', async () => {
    const mod = await import('../../src/reporter/pw-doctor-fixture.js');
    expect(typeof mod.test).toBe('function');
  });

  it('expect is a function', async () => {
    const mod = await import('../../src/reporter/pw-doctor-fixture.js');
    expect(typeof mod.expect).toBe('function');
  });

  it('test has extend method from base Playwright test', async () => {
    const mod = await import('../../src/reporter/pw-doctor-fixture.js');
    expect(typeof mod.test.extend).toBe('function');
  });

  it('test has describe, beforeEach, afterEach from base Playwright test', async () => {
    const mod = await import('../../src/reporter/pw-doctor-fixture.js');
    expect(typeof mod.test.describe).toBe('function');
    expect(typeof mod.test.beforeEach).toBe('function');
    expect(typeof mod.test.afterEach).toBe('function');
  });
});
