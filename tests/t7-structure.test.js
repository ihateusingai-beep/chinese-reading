// ==================== tests/t7-structure.test.js ====================
// T7 · 結構守門（正式版）。對應 docs/TEST-PLAN.md §5.7
import { describe, it, expect } from 'vitest';
import { readAppHtml } from './harness.js';
import { structuralFails } from './structural.js';

describe('T7 · 結構守門', () => {
  it('所有已實作嘅結構斷言都通過', () => {
    const fails = structuralFails(readAppHtml());
    expect(fails, `結構違規：\n${fails.join('\n')}`).toEqual([]);
  });
});
