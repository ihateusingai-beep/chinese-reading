// ==================== tests/t3-reader.test.js ====================
// T3 · Reader（學生端渲染 + 點擊 + 放大不重排 + 詞優先發音）
// 對應 docs/DESIGN.md §5.2 / §5.3 / §5.5.3、docs/TEST-PLAN.md §5.3
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readAppHtml, loadApp } from './harness.js';

const TEXT = '我今天和爸爸媽媽去了茶餐廳吃飯。';
const WORDS = [{ start: 10, len: 3, text: '茶餐廳' }, { start: 13, len: 2, text: '吃飯' }];

// 扁平字 index：0我 1今 2天 3和 4爸 5爸 6媽 7媽 8去 9了 | 10茶 11餐 12廳 | 13吃 14飯 | 15。
const IDX_HE = 3;        // 「和」— 獨立單字
const IDX_CHI = 13;      // 「吃」— 屬於「吃飯」詞
const IDX_PERIOD = 15;   // 「。」— 標點

let ctx;
let tokens;
let area;

beforeEach(async () => {
  ctx = await loadApp();
  tokens = ctx.api.Tokenizer.tokenize(TEXT, WORDS).tokens;
  area = ctx.win.document.createElement('div');
  ctx.win.document.body.appendChild(area);
  ctx.api.Reader.render(area, tokens);
});
afterEach(() => { ctx.close(); });

const clickChar = (ci) => area.querySelectorAll('.g')[ci].click();
const onTokens = () => area.querySelectorAll('.tok.on');
const onChars = () => area.querySelectorAll('.g.on');
const deepChars = () => area.querySelectorAll('.g.deep');

describe('T3 · Reader（學生端點讀）', () => {
  it('T3.1 撳單字 → 嗰個 token 有 .on，其餘冇', () => {
    clickChar(IDX_HE);

    const on = onTokens();
    expect(on).toHaveLength(1);
    expect(on[0].dataset.i).toBe('3');
    expect(on[0].dataset.type).toBe('c');
  });

  it('T3.2 撳單字 → speak 收到嗰個字', () => {
    clickChar(IDX_HE);
    expect(ctx.speech.spokenTexts()).toEqual(['和']);
  });

  it('T3.3 放大靠 CSS class（唔係 inline font-size）→ 唔會重排', () => {
    const g = area.querySelectorAll('.g')[IDX_HE];
    clickChar(IDX_HE);

    // ⚠️ 如果實作改用 style.fontSize，呢度就會有值 → 會觸發 reflow，成句字被推開
    expect(g.style.fontSize, '唔准用 inline font-size 放大（會令成句重排）').toBe('');
    expect(g.classList.contains('on')).toBe(true);
    // 真實重排檢查要喺 Tier 2（真實瀏覽器）做，jsdom 冇 layout engine
  });

  it('T3.4 撳詞 → 兩個字同時 .on', () => {
    clickChar(IDX_CHI);

    const on = onChars();
    expect(on).toHaveLength(2);
    expect(on[0].textContent).toBe('吃');
    expect(on[1].textContent).toBe('飯');
  });

  it('T3.5 撳詞 → speak 收到完整詞（書面語「吃飯」，TTS 用粵語讀成「食飯」）', () => {
    clickChar(IDX_CHI);
    expect(ctx.speech.spokenTexts()).toEqual(['吃飯']);
  });

  it('T3.6 詞優先：撳「吃」→ 讀整個詞，但視覺上只有「吃」最深', () => {
    clickChar(IDX_CHI);

    expect(ctx.speech.spokenTexts()).toEqual(['吃飯']);

    const deep = deepChars();
    expect(deep).toHaveLength(1);
    expect(deep[0].textContent).toBe('吃');

    // 整個詞都有 highlight（學生見到成個詞被讀）
    expect(onChars()).toHaveLength(2);
    expect(onTokens()).toHaveLength(1);
  });

  it('T3.7 撳詞中嘅字 → 讀音小卡顯示讀嘅係邊個詞', () => {
    clickChar(IDX_CHI);

    const card = ctx.win.document.getElementById('read-card');
    expect(card.hidden).toBe(false);
    expect(card.textContent).toContain('讀音：');
    expect(card.textContent).toContain('吃飯');
  });

  it('T3.8 老師設定切「單字優先」→ 撳「吃」→ 只讀「吃」', () => {
    ctx.api.Store.settings.wordPriority = false;
    clickChar(IDX_CHI);

    expect(ctx.speech.spokenTexts()).toEqual(['吃']);
    // 視覺上亦都只高亮嗰個字（唔係成個詞）
    expect(onChars()).toHaveLength(1);
  });

  it('T3.9 字格有固定寬度（唔係 auto）→ 放大唔會推走隔籬字', () => {
    const css = readAppHtml();
    const tokRule = (css.match(/\.tok\{([^}]*)\}/) || [])[1] || '';
    const m = tokRule.match(/width\s*:\s*([^;]+);/);

    expect(m, '.tok 必須有 width').toBeTruthy();
    expect(m[1].trim(), '.tok 唔可以用 width:auto').not.toBe('auto');
  });

  it('T3.10 字格唔會觸發文字選取（iPad 長按唔會彈「選擇/複製」選單）', () => {
    const css = readAppHtml();
    const tokRule = (css.match(/\.tok\{([^}]*)\}/) || [])[1] || '';

    expect(tokRule, '.tok 必須有 user-select:none').toMatch(/user-select\s*:\s*none/);
    expect(tokRule, 'iOS 要加 -webkit-touch-callout:none').toMatch(/-webkit-touch-callout\s*:\s*none/);
  });

  it('T3.11 撳標點唔會發音', () => {
    clickChar(IDX_PERIOD);
    expect(ctx.speech.spokenTexts()).toEqual([]);
  });

  it('T3.12 撳字會停低正在進行嘅串行朗讀（避免兩個聲音黐埋）', () => {
    ctx.api.Sequence.play(tokens, {});
    expect(ctx.api.Sequence.isPlaying()).toBe(true);

    clickChar(IDX_HE);
    expect(ctx.api.Sequence.isPlaying()).toBe(false);
  });

  it('T3.13 highlightToken() 高亮指定 token（讀全篇時個字跟住跳）', () => {
    ctx.api.Reader.highlightToken(3);

    const on = onTokens();
    expect(on).toHaveLength(1);
    expect(on[0].dataset.i).toBe('3');
  });

  it('T3.14 重新渲染會清走舊嘅高亮狀態', () => {
    clickChar(IDX_HE);
    expect(onTokens()).toHaveLength(1);

    ctx.api.Reader.render(area, tokens);
    expect(onTokens()).toHaveLength(0);
    expect(onChars()).toHaveLength(0);
  });
});
