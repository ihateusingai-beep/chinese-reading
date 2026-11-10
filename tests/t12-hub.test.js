// ==================== tests/t12-hub.test.js ====================
// T12 · Hub（學生端首頁）+ App 路由（hub / read）+ 閱讀頁工具列
// 對應 docs/DESIGN.md §3.2 / §5.1
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadApp } from './harness.js';

let ctx;

beforeEach(async () => {
  ctx = await loadApp();
  await ctx.initPromise;          // 等 App.init() 跑完（hub 渲染好）
});
afterEach(() => {
  ctx.close();
});

const app = () => ctx.win.document.getElementById('app');
const doc = () => ctx.win.document;
const firstArticle = () => ctx.api.Store.getArticles()[0];

describe('T12 · Hub（學生端首頁）', () => {
  it('T12.1 第一次開 app → 自動植入預設文章（全部 published）', () => {
    const articles = ctx.api.Store.getArticles();
    expect(articles.length).toBe(ctx.api.Store.SEED_ARTICLES.length);
    expect(articles.every(a => a.published === true)).toBe(true);
    expect(articles.map(a => a.title)).toContain('去茶餐廳');
  });

  it('T12.2 預設文章嘅詞 offset 全部有效（唔會靜靜失效成單字）', () => {
    for (const a of ctx.api.Store.getArticles()) {
      const checks = ctx.api.Tokenizer.validate(a.text, a.words);
      const bad = checks.filter(c => !c.valid).map(c => `${c.word.text}(${c.reason})`);
      expect(bad, `文章「${a.title}」有失效詞`).toEqual([]);
    }
  });

  it('T12.3 只植入一次（reload 唔會愈搞愈多）', () => {
    const before = ctx.api.Store.getArticles().length;
    ctx.api.Store.seedDefaults();
    expect(ctx.api.Store.getArticles().length).toBe(before);
  });

  it('T12.4 老師清空咗文章庫 → 唔會再自動生返（尊重老師決定）', () => {
    ctx.api.Store.saveArticles([]);
    ctx.api.Store.seedDefaults();
    expect(ctx.api.Store.getArticles()).toEqual([]);
  });

  it('T12.4b 舊版本裝置 → 只補上新增嗰批預設文章（唔會動老師自己嘅文章）', () => {
    // 模擬「已經用緊舊版本」嘅裝置：內容版本 = 1，而且已經有老師自己嘅文章
    ctx.win.localStorage.setItem('crSchemaVersion', '1');
    const mine = { id: 'a_mine', title: '我自己嘅文章', type: 'life', text: '我嘅文章。', words: [], published: true };
    ctx.api.Store.saveArticles([mine]);

    const changed = ctx.api.Store.seedDefaults();
    expect(changed, '應該補上新課文').toBe(true);

    const list = ctx.api.Store.getArticles();
    // 老師自己嘅文章仲喺度，冇被覆蓋
    expect(list.find(a => a.id === 'a_mine')).toBeTruthy();
    // 新課文補上咗
    expect(list.find(a => a.id === 'a_seed_5'), '新課文《到餐廳去》應該補上').toBeTruthy();
    // ⚠️ 舊批次嘅預設文章唔會復活（老師如果自己刪咗，唔會無故返嚟）
    expect(list.find(a => a.id === 'a_seed_1')).toBeFalsy();
  });

  it('T12.5 Hub 列出所有已發佈文章（大卡片）', () => {
    const cards = app().querySelectorAll('.article-card');
    expect(cards.length).toBe(ctx.api.Store.SEED_ARTICLES.length);
    expect(cards[0].textContent).toContain('去茶餐廳');
    // 每張卡都要有大掣（觸控區 ≥70px 喺 Tier 2 驗）
    expect(cards[0].tagName).toBe('BUTTON');
  });

  it('T12.6 隱藏咗嘅文章 → 學生見唔到', () => {
    const list = ctx.api.Store.getArticles();
    const target = list[0];
    target.published = false;
    ctx.api.Store.saveArticles(list);

    ctx.api.App.go('hub');
    const cards = app().querySelectorAll('.article-card');
    expect(cards.length).toBe(ctx.api.Store.SEED_ARTICLES.length - 1);
    expect(app().textContent).not.toContain(target.title);
  });

  it('T12.7 冇文章 → 顯示空狀態提示（唔係白屏）', () => {
    ctx.api.Store.saveArticles([]);
    ctx.api.App.go('hub');
    expect(app().querySelector('.empty')).toBeTruthy();
    expect(app().textContent).toContain('未有文章');
  });

  it('T12.8 Hub 有「老師模式」入口', () => {
    expect(app().querySelector('#btn-teacher')).toBeTruthy();
  });
});

