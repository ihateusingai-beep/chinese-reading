// ==================== tests/t6-ui.test.js ====================
// T6 · UI 基礎（Toast / Modal）+ 無障礙基礎規則
// 對應 docs/TEST-PLAN.md §5.6
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readAppHtml, loadApp, installFakeTimers } from './harness.js';
import { nativeDialogCalls } from './structural.js';

afterEach(() => { vi.useRealTimers(); });

describe('T6 · Toast / Modal / 無障礙基礎', () => {
  it('T6.5 全文冇 alert() / confirm() / prompt()（SEN 原則：一律用 in-app modal / toast）', () => {
    // ⚠️ 用同 S19 共用嘅偵測函數 → 唔會有一邊靜靜走樣
    const bad = nativeDialogCalls(readAppHtml());
    expect(bad, `發現原生彈窗：${bad.join(', ')}`).toEqual([]);
  });

  it('T6.7 Toast 有 role=status + aria-live=polite（screen reader 讀得到）', async () => {
    const { win, close } = await loadApp();
    win.CR.Toast.show('測試提示');

    const el = win.document.getElementById('toast');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-live')).toBe('polite');
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('測試提示');
    close();
  });

  it('T6.7b Toast 會自動消失', async () => {
    const { win, close } = await loadApp();
    installFakeTimers(win);

    win.CR.Toast.show('測試提示', 1000);
    expect(win.document.getElementById('toast').hidden).toBe(false);

    await vi.advanceTimersByTimeAsync(1100);
    expect(win.document.getElementById('toast').hidden).toBe(true);
    close();
  });

  it('T6.7c Modal 撳「好」→ resolve(true)，關閉', async () => {
    const { win, close } = await loadApp();
    const p = win.CR.Modal.askConfirm({ title: '測試', message: '真係要繼續？' });

    const modal = win.document.getElementById('modal');
    expect(modal.hidden).toBe(false);
    expect(modal.getAttribute('role')).toBe('dialog');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.querySelector('.modal-title').textContent).toBe('測試');

    modal.querySelector('.modal-ok').click();
    await expect(p).resolves.toBe(true);
    expect(modal.hidden).toBe(true);
    close();
  });

  it('T6.7d Modal 撳「取消」→ resolve(false)', async () => {
    const { win, close } = await loadApp();
    const p = win.CR.Modal.askConfirm({ title: '測試', message: '唔好做' });

    const modal = win.document.getElementById('modal');
    modal.querySelector('.modal-cancel').click();
    await expect(p).resolves.toBe(false);
    expect(modal.hidden).toBe(true);
    close();
  });

  it('T6.6 閱讀區字級 ≥ 48px', () => {
    const css = readAppHtml();
    const m = css.match(/\.reading\{[^}]*font-size:\s*calc\((\d+)px/);
    expect(m, '.reading 必須用 calc(Npx * var(--font-scale))').toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(48);
  });

  it('T6.9 放大唔靠顏色單獨傳意（另有 scale + 動畫 + 描邊）', () => {
    const css = readAppHtml();
    // .g.on 有 transform（放大）
    expect(css).toMatch(/\.g\.on\{[^}]*transform:\s*scale\(/);
    // .tok.on 有底色以外嘅視覺線索
    const onRule = (css.match(/\.tok\.on\{([^}]*)\}/) || [])[1] || '';
    expect(onRule).toMatch(/outline/);
  });
});
