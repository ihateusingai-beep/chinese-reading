// ==================== tests/t13-teacher-ui.test.js ====================
// T13 · TeacherUI（老師端畫面：文章庫 / 標詞編輯 / 設定 / 匯入匯出）
// 對應 docs/DESIGN.md §6
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadApp } from './harness.js';

let ctx;

beforeEach(async () => {
  ctx = await loadApp();
  await ctx.initPromise;
  ctx.api.TeacherUI._editing = null;
});
afterEach(() => {
  ctx.close();
});

const app = () => ctx.win.document.getElementById('app');
const doc = () => ctx.win.document;
const articles = () => ctx.api.Store.getArticles();
const flush = () => new Promise(r => setTimeout(r, 0));

async function enterTeacher(pass = '230714') {
  const p = ctx.api.App.enterTeacher();
  doc().querySelector('.modal-input').value = pass;
  doc().querySelector('.modal-ok').click();
  await p;
}

/** 老師按「✏️ 標詞」進入編輯畫面（rowIndex = 文章喺文章庫嘅次序） */
function openEditor(rowIndex = 0) {
  const rows = app().querySelectorAll('.article-row');
  const btn = Array.from(rows[rowIndex].querySelectorAll('button'))
    .find(b => b.textContent.includes('標詞'));
  btn.click();
}

describe('T13.1 · TeacherUI 文章庫', () => {
  it('T13.1a 老師模式入得到（密碼啱）', async () => {
    await enterTeacher();
    expect(ctx.api.App.view).toBe('teacher');
    expect(app().querySelector('#teacher')).toBeTruthy();
  });

  it('T13.1b 文章庫列出全部文章（包括隱藏嘅 —— 老師要見到全部）', async () => {
    await enterTeacher();
    expect(app().querySelectorAll('.article-row').length).toBe(4);

    const list = articles();
    list[0].published = false;
    ctx.api.Store.saveArticles(list);
    ctx.api.TeacherUI._renderBody();

    expect(app().querySelectorAll('.article-row').length).toBe(4);
    expect(app().textContent).toContain('🚫 隱藏');
    expect(app().textContent).toContain('👁 已發佈');
  });

  it('T13.1c 撳「隱藏」→ published 反轉 + 學生端見唔到', async () => {
    await enterTeacher();
    const list = articles();
    const target = list[0];

    const rows = app().querySelectorAll('.article-row');
    const toggle = Array.from(rows[0].querySelectorAll('button'))
      .find(b => b.textContent.includes('隱藏'));
    toggle.click();

    expect(ctx.api.Store.getArticle(target.id).published).toBe(false);
    ctx.api.App.go('hub');
    expect(app().querySelectorAll('.article-card').length).toBe(3);
  });

  it('T13.1d 撳「刪除」→ 二次確認先刪；取消就唔刪', async () => {
    await enterTeacher();
    const target = articles()[0];

    // 第一次：取消
    const rows = app().querySelectorAll('.article-row');
    const del = Array.from(rows[0].querySelectorAll('button'))
      .find(b => b.textContent.includes('刪除'));
    del.click();
    await flush();
    doc().querySelector('.modal-cancel').click();
    await flush();
    expect(ctx.api.Store.getArticle(target.id)).toBeTruthy();

    // 第二次：確定
    const rows2 = app().querySelectorAll('.article-row');
    const del2 = Array.from(rows2[0].querySelectorAll('button'))
      .find(b => b.textContent.includes('刪除'));
    del2.click();
    await flush();
    doc().querySelector('.modal-ok').click();
    await flush();
    expect(ctx.api.Store.getArticle(target.id)).toBeFalsy();
    expect(articles().length).toBe(3);
  });
});