describe('T12 · App 路由（閱讀頁）', () => {
  it('T12.9 撳卡片 → 入閱讀頁 + 渲染到字', () => {
    app().querySelector('.article-card').click();

    expect(ctx.api.App.view).toBe('read');
    expect(app().querySelectorAll('#reading-area .tok').length).toBeGreaterThan(0);
    expect(app().textContent).toContain(firstArticle().title);
  });

  it('T12.10 閱讀頁有：返回 / 讀全篇 / 停 / 字級 ±', () => {
    ctx.api.App.openArticle(firstArticle().id);
    for (const id of ['#btn-back', '#btn-read-all', '#btn-stop', '#btn-font-minus', '#btn-font-plus']) {
      expect(app().querySelector(id), `缺少 ${id}`).toBeTruthy();
    }
  });

  it('T12.11 讀音小卡喺閱讀區下面（唔好遮住字）', () => {
    ctx.api.App.openArticle(firstArticle().id);
    const area = app().querySelector('#reading-area');
    const card = app().querySelector('#read-card');
    expect(card).toBeTruthy();
    expect(area.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('T12.12 讀一篇 → 進度 +1；讀第二篇唔會影響第一篇', () => {
    const a = firstArticle();
    const b = ctx.api.Store.getArticles()[1];
    ctx.api.App.openArticle(a.id);
    expect(ctx.api.Store.getProgress()[a.id].reads).toBe(1);

    ctx.api.App.openArticle(b.id);
    const p = ctx.api.Store.getProgress();
    expect(p[a.id].reads).toBe(1);
    expect(p[b.id].reads).toBe(1);
  });

  it('T12.13 返回 → 返去 hub', () => {
    ctx.api.App.openArticle(firstArticle().id);
    app().querySelector('#btn-back').click();

    expect(ctx.api.App.view).toBe('hub');
    expect(app().querySelector('#hub')).toBeTruthy();
  });

  it('T12.14 讀唔到嘅文章 → 提示，唔 crash', () => {
    expect(() => ctx.api.App.openArticle('a_does_not_exist')).not.toThrow();
    expect(ctx.api.App.view).toBe('hub');
  });

  it('T12.15 字級 + / − → 儲存 + 套用落 CSS 變數（5% 細步）', () => {
    ctx.api.App.openArticle(firstArticle().id);
    app().querySelector('#btn-font-plus').click();

    expect(ctx.api.Store.settings.fontScale).toBe(1.05);
    expect(doc().documentElement.style.getPropertyValue('--font-scale')).toBe('1.05');

    app().querySelector('#btn-font-minus').click();
    expect(ctx.api.Store.settings.fontScale).toBe(1);
  });

  it('T12.15b 閱讀頁顯示目前字級百分比', () => {
    ctx.api.App.openArticle(firstArticle().id);
    expect(app().querySelector('#font-scale-label').textContent).toBe('100%');

    app().querySelector('#btn-font-plus').click();
    expect(app().querySelector('#font-scale-label').textContent).toBe('105%');
  });

  it('T12.16 字級有上下限（唔會變到 0 或者爆錶）', () => {
    for (let i = 0; i < 40; i++) ctx.api.App.changeFontScale(0.1);
    expect(ctx.api.Store.settings.fontScale).toBeLessThanOrEqual(2);

    for (let i = 0; i < 60; i++) ctx.api.App.changeFontScale(-0.1);
    expect(ctx.api.Store.settings.fontScale).toBeGreaterThanOrEqual(0.7);
  });

  it('T12.17 換頁時會停低串行朗讀（唔會喺背後繼續讀）', () => {
    ctx.api.App.openArticle(firstArticle().id);
    const tokens = ctx.api.Tokenizer.tokenize(firstArticle().text, firstArticle().words).tokens;
    ctx.api.Sequence.play(tokens, {});
    expect(ctx.api.Sequence.isPlaying()).toBe(true);

    ctx.api.App.go('hub');
    expect(ctx.api.Sequence.isPlaying()).toBe(false);
  });
});

describe('T12 · 老師模式 gate（由學生頁入）', () => {
  it('T12.18 密碼錯 → 留喺 hub，老師模式唔開', async () => {
    const p = ctx.api.App.enterTeacher();
    doc().querySelector('.modal-input').value = 'wrong';
    doc().querySelector('.modal-ok').click();
    await p;

    expect(ctx.api.App.view).toBe('hub');
    expect(ctx.api.Auth.isTeacher()).toBe(false);
  });

  it('T12.19 取消 → 留喺 hub（唔會提示「密碼唔啱」）', async () => {
    const p = ctx.api.App.enterTeacher();
    doc().querySelector('.modal-cancel').click();
    await p;

    expect(ctx.api.App.view).toBe('hub');
    expect(ctx.api.Auth.isTeacher()).toBe(false);
  });

  it('T12.20 密碼啱 → 入老師頁', async () => {
    const p = ctx.api.App.enterTeacher();
    doc().querySelector('.modal-input').value = '230714';
    doc().querySelector('.modal-ok').click();
    await p;

    expect(ctx.api.App.view).toBe('teacher');
    expect(ctx.api.Auth.isTeacher()).toBe(true);
    expect(app().querySelector('#teacher')).toBeTruthy();
  });
});
