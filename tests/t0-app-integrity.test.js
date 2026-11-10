// ==================== tests/t0-app-integrity.test.js ====================
// Tier 1 通用前置：單檔 HTML 專屬嘅自我保護。
// 如果呢啲紅咗，代表 app 本身壞咗（唔係某個功能壞）。
// 見 docs/TEST-PLAN.md §5.0
import { describe, it, expect, vi } from 'vitest';
import { readAppHtml, extractInlineScripts, loadApp, loadAppInBrowser } from './harness.js';

const html = readAppHtml();
const scripts = extractInlineScripts(html);

describe('P · app 完整性前置', () => {
  it('P1 抽出嘅 script 語法通過（唔會被中途截斷）', () => {
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      expect(() => new Function(s)).not.toThrow();
    }
  });

  it('P2 script 完整：夠長 + 包含尾行匯出標記 + 六個模組 const 都存在', () => {
    const total = scripts.reduce((n, s) => n + s.length, 0);
    expect(total, 'script 總長度太短，可能抽錯').toBeGreaterThan(3000);

    const all = scripts.join('\n');
    // 尾行匯出標記 —— 冇佢就代表 script 被截斷（`</script>` 陷阱）
    expect(all, 'script 應該包含尾行 window.CR = {...}，冇就代表被截斷').toContain('window.CR = {');
    for (const name of ['App', 'Voice', 'Tokenizer', 'Reader', 'Teacher', 'Store']) {
      expect(all, `script 應該宣告 const ${name}`).toMatch(new RegExp(`const\\s+${name}\\s*=`));
    }
  });

  it('P3 loadApp() 唔會 throw，六個模組形狀齊全', async () => {
    const { api, close } = await loadApp();
    for (const k of ['App', 'Voice', 'Tokenizer', 'Reader', 'Teacher', 'Store']) {
      expect(api[k], `window.CR.${k} 應該存在`).toBeTruthy();
    }
    close();
  });

  it('P4 script 冇被 </script> 提前截斷', () => {
    const openTags = (html.match(/<script\b/gi) || []).length;
    const closeTags = (html.match(/<\/script>/gi) || []).length;
    expect(openTags).toBe(closeTags);
    for (const s of scripts) {
      expect(s).not.toContain('</script>');
    }
  });

  it('P5 冇「多變數 const 宣告」陷阱（strict mode 會 runtime 爆）', () => {
    const bad = html.match(
      /const\s+[A-Za-z_$][\w$]*\s*=\s*[^;\n]*,\s*[A-Za-z_$][\w$]*\s*=/g
    ) || [];
    expect(bad, `發現多變數 const 宣告：${bad.join(' | ')}`).toEqual([]);
  });

  it('P6 真實瀏覽器模式會自動啟動 app（唔靠 harness 手動叫 init）', async () => {
    // 呢個用 jsdom 自己跑 inline script，模擬真實瀏覽器開個檔
    const { dom, win } = loadAppInBrowser();
    await new Promise(resolve => win.addEventListener('load', resolve, { once: true }));

    await vi.waitFor(() => {
      expect(win.document.getElementById('app').innerHTML).not.toContain('載入中');
    }, { timeout: 3000 });

    expect(win.CR, 'app 應該自己匯出 window.CR').toBeTruthy();
    // 有 zh-HK voice → 唔應該出警示橫幅
    expect(win.document.getElementById('voice-banner').hidden).toBe(true);
    dom.window.close();
  });
});
