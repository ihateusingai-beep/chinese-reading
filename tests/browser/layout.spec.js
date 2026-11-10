// ==================== tests/browser/layout.spec.js ====================
// Tier 2 · 真實瀏覽器版面驗證
//
// ⚠️ 點解要呢一層：jsdom **冇 layout engine**
//    - getBoundingClientRect() 全部回傳 0 → 「撳字會唔會重排」測唔到
//    - axe-core 嘅 contrast 規則喺 jsdom 跑唔到（需要真實繪製）
//    - prefers-reduced-motion 喺 jsdom 冇 media query 支援
//
// 跑法：npm run test:browser   （需要 npx playwright install chromium）
// ⚠️ 呢層**唔喺** npm test 入面 —— 唔會被當成「測試通過」，係真係另一層。
// 對應 docs/TEST-PLAN.md §5.3 T3.3（A2）、§5.6 D1 / D2 / D4
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_URL = pathToFileURL(resolve(process.cwd(), 'index.html')).href;
const AXE_PATH = resolve(process.cwd(), 'node_modules/axe-core/axe.min.js');

/** 等 app 啟動完成（hub 出現） */
async function openHub(page) {
  await page.goto(APP_URL);
  await page.waitForSelector('#hub .article-card', { timeout: 15000 });
}

/** 由 hub 撳入第一篇文章 → 閱讀頁 */
async function openReader(page) {
  await openHub(page);
  await page.locator('#hub .article-card').first().click();
  await page.waitForSelector('#reading-area .tok', { timeout: 15000 });
}

/** 進入老師模式（入面用真密碼 —— 呢個係 dogfooding：真係要打先入到） */
async function openTeacher(page) {
  await openHub(page);
  await page.locator('#btn-teacher').click();
  await page.waitForSelector('.modal-input', { timeout: 15000 });
  await page.locator('.modal-input').fill('Hcwmc');
  await page.locator('.modal-ok').click();
  await page.waitForSelector('#teacher', { timeout: 15000 });
}

/** 跑 axe，拎 serious / critical 違規 */
async function axeViolations(page) {
  await page.addScriptTag({ path: AXE_PATH });
  return await page.evaluate(async () => {
    const res = await window.axe.run(document, { resultTypes: ['violations'] });
    return res.violations
      .filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map(n => ({
          target: n.target,
          html: n.html.slice(0, 120),
          summary: (n.any[0] && n.any[0].message) || (n.all[0] && n.all[0].message) || '',
        })),
      }));
  });
}