describe('T13.2 · TeacherUI 標詞編輯', () => {
  it('T13.2a 編輯現有文章 → 預填標題 / 類型 / 正文 + 已有詞', async () => {
    await enterTeacher();
    openEditor(0);

    const target = articles()[0];
    expect(doc().getElementById('edit-title').value).toBe(target.title);
    expect(doc().getElementById('edit-type').value).toBe(target.type);
    expect(doc().getElementById('edit-text').value).toBe(target.text);
    expect(doc().querySelectorAll('#teacher-editor .t-word').length).toBe(target.words.length);
  });

  it('T13.2b 撳相鄰兩個字 → 組詞；儲存 → words 寫入文章', async () => {
    await enterTeacher();
    openEditor(0);
    const target = articles()[0];

    // 位置 20/21 = 「兩杯」（預設文章入面未被標過嘅相鄰字）
    doc().querySelector('#teacher-editor .t-char[data-pos="20"]').click();
    doc().querySelector('#teacher-editor .t-char[data-pos="21"]').click();

    const marked = ctx.api.Teacher.getWords();
    expect(marked.some(w => w.text === '兩杯' && w.start === 20 && w.len === 2)).toBe(true);

    doc().getElementById('btn-save-article').click();

    const saved = ctx.api.Store.getArticle(target.id);
    expect(saved.words.some(w => w.text === '兩杯')).toBe(true);
    expect(saved.title).toBe(target.title);
    expect(ctx.api.App.view).toBe('teacher');
  });

  it('T13.2c 新增文章 → 填表 → 開始標詞 → 儲存 → 文章庫出現', async () => {
    await enterTeacher();
    app().querySelector('#btn-new-article').click();

    expect(ctx.api.App.view).toBe('teacher-edit');
    doc().getElementById('edit-title').value = '新文章測試';
    doc().getElementById('edit-type').value = 'poem';
    doc().getElementById('edit-text').value = '我今日好開心。';

    doc().getElementById('btn-start-marking').click();
    expect(doc().querySelectorAll('#teacher-editor .t-char').length).toBe(7);   // 「我今日好開心。」7 字（含句號）

    doc().getElementById('btn-save-article').click();

    expect(ctx.api.App.view).toBe('teacher');
    const list = articles();
    expect(list.length).toBe(5);
    const created = list.find(a => a.title === '新文章測試');
    expect(created).toBeTruthy();
    expect(created.type).toBe('poem');
    expect(created.text).toBe('我今日好開心。');
    expect(created.published).toBe(true);
  });

  it('T13.2d 未填內容就撳「開始標詞」→ 提示，唔入編輯模式', async () => {
    await enterTeacher();
    app().querySelector('#btn-new-article').click();
    doc().getElementById('btn-start-marking').click();

    expect(doc().getElementById('teacher-editor')).toBeFalsy();
    expect(doc().getElementById('toast').textContent).toContain('貼上');
  });

  it('T13.2h 唔使開始標詞就直接儲存（老師即場貼完文章就儲存）', async () => {
    await enterTeacher();
    app().querySelector('#btn-new-article').click();

    doc().getElementById('edit-title').value = '即場貼的文章';
    doc().getElementById('edit-text').value = '我今日好開心。';

    // 冇撳過「開始標詞」→ 標詞區應該未出現
    expect(doc().getElementById('teacher-editor')).toBeFalsy();

    doc().getElementById('btn-save-article').click();

    const list = articles();
    expect(list.length).toBe(5);
    const created = list.find(a => a.title === '即場貼的文章');
    expect(created).toBeTruthy();
    expect(created.text).toBe('我今日好開心。');
    expect(created.words).toEqual([]);        // 未標詞
  });

  it('T13.2i 內容係空嘅 → 唔會儲存（唔會產生空文章）', async () => {
    await enterTeacher();
    app().querySelector('#btn-new-article').click();
    doc().getElementById('edit-title').value = '空文章';
    doc().getElementById('btn-save-article').click();

    expect(articles().length).toBe(4);          // 冇加多
    expect(doc().getElementById('toast').textContent).toContain('空');
  });

  it('T13.2j 字數計數器跟住內容更新（emoji 當 1 個字）', async () => {
    await enterTeacher();
    app().querySelector('#btn-new-article').click();
    const ta = doc().getElementById('edit-text');
    expect(doc().getElementById('text-count').textContent).toBe('0 字');

    ta.value = '我今日好開心。';              // 7 個 code point
    ta.dispatchEvent(new ctx.win.Event('input'));
    expect(doc().getElementById('text-count').textContent).toBe('7 字');

    ta.value = '😀';                          // emoji = 1 個 code point
    ta.dispatchEvent(new ctx.win.Event('input'));
    expect(doc().getElementById('text-count').textContent).toBe('1 字');
  });

  it('T13.2e 未儲存就撳返回 → 二次確認；撳「繼續編輯」就留返喺編輯頁', async () => {
    await enterTeacher();
    openEditor(0);

    doc().getElementById('btn-cancel-edit').click();
    await flush();
    doc().querySelector('.modal-cancel').click();     // 繼續編輯
    await flush();
    expect(ctx.api.App.view).toBe('teacher-edit');

    doc().getElementById('btn-cancel-edit').click();
    await flush();
    doc().querySelector('.modal-ok').click();          // 唔儲存，返回
    await flush();
    expect(ctx.api.App.view).toBe('teacher');
  });
});

