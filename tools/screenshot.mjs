// ==================== tools/screenshot.mjs ====================
// 影低關鍵畫面（學生端 + 老師端），方便：
//   - 老師一眼睇到個 app 係咩樣
//   - 實機驗證時對照（邊個掣喺邊度）
//   - 之後改版時 compare
//
// 用法：node tools/screenshot.mjs [輸出目錄]   （預設 docs/screenshots）
//
// ⚠️ 老師密碼寫喺呢度（230714）—— 只係本機 dev 工具，唔會上網。
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.argv[2] || resolve(ROOT, 'docs/screenshots'));
const APP_URL = pathToFileURL(resolve(ROOT, 'index.html')).href;
const PASS = '230714';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });   // iPad 直度

const shot = async (name) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(OUT, name) });
  console.log('  ✓', name);
};

// 1. 學生首頁
await page.goto(APP_URL);
await page.waitForSelector('#hub .article-card');
await shot('01-hub.png');

// 2. 閱讀頁（撳咗「吃」→ 讀音小卡）
await page.locator('#hub .article-card').first().click();
await page.waitForSelector('#reading-area .tok');
await page.locator('#reading-area .g').nth(13).click();
await shot('02-reading.png');

// 2b. 課文《到餐廳去》（撳「三」→ 讀「三文治」）
await page.goto(APP_URL);
await page.waitForSelector('#hub .article-card');
await page.locator('#hub .article-card', { hasText: '到餐廳去' }).click();
await page.waitForSelector('#reading-area .tok');
await page.locator('#reading-area .g').nth(21).click();
await shot('02b-reading-lesson.png');

// 3. 老師模式 → 文章庫
await page.goto(APP_URL);
await page.waitForSelector('#hub .article-card');
await page.locator('#btn-teacher').click();
await page.waitForSelector('.modal-input');
await page.locator('.modal-input').fill(PASS);
await page.locator('.modal-ok').click();
await page.waitForSelector('#teacher');
await shot('03-teacher-articles.png');

// 4. 老師設定（字級 slider + 預設掣）
await page.locator('#tab-settings').click();
await page.waitForSelector('#font-presets');
await shot('04-teacher-settings.png');

// 5. 新文章（即場貼文章：貼上掣 + 字數計數 + 儲存掣）
await page.locator('#tab-articles').click();
await page.locator('#btn-new-article').click();
await page.waitForSelector('#edit-text');
await page.locator('#edit-title').fill('即場貼的文章');
await page.locator('#edit-text').fill('我今天和爸爸媽媽去了茶餐廳吃飯。');
await shot('05-teacher-new-article.png');

// 6. 標詞畫面
await page.locator('#btn-start-marking').click();
await page.waitForSelector('#teacher-editor .t-char');
await shot('06-teacher-marking.png');

await browser.close();
console.log('\n完成，圖片喺：', OUT);
