// ==================== tests/t10-meta.test.js ====================
// T10 · Meta 守門 —— 保證「冇嘢被遺漏」。
//
// 冇呢啲 meta-test 嘅話，可以慢慢加斷言但唔加 mutant、慢慢實作模組但唔加測試，
// 結果就係「只覆蓋咗一部分」但睇落好似全部驗過。
// 見 docs/TEST-PLAN.md §6.3
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadApp } from './harness.js';
import { ASSERTION_IDS } from './structural.js';
import { MUTANTS } from './mutants.js';

/** 模組 → 必須有嘅測試檔（防止「實作咗但冇測試」） */
const MODULE_TESTS = {
  App: 't0-app-integrity.test.js',
  Voice: 't2-voice.test.js',
  Store: 't8-storage.test.js',
  Tokenizer: 't1-tokenizer.test.js',
  Sequence: 't4-sequence.test.js',
  Reader: 't3-reader.test.js',
  Teacher: 't5-teacher.test.js',
  Toast: 't6-ui.test.js',
  Modal: 't6-ui.test.js',
  Sha256: 't11-auth.test.js',
  Auth: 't11-auth.test.js',
  Hub: 't12-hub.test.js',
  TeacherUI: 't13-teacher-ui.test.js',
};

describe('T10 · mutant 覆蓋率對齊', () => {
  it('每個結構斷言都有至少一個 mutant 對應', () => {
    const covered = new Set(MUTANTS.flatMap(m => m.covers));
    const missing = ASSERTION_IDS.filter(id => !covered.has(id));
    expect(missing, `呢啲斷言冇 mutant 對應：${missing.join(', ')}`).toEqual([]);
  });

  it('mutant 唔可以指向唔存在嘅斷言', () => {
    const known = new Set(ASSERTION_IDS);
    const unknown = MUTANTS.flatMap(m => m.covers).filter(id => !known.has(id));
    expect(unknown, `mutant 指向咗未實作嘅斷言：${unknown.join(', ')}`).toEqual([]);
  });

  it('每個 mutant 至少 cover 一條斷言', () => {
    const bad = MUTANTS.filter(m => !Array.isArray(m.covers) || m.covers.length === 0);
    expect(bad.map(m => m.id)).toEqual([]);
  });

  it('斷言 ID 唔可以重複', () => {
    expect(new Set(ASSERTION_IDS).size).toBe(ASSERTION_IDS.length);
  });
});

describe('T10 · 模組 ↔ 測試檔對齊', () => {
  it('已實作嘅模組必須有對應測試檔；仲係 placeholder 嘅就唔應該有', async () => {
    const { api, close } = await loadApp();

    for (const [name, testFile] of Object.entries(MODULE_TESTS)) {
      const mod = api[name];
      const isPlaceholder = !!(mod && mod.__placeholder === true);
      const exists = existsSync(resolve(ROOT, 'tests', testFile));

      if (isPlaceholder) {
        expect(exists, `${name} 仲係 placeholder，唔應該有 tests/${testFile}`).toBe(false);
      } else {
        expect(exists, `${name} 已實作，但缺少對應測試檔 tests/${testFile}`).toBe(true);
      }
    }
    close();
  });

  it('window.CR 每個模組都要喺 MODULE_TESTS 有映射（加新模組要跟住加測試）', async () => {
    const { api, close } = await loadApp();
    const unmapped = Object.keys(api).filter(k => !(k in MODULE_TESTS));
    expect(unmapped, `呢啲模組冇映射到測試檔：${unmapped.join(', ')}`).toEqual([]);
    close();
  });

  it('已實作嘅模組唔可以仲帶住 __placeholder 旗標', async () => {
    const { api, close } = await loadApp();
    for (const [name, testFile] of Object.entries(MODULE_TESTS)) {
      if (existsSync(resolve(ROOT, 'tests', testFile))) {
        const mod = api[name];
        expect(mod && mod.__placeholder, `${name} 有測試檔就唔應該仲係 placeholder`).not.toBe(true);
      }
    }
    close();
  });
});