describe('T13.3 · TeacherUI 設定', () => {
  it('T13.3a 語速 slider → 改設定 + 存檔', async () => {
    await enterTeacher();
    app().querySelector('#tab-settings').click();

    const slider = doc().getElementById('set-rate');
    slider.value = '0.9';
    slider.dispatchEvent(new ctx.win.Event('input'));

    expect(ctx.api.Store.settings.rate).toBe(0.9);
    expect(JSON.parse(ctx.win.localStorage.getItem('crSettings')).rate).toBe(0.9);
    expect(ctx.api.Voice.rate).toBe(0.9);
  });

  it('T13.3b 字級 slider → 改設定 + 存檔 + 套用 CSS 變數', async () => {
    await enterTeacher();
    app().querySelector('#tab-settings').click();

    const slider = doc().getElementById('set-font');
    slider.value = '1.4';
    slider.dispatchEvent(new ctx.win.Event('input'));

    expect(ctx.api.Store.settings.fontScale).toBe(1.4);
    expect(JSON.parse(ctx.win.localStorage.getItem('crSettings')).fontScale).toBe(1.4);
    expect(doc().documentElement.style.getPropertyValue('--font-scale')).toBe('1.4');
  });

  it('T13.3e 字級預設掣（細／標準／大／特大）→ 一撳就跳到', async () => {
    await enterTeacher();
    app().querySelector('#tab-settings').click();

    const btns = doc().getElementById('font-presets').querySelectorAll('button');
    expect(btns.length).toBe(4);

    btns[2].click();                       // 「大」= 1.3
    expect(ctx.api.Store.settings.fontScale).toBe(1.3);
    expect(doc().documentElement.style.getPropertyValue('--font-scale')).toBe('1.3');
    expect(doc().getElementById('set-font').value).toBe('1.3');
    expect(doc().getElementById('set-font-val').textContent).toBe('130%');

    btns[1].click();                       // 「標準」= 1
    expect(ctx.api.Store.settings.fontScale).toBe(1);
    expect(doc().getElementById('set-font-val').textContent).toBe('100%');
  });

  it('T13.3c 詞優先 checkbox → 改設定 + 存檔', async () => {    await enterTeacher();
    app().querySelector('#tab-settings').click();

    const cb = doc().getElementById('set-word-priority');
    expect(cb.checked).toBe(true);
    cb.checked = false;
    cb.dispatchEvent(new ctx.win.Event('change'));

    expect(ctx.api.Store.settings.wordPriority).toBe(false);
    expect(JSON.parse(ctx.win.localStorage.getItem('crSettings')).wordPriority).toBe(false);
  });

  it('T13.3d 改密碼：兩次唔同 → 拒絕；兩次一樣 → 改到', async () => {
    await enterTeacher();
    app().querySelector('#tab-settings').click();

    // 兩次唔同
    doc().getElementById('btn-change-pass').click();
    await flush();
    doc().querySelector('.modal-input').value = 'aaaaa111';
    doc().querySelector('.modal-ok').click();
    await flush();
    doc().querySelector('.modal-input').value = 'bbbbb222';
    doc().querySelector('.modal-ok').click();
    await flush();

    expect(ctx.api.Auth.check('aaaaa111')).toBe(false);
    expect(ctx.api.Auth.check('230714')).toBe(true);   // 舊密碼仲有效

    // 兩次一樣
    doc().getElementById('btn-change-pass').click();
    await flush();
    doc().querySelector('.modal-input').value = 'cccc3333';
    doc().querySelector('.modal-ok').click();
    await flush();
    doc().querySelector('.modal-input').value = 'cccc3333';
    doc().querySelector('.modal-ok').click();
    await flush();

    expect(ctx.api.Auth.check('cccc3333')).toBe(true);
    expect(ctx.api.Auth.check('230714')).toBe(false);
  });
});

describe('T13.4 · TeacherUI 匯入 / 匯出', () => {
  it('T13.4a 匯出 → textarea 入面係全部文章嘅 JSON', async () => {
    await enterTeacher();
    app().querySelector('#btn-export').click();

    const ta = doc().getElementById('export-json');
    expect(ta).toBeTruthy();
    const parsed = JSON.parse(ta.value);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(4);
  });

  it('T13.4b 匯入壞 JSON → 提示錯誤 + 唔改資料', async () => {
    await enterTeacher();
    const before = articles().length;

    doc().getElementById('import-json').value = '{ not json';
    doc().getElementById('btn-import').click();

    expect(doc().getElementById('toast').textContent).toContain('JSON');
    expect(articles().length).toBe(before);
  });

  it('T13.4c 匯入好 JSON → 文章庫更新', async () => {
    await enterTeacher();
    const json = JSON.stringify([
      { id: 'x1', title: '匯入嘅文章', type: 'prose', text: '我好開心。', words: [], published: true },
    ]);
    doc().getElementById('import-json').value = json;
    doc().getElementById('btn-import').click();
    await flush();

    const list = articles();
    expect(list.length).toBe(1);
    expect(list[0].title).toBe('匯入嘅文章');
    expect(list[0].type).toBe('prose');
  });

  it('T13.4d 匯入非陣列 → 拒絕 + 唔改資料', async () => {
    await enterTeacher();
    const before = articles().length;

    doc().getElementById('import-json').value = '{"title":"唔係陣列"}';
    doc().getElementById('btn-import').click();

    expect(articles().length).toBe(before);
    expect(doc().getElementById('toast').textContent).toContain('文章陣列');
  });
});
