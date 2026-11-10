// ==================== tests/t5-teacher.test.js ====================
// T5 · Teacher（老師端 CRUD + 標詞配對）
// 對應 docs/DESIGN.md §6、docs/TEST-PLAN.md §5.5
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadApp } from './harness.js';

const TEXT = '我今天和爸爸媽媽去了茶餐廳吃飯。';
// char index: 0我 1今 2天 3和 4爸 5爸 6媽 7媽 8去 9了 10茶 11餐 12廳 13吃 14飯 15。
const IDX_HE = 3;
const IDX_CHA = 10;
const IDX_CHI = 13;
const IDX_FAN = 14;
const IDX_PERIOD = 15;

let ctx;
let editor;
let teacher;

beforeEach(async () => {
  ctx = await loadApp();
  // ⚠️ app 第一次啟動會植入預設文章（Store.seedDefaults）。
  //    呢啲測試要由「空文章庫」開始，否則 list[0] 會係預設文章而唔係測試嗰篇。
  ctx.win.localStorage.removeItem('crArticles');
  editor = ctx.win.document.createElement('div');
  ctx.win.document.body.appendChild(editor);
  teacher = ctx.api.Teacher;
  teacher.begin(editor, TEXT, []);
});
afterEach(() => {
  ctx.close();
  vi.useRealTimers();
});

const charAt = (pos) => editor.querySelector(`.t-char[data-pos="${pos}"]`);
const clickChar = (pos) => charAt(pos).click();
// 撳詞入面任何一個字 → 選中個詞（下面會出現面板）
const selectWord = () => editor.querySelector('.t-word .t-char').click();
// 撳面板嘅「➕ 延長一字」→ 進入延長模式
const startExtend = () => editor.querySelector('.teacher-panel .word-ext').click();
const toastText = () => {
  const el = ctx.win.document.getElementById('toast');
  return el && !el.hidden ? el.textContent : '';
};
const settle = () => new Promise(r => setTimeout(r, 0));