test.describe('Tier 2 · 真實瀏覽器版面驗證', () => {
  test('A2 撳字唔會令成句重排（相鄰字位置完全不變）', async ({ page }) => {
    await openReader(page);

    const before = await page.$$eval('#reading-area .tok', els =>
      els.map(e => Math.round(e.getBoundingClientRect().left * 100) / 100)
    );
    expect(before.length).toBeGreaterThan(10);

    // 撳第 4 個字（「和」）
    await page.locator('#reading-area .g').nth(3).click();
    await page.waitForTimeout(150);

    const after = await page.$$eval('#reading-area .tok', els =>
      els.map(e => Math.round(e.getBoundingClientRect().left * 100) / 100)
    );
    expect(after, '撳字之後成句嘅字位唔應該郁').toEqual(before);

    // 而且目標字真係變大咗（transform scale）
    const transform = await page.$eval('#reading-area .g.on', el => getComputedStyle(el).transform);
    expect(transform, '目標字應該用 transform 放大').not.toBe('none');
  });

  test('A2b 撳「吃」→ 讀出嘅係「吃飯」而唔係「吃」（詞優先）', async ({ page }) => {
    await openReader(page);
    await page.locator('#reading-area .g').nth(13).click();
    await page.waitForTimeout(150);

    const card = await page.textContent('#read-card');
    expect(card).toContain('吃飯');
  });

  test('A3 完整學生流程：hub 撳卡片 → 入閱讀頁 → 撳字有聲', async ({ page }) => {
    await openHub(page);
    await page.locator('#hub .article-card').first().click();
    await page.waitForSelector('#reading-area .tok');

    await page.evaluate(() => {
      window.__spoken = [];
      const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); return orig(u); };
    });
    await page.locator('#reading-area .g').nth(3).click();
    await page.waitForTimeout(150);

    expect(await page.evaluate(() => window.__spoken)).toContain('和');
  });

  test('D1 字格觸控區：高度 ≥ 70px、闊度 ≥ 44px', async ({ page }) => {
    await openReader(page);

    const sizes = await page.$$eval('#reading-area .tok', els =>
      els.map(e => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height };
      })
    );

    for (const s of sizes) {
      expect(s.h, '字格高度要 ≥70px').toBeGreaterThanOrEqual(70);
      expect(s.w, '字格闊度要 ≥44px').toBeGreaterThanOrEqual(44);
    }
  });

  test('D1b Hub 卡片觸控區：高度 ≥ 70px、闊度 ≥ 44px（學生用大手指）', async ({ page }) => {
    await openHub(page);

    const sizes = await page.$$eval('#hub .article-card', els =>
      els.map(e => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height };
      })
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(s.h, '卡片高度要 ≥70px').toBeGreaterThanOrEqual(70);
      expect(s.w, '卡片闊度要 ≥44px').toBeGreaterThanOrEqual(44);
    }
  });

  test('D1c 所有按鈕觸控區：高度 ≥ 70px（hub / 閱讀頁 / 老師頁）', async ({ page }) => {
    const measure = () => page.$$eval('button', els =>
      els.map(e => {
        const r = e.getBoundingClientRect();
        return { text: (e.textContent || '').trim().slice(0, 20), h: r.height };
      })
    );

    await openReader(page);
    let sizes = await measure();
    for (const s of sizes) {
      // ⚠️ 只量「睇得見」嘅掣：display:none 嘅（modal 入面未開嘅）高度係 0，
      //    但佢哋根本撳唔到，唔算觸控目標 → 唔應該用嚟卡驗收線。
      if (s.h <= 0) continue;
      expect(s.h, `按鈕「${s.text}」高度要 ≥70px`).toBeGreaterThanOrEqual(70);
    }

    await openTeacher(page);
    sizes = await measure();
    for (const s of sizes) {
      if (s.h <= 0) continue;
      expect(s.h, `按鈕「${s.text}」高度要 ≥70px`).toBeGreaterThanOrEqual(70);
    }
  });

  test('D2 axe-core：閱讀頁 serious / critical 違規 = 0（含真實對比度）', async ({ page }) => {
    await openReader(page);
    const violations = await axeViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('D2b axe-core：hub 頁 serious / critical 違規 = 0', async ({ page }) => {
    await openHub(page);
    const violations = await axeViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('D2c axe-core：老師頁 serious / critical 違規 = 0', async ({ page }) => {
    await openTeacher(page);
    const violations = await axeViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('D2d axe-core：密碼輸入 modal serious / critical 違規 = 0', async ({ page }) => {
    await openHub(page);
    await page.locator('#btn-teacher').click();
    await page.waitForSelector('.modal-input');

    const violations = await axeViolations(page);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test('D4 prefers-reduced-motion：關閉動畫，但保留放大（放大係資訊唔係裝飾）', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openReader(page);

    await page.locator('#reading-area .g').nth(3).click();
    await page.waitForTimeout(150);

    const duration = await page.$eval('#reading-area .g.on', el => getComputedStyle(el).transitionDuration);
    expect(duration).toBe('0s');

    const transform = await page.$eval('#reading-area .g.on', el => getComputedStyle(el).transform);
    expect(transform, '減少動態唔應該移除放大').not.toBe('none');
  });

  test('A1 撳字會發音（Web Speech API 有被叫）', async ({ page }) => {
    await openReader(page);
    // 攔截 speechSynthesis.speak
    await page.evaluate(() => {
      window.__spoken = [];
      const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); return orig(u); };
    });

    await page.locator('#reading-area .g').nth(3).click();
    await page.waitForTimeout(150);

    const spoken = await page.evaluate(() => window.__spoken);
    expect(spoken).toContain('和');
  });

  test('A4 老師模式一定要密碼先入到（學生撳「老師模式」都冇用）', async ({ page }) => {
    await openHub(page);
    await page.locator('#btn-teacher').click();
    await page.waitForSelector('.modal-input');

    await page.locator('.modal-input').fill('wrong-pass');
    await page.locator('.modal-ok').click();
    await page.waitForTimeout(200);

    expect(await page.$('#teacher')).toBeNull();       // 仲喺 hub
    expect(await page.$('#hub')).not.toBeNull();
  });
});
