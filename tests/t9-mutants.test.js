// ==================== tests/t9-mutants.test.js ====================
// T9 · Mutant 還原驗證 —— 證明結構守門真係守得住。
//
// 做法：喺**記憶體**把 index.html 改壞（唔寫落磁盤），再行同一個 structuralFails()。
// 如果改壞之後守門仍然全綠 → 個守門係假嘅 → 呢個測試紅。
// 見 docs/TEST-PLAN.md §6
import { describe, it, expect } from 'vitest';
import { readAppHtml } from './harness.js';
import { structuralFails } from './structural.js';
import { MUTANTS } from './mutants.js';

const src = readAppHtml();

describe('T9 · mutant 還原驗證', () => {
  for (const m of MUTANTS) {
    it(`${m.id}（${m.why}）令守門變紅`, () => {
      // 4. from 字串必須喺 source 出現**恰好一次**（出現多次 = 會改錯地方 = 假陽性）
      const count = src.split(m.from).length - 1;
      expect(count, `mutant ${m.id} 嘅 from 字串出現 ${count} 次（應該剛好 1 次）`).toBe(1);

      // 3. 喺記憶體改 source
      const mutated = src.split(m.from).join(m.to);
      expect(mutated, `mutant ${m.id} 冇改到 source`).not.toBe(src);

      // 2. 同正式斷言共用同一個函數
      const fails = structuralFails(mutated);
      expect(fails.length, `mutant ${m.id} 令 structuralFails 冇 fail`).toBeGreaterThan(0);

      // 而且要係「對應嗰條斷言」fail，唔係撞到另一條
      const hit = m.covers.every(id => fails.some(f => f.startsWith(`${id}:`)));
      expect(hit, `mutant ${m.id} 冇令對應斷言 ${m.covers.join(',')} 變紅；實際 fail：${fails.join(' | ')}`).toBe(true);
    });
  }
});
