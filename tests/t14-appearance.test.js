// ==================== tests/t14-appearance.test.js ====================
// T14 · Appearance toolbox（字色／背景／高亮／字級）
import { describe, it, expect } from 'vitest';
import { loadApp } from './harness.js';

describe('T14 · Appearance', () => {
  it('T14.1 apply() 寫入 CSS vars', async () => {
    const { win, api, close } = await loadApp();
    api.Store.settings.inkColor = '#1e3a8a';
    api.Store.settings.bgColor = '#ecfdf5';
    api.Store.settings.highlightBg = '#bbf7d0';
    api.Store.settings.highlightBorder = '#16a34a';
    api.Appearance.apply();
    const root = win.document.documentElement;
    expect(root.style.getPropertyValue('--ink')).toBe('#1e3a8a');
    expect(root.style.getPropertyValue('--bg')).toBe('#ecfdf5');
    expect(root.style.getPropertyValue('--hl-bg')).toBe('#bbf7d0');
    expect(root.style.getPropertyValue('--hl-border')).toBe('#16a34a');
    close();
  });

  it('T14.2 setInk / setBg 持久化 + 拒非 hex', async () => {
    const { win, api, close } = await loadApp();
    expect(api.Appearance.setInk('not-a-color')).toBe(false);
    expect(api.Appearance.setInk('#4c1d95')).toBe(true);
    expect(api.Store.settings.inkColor).toBe('#4c1d95');
    expect(JSON.parse(win.localStorage.getItem('crSettings')).inkColor).toBe('#4c1d95');
    expect(api.Appearance.setBg('#fff7ed')).toBe(true);
    expect(api.Store.settings.bgColor).toBe('#fff7ed');
    close();
  });

  it('T14.3 setHighlight 同時寫 word highlight', async () => {
    const { api, close } = await loadApp();
    const ok = api.Appearance.setHighlight({
      bg: '#bfdbfe', border: '#2563eb', wordBg: '#c7d2fe', wordBorder: '#4f46e5',
    });
    expect(ok).toBe(true);
    expect(api.Store.settings.highlightBg).toBe('#bfdbfe');
    expect(api.Store.settings.wordHighlightBg).toBe('#c7d2fe');
    expect(api.Store.settings.wordHighlightBorder).toBe('#4f46e5');
    close();
  });

  it('T14.4 reset 還原外觀但保留 rate / wordPriority', async () => {
    const { api, close } = await loadApp();
    api.Store.settings.rate = 0.55;
    api.Store.settings.wordPriority = false;
    api.Store.settings.inkColor = '#14532d';
    api.Store.settings.bgColor = '#fdf2f8';
    api.Appearance.reset();
    expect(api.Store.settings.inkColor).toBe('#1f2937');
    expect(api.Store.settings.bgColor).toBe('#f8fafc');
    expect(api.Store.settings.rate).toBe(0.55);
    expect(api.Store.settings.wordPriority).toBe(false);
    close();
  });

  it('T14.5 renderReader 掛 #appear-box / 可展開', async () => {
    const { win, api, close } = await loadApp();
    await api.App.init();
    const list = api.Store.getArticles().filter((a) => a.published !== false);
    expect(list.length).toBeGreaterThan(0);
    api.App.articleId = list[0].id;
    const app = win.document.getElementById('app');
    api.App.renderReader(app);
    expect(win.document.getElementById('appear-box')).toBeTruthy();
    expect(win.document.getElementById('btn-appear')).toBeTruthy();
    expect(win.document.getElementById('appear-panel').hidden).toBe(true);
    win.document.getElementById('btn-appear').click();
    expect(win.document.getElementById('appear-panel').hidden).toBe(false);
    expect(win.document.querySelectorAll('#appear-ink-row .swatch').length).toBeGreaterThanOrEqual(6);
    expect(win.document.querySelectorAll('#appear-bg-row .swatch').length).toBeGreaterThanOrEqual(6);
    expect(win.document.querySelectorAll('#appear-hl-row .swatch').length).toBeGreaterThanOrEqual(6);
    close();
  });

  it('T14.6 sanitize 壞 hex → 預設', async () => {
    const { win, api, close } = await loadApp();
    win.localStorage.setItem('crSettings', JSON.stringify({
      inkColor: 'red', bgColor: '#gg0000', highlightBg: '#fef08a',
    }));
    api.Store.load();
    expect(api.Store.settings.inkColor).toBe('#1f2937');
    expect(api.Store.settings.bgColor).toBe('#f8fafc');
    expect(api.Store.settings.highlightBg).toBe('#fef08a');
    close();
  });
});
