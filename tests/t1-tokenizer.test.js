// ==================== tests/t1-tokenizer.test.js ====================
// T1 · Tokenizer（token 化 + 詞覆蓋 + 失效降級）
// 對應 docs/DESIGN.md §4.1 / §4.2、docs/TEST-PLAN.md §5.1
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadApp } from './harness.js';

const TEXT = '我今天和爸爸媽媽去了茶餐廳吃飯。';   // 16 個 code point
const CHAR_COUNT = 16;

let ctx;
beforeEach(async () => { ctx = await loadApp(); });
afterEach(() => { ctx.close(); });

const T = () => ctx.api.Tokenizer;

describe('T1 · Tokenizer', () => {
  it('T1.1 冇詞 → 16 個 token（15 個 c + 1 個 p）', () => {
    const { tokens, invalid } = T().tokenize(TEXT, []);
    expect(tokens).toHaveLength(CHAR_COUNT);
    expect(tokens.filter(t => t.type === 'c')).toHaveLength(CHAR_COUNT - 1);
    expect(tokens.filter(t => t.type === 'p')).toHaveLength(1);
    expect(tokens.filter(t => t.type === 'w')).toHaveLength(0);
    expect(invalid).toEqual([]);
  });

  it('T1.2 有效詞 → 合併成 1 個 w token，冇重複 token', () => {
    const { tokens, invalid } = T().tokenize(TEXT, [{ start: 10, len: 3, text: '茶餐廳' }]);
    expect(invalid).toHaveLength(0);
    expect(tokens).toHaveLength(CHAR_COUNT - 3 + 1);

    const w = tokens.filter(t => t.type === 'w');
    expect(w).toHaveLength(1);
    expect(w[0].text).toBe('茶餐廳');
    expect(w[0].chars).toEqual(['茶', '餐', '廳']);
    expect(w[0].start).toBe(10);
    expect(w[0].len).toBe(3);

    // 每個 code point 只出現一次（冇重複、冇漏）
    const indices = tokens.flatMap(t => t.chars.map((_, k) => t.start + k));
    expect(indices).toHaveLength(CHAR_COUNT);
    expect(new Set(indices).size).toBe(CHAR_COUNT);
  });

  it('T1.3 詞嘅位置指向標點 → 降級成單字，唔 crash', () => {
    const { tokens, invalid } = T().tokenize(TEXT, [{ start: 15, len: 1, text: '。' }]);
    expect(tokens.filter(t => t.type === 'w')).toHaveLength(0);
    expect(tokens).toHaveLength(CHAR_COUNT);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toBe('contains-punctuation');
  });

  it('T1.4 文章改咗令 offset 錯位 → 詞失效降級成單字（幽靈 bug 防線）', () => {
    // 前面插入一個字 → 所有詞 offset 全部錯位
    const edited = '啊' + TEXT;
    const { tokens, invalid } = T().tokenize(edited, [{ start: 10, len: 3, text: '茶餐廳' }]);

    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toBe('offset-mismatch');
    expect(tokens.filter(t => t.type === 'w')).toHaveLength(0);
    // 降級後學生端照樣讀得通：全部變返單字 token
    expect(tokens.filter(t => t.type === 'c')).toHaveLength(edited.length - 1);
  });

  it('T1.5 emoji 唔會令 offset 錯位（code-point 而唔係 UTF-16）', () => {
    const text = '我😀今天和爸爸媽媽去了茶餐廳吃飯。';
    const chars = Array.from(text);
    expect(chars.indexOf('茶')).toBe(11);          // emoji 只佔 1 個 code point
    expect(text.indexOf('茶')).toBe(12);            // UTF-16 offset 就係 12（錯）

    const { tokens, invalid } = T().tokenize(text, [{ start: 11, len: 3, text: '茶餐廳' }]);
    expect(invalid).toHaveLength(0);
    const w = tokens.filter(t => t.type === 'w');
    expect(w).toHaveLength(1);
    expect(w[0].text).toBe('茶餐廳');
  });

  it('T1.6 兩個詞重疊 → 只取第一個，第二個降級', () => {
    const { tokens, invalid } = T().tokenize(TEXT, [
      { start: 10, len: 3, text: '茶餐廳' },
      { start: 10, len: 2, text: '茶餐' },
    ]);
    const w = tokens.filter(t => t.type === 'w');
    expect(w).toHaveLength(1);
    expect(w[0].text).toBe('茶餐廳');
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toBe('overlap');
  });

  it('T1.7 空字串 → 空 token 陣列，唔 throw', () => {
    expect(T().tokenize('', []).tokens).toEqual([]);
    expect(() => T().tokenize(null, [])).not.toThrow();
    expect(() => T().tokenize(undefined, null)).not.toThrow();
  });

  it('T1.8 words 係 null / undefined → 正常運作', () => {
    expect(T().tokenize(TEXT, null).tokens).toHaveLength(CHAR_COUNT);
    expect(T().tokenize(TEXT, undefined).tokens).toHaveLength(CHAR_COUNT);
    expect(T().tokenize(TEXT).tokens).toHaveLength(CHAR_COUNT);
    expect(T().tokenize(TEXT, 'not-an-array').tokens).toHaveLength(CHAR_COUNT);
  });

  it('T1.9 單字詞（len 1）→ 合法', () => {
    const { tokens, invalid } = T().tokenize(TEXT, [{ start: 3, len: 1, text: '和' }]);
    expect(invalid).toHaveLength(0);
    const w = tokens.filter(t => t.type === 'w');
    expect(w).toHaveLength(1);
    expect(w[0].text).toBe('和');
    expect(w[0].chars).toEqual(['和']);
  });

  it('T1.10 相鄰但唔重疊嘅兩個詞 → 兩個都有效', () => {
    const { tokens, invalid } = T().tokenize(TEXT, [
      { start: 10, len: 3, text: '茶餐廳' },
      { start: 13, len: 2, text: '吃飯' },
    ]);
    expect(invalid).toHaveLength(0);
    const w = tokens.filter(t => t.type === 'w');
    expect(w.map(x => x.text)).toEqual(['茶餐廳', '吃飯']);
    expect(tokens).toHaveLength(CHAR_COUNT - 3 - 2 + 2);
  });

  it('T1.11 validate() 直接用 → 每個詞都有 valid + reason', () => {
    const checks = T().validate(TEXT, [
      { start: 10, len: 3, text: '茶餐廳' },
      { start: 99, len: 2, text: '吃飯' },
    ]);
    expect(checks).toHaveLength(2);
    expect(checks[0].valid).toBe(true);
    expect(checks[0].reason).toBe(null);
    expect(checks[1].valid).toBe(false);
    expect(checks[1].reason).toBe('out-of-range');
    // 每個失效原因都有中文說明俾老師睇
    for (const c of checks) {
      if (!c.valid) expect(T().REASON_TEXT[c.reason]).toBeTruthy();
    }
  });

  it('T1.12 壞參數（len 0 / 負數 / 非整數 / start 負數）→ invalid-params', () => {
    for (const bad of [
      { start: 3, len: 0, text: '' },
      { start: 3, len: -1, text: '' },
      { start: -1, len: 2, text: '今天' },
      { start: 1.5, len: 2, text: '今天' },
      { start: 0, len: 1.5, text: '我' },
      null,
    ]) {
      const { invalid } = T().tokenize(TEXT, [bad]);
      expect(invalid, `應該判為 invalid-params：${JSON.stringify(bad)}`).toHaveLength(1);
      expect(invalid[0].reason).toBe('invalid-params');
    }
  });

  it('T1.13 詞超出文章範圍 → out-of-range', () => {
    const { invalid } = T().tokenize(TEXT, [{ start: 14, len: 5, text: '飯。吃飯' }]);
    expect(invalid[0].reason).toBe('out-of-range');
  });

  it('T1.14 token 可以還原返原文（round-trip 恆等式）', () => {
    const words = [
      { start: 10, len: 3, text: '茶餐廳' },
      { start: 13, len: 2, text: '吃飯' },
    ];
    for (const text of [TEXT, '我😀今天和爸爸媽媽去了茶餐廳吃飯。', '短。', '冇標點嘅一句話']) {
      const { tokens } = T().tokenize(text, words);
      const rebuilt = tokens.flatMap(t => t.chars).join('');
      expect(rebuilt, `token 拼返出嚟要同原文一樣：${text}`).toBe(text);
    }
  });
});
