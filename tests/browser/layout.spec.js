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
  await page.locator('.modal-input').fill('230714');
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

  test('A5 課文《到餐廳去》→ 撳「三」讀成「三文治」（真實 offset 冇錯位）', async ({ page }) => {
    await openHub(page);
    await page.locator('#hub .article-card', { hasText: '到餐廳去' }).click();
    await page.waitForSelector('#reading-area .tok');

    // 「三文治」喺 code-point index 21-23 → 第 22 個字
    await page.locator('#reading-area .g').nth(21).click();
    await page.waitForTimeout(150);

    const card = await page.textContent('#read-card');
    expect(card).toContain('三文治');

    // 而且 4 字嘅「爸爸媽媽」都對（index 0-3）
    await page.locator('#reading-area .g').nth(1).click();
    await page.waitForTimeout(150);
    expect(await page.textContent('#read-card')).toContain('爸爸媽媽');
  });

  test('A6 多字詞 token：每個字同一行、冇溢出蓋住隔籬字（真 bug 回歸）', async ({ page }) => {
    // ⚠️ 回歸真 bug（2026-11-10）：`.tok` 固定 width:1.15em 套落多字詞 token
    //    → 詞嘅 3–4 個字喺 1.15em 闊嘅框入面「疊行」，文字溢出、互相覆蓋，
    //    學生撳唔到被蓋住嘅字（A5 之前就係咁 timeout）。
    //    jsdom 冇 layout engine → 呢類 bug 只有 Tier 2 捉得到。
    await openHub(page);
    await page.locator('#hub .article-card', { hasText: '到餐廳去' }).click();
    await page.waitForSelector('#reading-area .tok');

    const report = await page.$$eval('#reading-area .tok', toks =>
      toks.map(tok => {
        const gs = Array.from(tok.querySelectorAll('.g')).map(g => g.getBoundingClientRect());
        const tops = gs.map(r => Math.round(r.top));
        const tr = tok.getBoundingClientRect();
        return {
          type: tok.dataset.type,
          n: gs.length,
          clientH: Math.round(tok.clientHeight),
          scrollH: Math.round(tok.scrollHeight),
          sameLine: tops.length > 0 && tops.every(t => Math.abs(t - tops[0]) <= 2),
          charsInside: gs.every(r => r.left >= tr.left - 1 && r.right <= tr.right + 1),
        };
      })
    );

    const words = report.filter(r => r.type === 'w');
    expect(words.length, '課文應該有多字詞 token').toBeGreaterThan(0);
    expect(words.some(w => w.n >= 3), '應該有 3 字或以上嘅詞（先捉到疊行嘅情況）').toBe(true);

    for (const w of words) {
      expect(w.sameLine, `多字詞 token 入面嘅字疊咗行（n=${w.n}）`).toBe(true);
      expect(w.charsInside, `多字詞 token 嘅字溢出咗自己個框（n=${w.n}）`).toBe(true);
      expect(w.scrollH, `多字詞 token 垂直溢出咗字格高度（n=${w.n}）`).toBeLessThanOrEqual(w.clientH + 2);
    }

    // 相鄰 token 喺同一行唔可以互相覆蓋（網格要乾淨）
    const rects = await page.$$eval('#reading-area .tok', els =>
      els.map(e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top }; })
    );
    for (let i = 0; i + 1 < rects.length; i++) {
      const a = rects[i];
      const b = rects[i + 1];
      if (Math.abs(a.t - b.t) <= 2) {
        expect(a.r, `相鄰 token 重疊咗（#${i} → #${i + 1}）`).toBeLessThanOrEqual(b.l + 1);
      }
    }
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

  test('D1d 表單控制項觸控區：輸入框／下拉／textarea 高度 ≥ 70px', async ({ page }) => {
    await openTeacher(page);
    await page.locator('#btn-new-article').click();
    await page.waitForSelector('#edit-text');

    const sizes = await page.$$eval('#teacher-edit input, #teacher-edit select, #teacher-edit textarea', els =>
      els.map(e => {
        const r = e.getBoundingClientRect();
        return { id: e.id, tag: e.tagName, h: Math.round(r.height) };
      })
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) {
      expect(s.h, `${s.tag}#${s.id} 高度要 ≥70px`).toBeGreaterThanOrEqual(70);
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
