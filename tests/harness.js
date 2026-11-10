// ==================== tests/harness.js ====================
// 單檔 HTML 嘅測試 harness：抽出 index.html 入面嘅真 JS，喺隔離嘅 jsdom 跑。
// 設計依據：docs/TEST-PLAN.md §2.2 / §2.3
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { vi } from 'vitest';
import { installSpeechMock } from './mocks/speech.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..');
export const APP_PATH = resolve(ROOT, 'index.html');

export const readAppHtml = () => readFileSync(APP_PATH, 'utf8');

/** 抽出所有 inline <script>（冇 src 屬性嘅）。有 src 嘅由瀏覽器另外處理。 */
export function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/**
 * 將 vitest fake timer 裝入隔離嘅 jsdom window。
 *
 * ⚠️ vitest 嘅 jsdom env 只 patch 自己個 window；我哋 `loadApp()` 開嘅係**另一個**
 *    隔離 window，所以 app 入面嘅 setTimeout 唔受控 → 停頓時序（逗號 220ms／句號 700ms）
 *    根本測唔到。呢度手動裝過去。
 */
export function installFakeTimers(win) {
  vi.useFakeTimers();
  win.setTimeout = globalThis.setTimeout;
  win.clearTimeout = globalThis.clearTimeout;
  win.setInterval = globalThis.setInterval;
  win.clearInterval = globalThis.clearInterval;
  return win;
}

/**
 * 以「真實瀏覽器模式」載入 app：jsdom 自己執行 inline script（runScripts: 'dangerously'），
 * 完全唔靠人手叫 App.init()。
 *
 * 用嚟捉「App.init() 從來冇被叫過」呢類 bug ——
 * 測試用嘅 harness 會顯式叫 init()，所以一般測試捉唔到。
 * speech mock 喺 beforeParse 裝（解析之前），保證 init() 見到 mock。
 */
export function loadAppInBrowser(opts = {}) {
  const html = opts.html ?? readAppHtml();
  const dom = new JSDOM(html, {
    url: 'https://local.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(win) {
      installSpeechMock(win, opts.speech ?? {});
    },
  });
  return { dom, win: dom.window, html };
}
/**
 * 載入 app。
 *
 * ⚠️ app 會自己喺 DOMContentLoaded 啟動（真實瀏覽器行為）。
 *    jsdom 嗰個 DOMContentLoaded 係異步 fire，如果等到佢先 return，
 *    (a) 用 fake timers 嘅測試會 hang；(b) close() 可能喺 app 啟動前就關咗 window
 *    → app 喺已死嘅 window 上 init → document 變 undefined → 神秘 error。
 *    所以呢度由 harness 主動觸發 DOMContentLoaded，令生命週期可控。
 *
 * @param {object} opts
 *   - opts.speech: pass to installSpeechMock；傳 null = 完全唔裝 mock（模擬唔支援語音）
 * @returns {Promise<{dom,win,api,html,speech,initPromise,close}>}
 */
export async function loadApp(opts = {}) {
  const html = opts.html ?? readAppHtml();
  const dom = new JSDOM(html, {
    url: 'https://local.test/',
    pretendToBeVisual: true,
    // outside-only：我哋自己控制幾時 eval（要喺 eval 之前裝 speech mock）
    runScripts: 'outside-only',
  });
  const win = dom.window;
  let speech = null;
  if (opts.speech === null) {
    // 模擬「完全唔支援語音」——順手確保 jsdom 唔會提供半吊子 stub
    try { delete win.speechSynthesis; } catch { /* ignore */ }
  } else {
    speech = installSpeechMock(win, opts.speech ?? {});
  }

  // v8 coverage 對 eval 出嚟嘅 code 冇 file mapping → 用 sourceURL pragma 掛返去 index.html，
  // 否則 coverage 會係 0%（見 docs/TEST-PLAN.md §7.2）
  const sourceURL = `//# sourceURL=${pathToFileURL(APP_PATH).href}`;
  for (const s of extractInlineScripts(html)) win.eval(`${s}\n${sourceURL}`);

  const api = win.CR;
  if (!api) {
    throw new Error(
      'app 必須喺尾行設 window.CR = { App, Voice, Tokenizer, Reader, Teacher, Store }（TEST-PLAN §2.3 C1）'
    );
  }

  const initPromise = api.App.init();
  // 避免測試冇 await initPromise 時，rejection 變成 unhandled rejection 令成個 run 紅
  initPromise.catch(() => {});

  // 由 harness 觸發 DOMContentLoaded → app 喺我哋掌控下啟動（見上面註解）
  if (win.document.readyState === 'loading') {
    win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  }

  return {
    dom, win, api, html, speech, initPromise,
    close: () => { try { dom.window.close(); } catch { /* ignore */ } },
  };
}
