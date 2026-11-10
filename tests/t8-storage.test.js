// ==================== tests/t8-storage.test.js ====================
// T8 · Storage（localStorage 層）。對應 docs/TEST-PLAN.md §5.8 / §4.3
import { describe, it, expect } from 'vitest';
import { loadApp } from './harness.js';

describe('T8 · Storage', () => {
  it('T8.1 讀到已儲存嘅設定', async () => {
    const { win, close } = await loadApp();
    win.localStorage.setItem('crSettings', JSON.stringify({ rate: 0.6, fontScale: 1.5 }));

    const s = win.CR.Store.load();
    expect(s.rate).toBe(0.6);
    expect(s.fontScale).toBe(1.5);
    close();
  });

  it('T8.2 壞 JSON → 用預設值，唔 crash（唔好靜靜死機）', async () => {
    const { win, close } = await loadApp();
    win.localStorage.setItem('crSettings', '{ this is not json');

    expect(() => win.CR.Store.load()).not.toThrow();
    expect(win.CR.Store.settings.rate).toBe(0.75);
    expect(win.CR.Store.settings.wordPriority).toBe(true);
    close();
  });

  it('T8.3 saveSettings() 寫得入 localStorage', async () => {
    const { win, close } = await loadApp();
    win.CR.Store.settings.rate = 0.8;
    win.CR.Store.saveSettings();

    expect(JSON.parse(win.localStorage.getItem('crSettings')).rate).toBe(0.8);
    close();
  });

  it('T8.4 全部 localStorage key 都用 cr* 前綴（唔會撞 reading-para 嘅 yue*）', async () => {
    const { api, close } = await loadApp();
    const keyConstants = Object.entries(api.Store).filter(([k]) => k.startsWith('KEY_'));

    expect(keyConstants.length).toBeGreaterThanOrEqual(5);
    for (const [k, v] of keyConstants) {
      expect(v, `${k} = ${v} 應該用 cr* 前綴`).toMatch(/^cr[A-Z]/);
    }
    close();
  });
});