describe('T5 · Teacher（老師端標詞配對）', () => {
  it('T5.1 撳第 1 個字 → 出現「再撳第 2 個字」提示', () => {
    clickChar(IDX_CHI);

    const hint = editor.querySelector('.teacher-hint');
    expect(hint.textContent).toContain('再撳第 2 個字');
    expect(charAt(IDX_CHI).classList.contains('pending')).toBe(true);
  });

  it('T5.2 再撳相鄰嘅第 2 個字 → 合併成一個詞', () => {
    clickChar(IDX_CHI);
    clickChar(IDX_FAN);

    const word = editor.querySelector('.t-word');
    expect(word).toBeTruthy();
    expect(word.textContent).toBe('吃飯');
    expect(teacher.getWords()).toEqual([{ start: 13, len: 2, text: '吃飯' }]);
  });

  it('T5.3 撳非相鄰嘅字 → 拒絕 + toast', () => {
    clickChar(IDX_HE);
    clickChar(IDX_CHI);

    expect(toastText()).toContain('相鄰');
    expect(teacher.getWords()).toEqual([]);
    expect(editor.querySelectorAll('.t-word')).toHaveLength(0);
  });

  it('T5.4 撳已經屬於另一個詞嘅字 → 拒絕 + toast', () => {
    clickChar(IDX_CHI);
    clickChar(IDX_FAN);          // 組咗「吃飯」

    clickChar(IDX_HE);           // 揀第一個字
    clickChar(IDX_FAN);          // 再撳「飯」（已經喺「吃飯」入面）

    expect(toastText()).toContain('已經喺');
    expect(teacher.getWords()).toHaveLength(1);
  });

  it('T5.5 撳標點 → 拒絕 + toast', () => {
    clickChar(IDX_PERIOD);

    expect(toastText()).toContain('標點');
    expect(teacher.getWords()).toEqual([]);
  });

  it('T5.6 「拆開全部詞」→ 全部還原成單字', () => {
    clickChar(IDX_CHI); clickChar(IDX_FAN);
    clickChar(IDX_CHA); clickChar(IDX_CHA + 1);
    expect(teacher.getWords()).toHaveLength(2);

    teacher.splitAll();

    expect(teacher.getWords()).toEqual([]);
    expect(editor.querySelectorAll('.t-word')).toHaveLength(0);
    expect(editor.querySelectorAll('.t-char')).toHaveLength(16);
  });

  it('T5.7 撳已組嘅詞 → 出現「取消合併」面板 → 移除該詞', () => {
    clickChar(IDX_CHI); clickChar(IDX_FAN);

    clickChar(IDX_CHI);                       // 撳已組嘅詞
    const panel = editor.querySelector('.teacher-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('取消合併');

    panel.querySelector('button').click();
    expect(teacher.getWords()).toEqual([]);
    expect(editor.querySelectorAll('.t-word')).toHaveLength(0);
  });

  it('T5.8 儲存 → localStorage.crArticles 有文章，shape 正確', () => {
    const article = ctx.api.Teacher.createArticle({ title: '去茶餐廳', text: TEXT, type: 'life' });
    clickChar(IDX_CHI); clickChar(IDX_FAN);
    article.words = teacher.getWords();
    ctx.api.Teacher.saveArticle(article);

    const raw = ctx.win.localStorage.getItem('crArticles');
    expect(raw).toBeTruthy();

    const list = JSON.parse(raw);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('去茶餐廳');
    expect(list[0].type).toBe('life');
    expect(list[0].text).toBe(TEXT);
    expect(list[0].words).toEqual([{ start: 13, len: 2, text: '吃飯' }]);
    expect(list[0].published).toBe(true);
  });

  it('T5.9 文章改咗令詞失效 → 老師端標示要重新配對', () => {
    // 「吃飯」改成「食飯」→ offset 對唔上
    teacher.begin(editor, '我今天和爸爸媽媽去了茶餐廳食飯。', [{ start: 13, len: 2, text: '吃飯' }]);

    const warn = editor.querySelector('.teacher-warn');
    expect(warn.hidden).toBe(false);
    expect(warn.textContent).toContain('要重新配對');
    expect(teacher.getInvalid()).toHaveLength(1);
    expect(teacher.getInvalid()[0].reason).toBe('offset-mismatch');
  });

  it('T5.9b 「延長一字」→ 詞由 2 字變 3 字', () => {
    clickChar(IDX_CHA); clickChar(IDX_CHA + 1);      // 「茶餐」

    selectWord();
    startExtend();
    clickChar(IDX_CHA + 2);                          // 廳

    expect(teacher.getWords()).toEqual([{ start: 10, len: 3, text: '茶餐廳' }]);
  });

  it('T5.9c 延長模式撳唔相鄰嘅字 → 拒絕 + toast（詞唔變）', () => {
    clickChar(IDX_CHA); clickChar(IDX_CHA + 1);      // 「茶餐」

    selectWord();
    startExtend();
    clickChar(IDX_CHI);                              // 「食」—— 唔喺「茶餐」旁邊

    expect(toastText()).toContain('旁邊');
    expect(teacher.getWords()).toEqual([{ start: 10, len: 2, text: '茶餐' }]);
  });

  it('T5.10 延長到 5 字 → 要二次確認（取消就維持原本嘅 4 字詞）', async () => {
    clickChar(IDX_CHA); clickChar(IDX_CHA + 1);      // 「茶餐」
    selectWord(); startExtend(); clickChar(IDX_CHA + 2);   // →「茶餐廳」
    selectWord(); startExtend(); clickChar(IDX_CHI);        // →「茶餐廳吃」
    selectWord(); startExtend(); clickChar(IDX_FAN);        // →「茶餐廳吃飯」（5 字）

    const modal = ctx.win.document.getElementById('modal');
    expect(modal.hidden).toBe(false);
    expect(modal.querySelector('.modal-message').textContent).toContain('茶餐廳吃飯');

    modal.querySelector('.modal-cancel').click();
    await settle();
    // 5 字版本冇成立，但之前 4 字嘅詞仲喺度
    expect(teacher.getWords()).toEqual([{ start: 10, len: 4, text: '茶餐廳吃' }]);
  });

  it('T5.10b 延長到 5 字 → 確認之後先成立', async () => {
    clickChar(IDX_CHA); clickChar(IDX_CHA + 1);      // 「茶餐」
    selectWord(); startExtend(); clickChar(IDX_CHA + 2);   // →「茶餐廳」
    selectWord(); startExtend(); clickChar(IDX_CHI);        // →「茶餐廳吃」
    selectWord(); startExtend(); clickChar(IDX_FAN);        // →「茶餐廳吃飯」（5 字）

    const modal = ctx.win.document.getElementById('modal');
    modal.querySelector('.modal-ok').click();
    await settle();

    expect(teacher.getWords()).toEqual([{ start: 10, len: 5, text: '茶餐廳吃飯' }]);
  });

  it('T5.11 匯出 JSON → 匯入 → 內容完全一致', () => {
    const a = ctx.api.Teacher.createArticle({ title: 'A', text: TEXT, type: 'life' });
    a.words = [{ start: 13, len: 2, text: '吃飯' }];
    ctx.api.Teacher.saveArticle(a);

    const before = JSON.parse(JSON.stringify(ctx.api.Store.getArticles()));
    expect(before).toHaveLength(1);

    const json = ctx.api.Teacher.exportJSON();
    ctx.api.Store.saveArticles([]);
    expect(ctx.api.Store.getArticles()).toEqual([]);

    const res = ctx.api.Teacher.importJSON(json);
    expect(res.ok).toBe(true);
    expect(res.count).toBe(1);
    expect(ctx.api.Store.getArticles()).toEqual(before);
  });

  it('T5.12 匯入壞 JSON → 唔 crash，回报錯誤', () => {
    const res = ctx.api.Teacher.importJSON('{ not json');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(ctx.api.Store.getArticles()).toEqual([]);
  });

  it('T5.13 詞語清單可以逐個刪除', () => {
    clickChar(IDX_CHI); clickChar(IDX_FAN);
    clickChar(IDX_CHA); clickChar(IDX_CHA + 1);

    const rows = editor.querySelectorAll('.word-row');
    expect(rows).toHaveLength(2);

    rows[0].querySelector('.word-del').click();
    expect(teacher.getWords()).toHaveLength(1);
  });

  it('T5.14 撳多次同一個字 = 取消選取', () => {
    clickChar(IDX_CHI);
    expect(charAt(IDX_CHI).classList.contains('pending')).toBe(true);

    clickChar(IDX_CHI);
    expect(charAt(IDX_CHI).classList.contains('pending')).toBe(false);
    expect(editor.querySelector('.teacher-hint').textContent).not.toContain('再撳第 2 個字');
  });
});
