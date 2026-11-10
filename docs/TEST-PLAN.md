# 測試計劃 — chinese-reading (互動中文閱讀 · 點讀)

> **Project**: `chinese-reading`
> **對應設計**: `DESIGN.md` v0.1 §10 驗收標準
> **Status**: 計劃已定稿，**實作前寫**（tests 係 spec，唔係事後補嘅記錄）
> **Last updated**: 2026-11-10

---

## 0. 目的

呢份文件嘅唯一目的：**令 M1 MVP 嘅每一個行為都有機會被證明係啱嘅**。

三個要達到嘅目標：

1. **唔可以有「冇測試覆蓋嘅關鍵行為」** —— 每一條 `DESIGN.md` §10 驗收標準都要對應至少一個測試 case。
2. **守門唔可以係假嘅** —— 結構斷言必須經過 mutant 還原驗證（改壞 source → 守門必須變紅）。
3. **唔可以只靠靜態斷言** —— 至少要有一層「抽出真 source 出嚟真係跑一次」嘅行為測試（見 §5.0）。

> ⚠️ 本計劃寫喺實作**之前**。如果實作走樣，**要改呢份文件**，唔可以靜靜改測試去遷就 code。

---

## 1. 測試策略：分三層

| Tier | 工具 | 跑嘅嘢 | 覆蓋範圍 | 必須？ |
|---|---|---|---|---|
| **T1 Node/jsdom** | vitest + jsdom | 抽出 `index.html` 入面嘅真 JS，喺 jsdom 跑；mock `speechSynthesis` | 邏輯、DOM 互動、語音序列、儲存 | ✅ 必須，每次 commit 跑 |
| **T2 真實瀏覽器** | Playwright (Chromium) | 真實 layout / 真實 CSS / 真實 axe | 重排、觸控區、對比度、reduced-motion | ✅ 已裝已跑（`npm run test:browser`） |
| **T3 學校實機** | 人手 | 真 iPad + Windows 平板 | zh-HK voice、延遲、觸控手感、離線 | ✅ M1 尾必做（驗證 R1） |

### 1.1 為咩要有 T2（而唔係全部靠 T1）

jsdom **冇 layout engine**：
- `getBoundingClientRect()` 全部回傳 0 → 「撳字會唔會重排」測唔到
- axe-core 嘅 **contrast 規則喺 jsdom 跑唔到**（需要真實繪製）
- `prefers-reduced-motion` 喺 jsdom 冇 media query 支援

所以 T1 只能做「結構同邏輯」，**版面類驗收（A2 / D1 / D2 / D4）一定要 T2 或者人手**。
呢個限制要寫清楚，唔可以因為 jsdom 測唔到就當「冇問題」。

---

## 2. 測試環境

### 2.1 依賴（全部 dev-only，唔影響部署）

```jsonc
{
  "devDependencies": {
    "vitest": "^2",          // test runner + jsdom env + coverage
    "jsdom": "^25",          // DOM 環境
    "axe-core": "^4",        // a11y 靜態分析
    "@vitest/coverage-v8": "^2",
    "@playwright/test": "^1" // Tier 2（可選）
  }
}
```

> App 本身仍然係 **零依賴、零 build step**（`index.html` 單檔直接開）。上面全部只係測試用。

### 2.2 單檔 HTML 點樣跑測試（核心 harness 設計）

`index.html` 係單檔（inline CSS + JS），所以測試要用「**抽出真 source 出嚟跑**」嘅方式：

```js
// tests/harness.js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

export const APP_PATH = resolve(process.cwd(), 'index.html');
export const readAppHtml = () => readFileSync(APP_PATH, 'utf8');

/** 抽出所有 inline <script>（冇 src 屬性嘅） */
export function extractInlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

export async function loadApp(opts = {}) {
  const html = opts.html ?? readAppHtml();
  const dom = new JSDOM(html, {
    url: 'https://local.test/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',      // ← 唔自動行 inline script，我哋自己控制
  });
  const win = dom.window;
  let speech = null;
  if (opts.speech === null) {
    try { delete win.speechSynthesis; } catch { /* ignore */ }   // 模擬完全唔支援語音
  } else {
    speech = installSpeechMock(win, opts.speech ?? {});
  }

  for (const s of extractInlineScripts(html)) win.eval(s);   // 跑真 source

  const api = win.CR;                 // app 尾行匯出嘅模組表
  if (!api) throw new Error('app 必須設 window.CR = { App, Voice, Tokenizer, Reader, Teacher, Store }');
  const initPromise = opts.init === false ? Promise.resolve(null) : api.App.init();
  initPromise.catch(() => {});        // 避免未 await 嘅 rejection 令成個 run 紅
  return { dom, win, api, html, speech, initPromise, close: () => dom.window.close() };
}
```

**點解 `runScripts: 'outside-only'` + `win.eval`**：
jsdom 預設會自動行 inline script，但我哋要控制「行之前先裝 speech mock」，所以要手動。

**點解用 `window.CR` 而唔係 `win.eval(';({ App, ... })')`**：
app 尾行設 `window.CR = { App, Voice, Tokenizer, Reader, Teacher, Store };`，
harness 直接讀 `win.CR` → **日後加新模組唔使改 harness**（淨係要加去 `window.CR`）。
「頂層 const」呢個要求另外由 §5.0 P2 嘅靜態檢查守住（每個模組都要有 `const X =`）。

### 2.3 實作約束（為咗可測試，唔好搞到測試唔到）

| # | 約束 | 原因 |
|---|---|---|
| C1 | 頂層必須有 `const App / Voice / Tokenizer / Sequence / Reader / Teacher / Store`，並喺檔案尾設 `window.CR = { … }` | harness 靠 `win.CR` 攞內部 API（加新模組唔使改 harness）。**唔好用 IIFE 包住全部** |
| C2 | 啟動流程必須可以由 `App.init()` 明確觸發 | jsdom 入面 `DOMContentLoaded` 已經 fire 咗，唔會再 fire |
| C3 | 所有 `localStorage` key 前綴 `cr` | 唔會撞 `reading-para` 嘅 `yue*` |
| C4 | 唔好喺 module 頂層直接讀 `window.speechSynthesis` | jsdom 冇 → module 一 import 就爆。改成延遲到 `Voice.init()` 先讀 |
| C5 | 唔好喺 module 頂層直接 `window.addEventListener('DOMContentLoaded')` 就開工 | 同 C2 |

> ⚠️ C4 係踩過嘅坑：jsdom 冇 `speechSynthesis`，如果 code 頂層 `const sp = window.speechSynthesis;`
> 然後 `sp.getVoices()` → **module 載入即爆**，所有測試都起唔到。

### 2.4 Speech mock 設計

關鍵：要能夠**手動控制 `onend` 何時 fire**，否則測唔到串行順序。

```js
// tests/mocks/speech.js
export function installSpeechMock(win, {
  voices = [{ name: 'Sinji', lang: 'zh-HK', voiceURI: 'sinji', localService: true }],
  fireVoicesChanged = true,     // voiceschanged 事件會唔會 fire
  autoEnd = false,              // true = speak 之後自動 onend
} = {}) {
  const log = [];
  const pending = [];
  let vcHandler = null;

  class FakeUtterance {
    constructor(text) {
      this.text = text; this.lang = ''; this.voice = null;
      this.rate = 1; this.pitch = 1; this.volume = 1;
    }
  }

  win.SpeechSynthesisUtterance = FakeUtterance;
  win.speechSynthesis = {
    getVoices: () => voices.slice(),
    speak(u) {
      log.push({ t: 'speak', text: u.text, rate: u.rate, lang: u.lang, voice: u.voice?.name });
      pending.push(u);
      if (autoEnd) queueMicrotask(() => u.onend && u.onend({}));
    },
    cancel() {
      log.push({ t: 'cancel' });
      // 模擬 Chrome 真實行為：cancel 會令未完嘅 utterance 觸發 onerror('interrupted')
      while (pending.length) {
        const u = pending.shift();
        if (u.onerror) u.onerror({ error: 'interrupted' });
      }
    },
    pause() {}, resume() {},
    addEventListener(type, fn) { if (type === 'voiceschanged') vcHandler = fn; },
    removeEventListener() {},
  };

  return {
    log, pending,
    /** 手動觸發某個待播 utterance 嘅 onend（推進串行） */
    endNext() { const u = pending.shift(); u.onend && u.onend({}); },
    /** 手動觸發 voiceschanged（測 T1 嘅非同步路徑） */
    fireVoicesChanged() { vcHandler && vcHandler(); },
    /** 攞出所有被讀過嘅字串（順序） */
    spokenTexts() { return log.filter(x => x.t === 'speak').map(x => x.text); },
  };
}
```

> ⚠️ mock 嘅 `cancel()` **刻意**模仿 Chrome：觸發 `onerror('interrupted')`。
> 呢個係 T4.6 / T8 陷阱（DESIGN §5.5.2 T8）嘅測試基礎 —— 如果 mock 太「乾淨」，
> 真實瀏覽器嘅中斷 bug 就會漏網。

### 2.5 時間控制

串行播放涉及时序（標點停頓、token 間隙）。用 `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()`，
唔好用真實 `setTimeout` 等待（會令測試 flaky）。

---

## 3. 測試目錄結構

```
chinese-reading/
├── index.html
├── package.json              # dev-only 依賴 + scripts
├── vitest.config.js
├── docs/
│   ├── DESIGN.md
│   └── TEST-PLAN.md          # ← 本文件
├── tests/
│   ├── harness.js            # loadApp / extractInlineScripts
│   ├── mocks/
│   │   ├── speech.js         # installSpeechMock
│   │   └── storage.js        # localStorage 隔離 / 損壞資料
│   ├── structural.js         # structuralFails(src) + ASSERTION_IDS（共用）
│   ├── mutants.js            # MUTANTS[]（每個標 covers: [...]）
│   ├── t1-tokenizer.test.js
│   ├── t2-voice.test.js
│   ├── t4-sequence.test.js
│   ├── t3-reader.test.js
│   ├── t4-sequence.test.js
│   ├── t5-teacher.test.js
│   ├── t6-a11y.test.js
│   ├── t7-structure.test.js
│   ├── t8-storage.test.js
│   ├── t9-mutants.test.js    # mutant 還原驗證
│   ├── t10-meta.test.js      # mutant 覆蓋率對齊
│   └── browser/
│       └── layout.spec.js    # Tier 2（可選）
├── tools/
│   └── contrast-check.js     # 無 browser 時嘅對比度計算
└── data/
    └── seed-articles.json
```

---

## 4. 測試模組清單

| 模組 | 範圍 | 層級 | 對應 DESIGN §10 |
|---|---|---|---|
| T1 Tokenizer | token 化、詞覆蓋、失效降級、code-point index | T1 | A8 |
| T2 Voice | voice 偵測、fallback、utterance 參數、cancel 語義 | T1 | C1–C5 |
| T3 Reader | 逐字點讀、詞語點讀、放大不重排、讀音卡 | T1(+T2) | A1–A4 |
| T4 Sequence | 串行播放、標點停頓、中斷、鼓勵語、防禦縱深 | T1 | B1–B6 |
| T5 Teacher | 標詞配對、衝突拒絕、拆解、儲存 | T1 | A5–A7 |
| T6 A11y | axe、觸控區、對比度、reduced-motion | T1(+T2) | D1–D5 |
| T7 Structure | 結構斷言（禁 alert、必須 transform scale 等） | T1 | 全域 |
| T8 Storage | schema、損壞資料、匯入匯出 | T1 | — |
| T9 Mutants | mutant 還原驗證 | T1 | §6 |
| T10 Meta | mutant 覆蓋率對齊斷言清單 | T1 | §6.3 |
| T11 Auth | 純 JS SHA-256（對齊 Node crypto）+ 老師密碼 gate + in-app 文字輸入 | T1 | §6.4 |
| T12 Hub | 學生首頁（published 過濾）+ App 路由 + 閱讀頁 + 老師模式 gate | T1 | §5.0 / §5.1 |
| T13 TeacherUI | 文章庫 CRUD、發佈/隱藏、標詞編輯、設定、匯入匯出 | T1 | §6 |

---

## 5. 具體測試 case

### 5.0 Tier 1 通用前置（每個模組都要過）

| ID | Case | 層級 |
|---|---|---|
| P1 | `extractInlineScripts(html)` 抽出嘅 script 全部 `new Function(src)` 語法通過 | T1 |
| P2 | 抽出嘅 script 夠長 + **包含尾行 `window.CR = {`** + 六個模組 `const` 都存在 → 證明冇被截斷 | T1 |
| P3 | `loadApp()` 唔會 throw；`window.CR` 六個模組齊全 | T1 |
| P4 | `index.html` 入面每個 `</script>` 都係真終止標籤（`</script>` 陷阱） | T1 |
| P5 | App 頂層冇多變數 `const` 賦值陷阱（`const a = {}, b = false;` 之後賦 `b`） | T1（靜態掃描 + 靜態結構斷言） |
| P6 | **真實瀏覽器模式**（jsdom 自己行 inline script，完全唔靠 harness 手動叫 init）會自動啟動 app → 捉「`App.init()` 從來冇被叫過」 | T1 |

> ⚠️ **P6 存在嘅理由**：一般測試用嘅 harness 會顯式叫 `App.init()`，
> 所以「app 根本冇啟動」呢類 bug 喺一般測試入面**完全捉唔到**（測試會照綠）。
> P6 用 `loadAppInBrowser()`（jsdom `runScripts: 'dangerously'` + `beforeParse` 裝 mock）
> 模擬真實瀏覽器開檔 → app 必須自己識啟動。
>
> ⚠️ **Harness 生命週期**：jsdom 嘅 `DOMContentLoaded` 係異步 fire，
> 等佢先 return 會令 (a) fake timers 測試 hang、(b) `close()` 可能喺 app 啟動前關咗 window
> → app 喺已死嘅 window 上 init → `document` 變 `undefined` → 神秘 error。
> 所以 harness 喺 eval 之後**主動 dispatch DOMContentLoaded**，令 app 嘅啟動喺我哋掌控下。

> P1–P4 係「單檔 HTML 專屬」嘅自我保護：`</script>` 出現在 JS 字串裡面會令 HTML parser 提前截斷，
> 症狀係 app 半個 function 消失、**唔會報錯、淨係靜靜唔 work**。

### 5.1 T1 Tokenizer

| ID | Case | 對應 |
|---|---|---|
| T1.1 | `我今天和爸爸媽媽去了茶餐廳吃飯。`（無詞）→ 16 個 token，`type` 正確（15 個 `c` + 1 個 `p`） | §4.2 |
| T1.2 | 加 `words=[{start:10,len:3,text:'茶餐廳'}]` → token 變 14 個，其中 1 個 `w`（3 字），**冇重複 token** | §4.2 |
| T1.3 | 詞嘅 `start` 指向標點 → 該詞降級成單字 token，**唔 crash** | §4.1 |
| T1.4 | `text` 改成令 offset 錯位（例如插入一個字）→ 詞失效 → 降級成單字 + 老師端標示失效 | A8 |
| T1.5 | `text` 含 emoji（`我😀今天`）→ 詞 index 仍對得上（code-point 而非 UTF-16） | §4.1 |
| T1.6 | 兩個詞重疊（start 相同）→ 只取第一個，第二個降級 | §4.1 |
| T1.7 | `text` 為空字串 → 返回空 token 陣列，**唔 throw** | — |
| T1.8 | `words` 係 `null` / `undefined` → 正常運作 | — |
| T1.13 | 詞超出文章範圍 → `out-of-range` | §4.1 |
| T1.14 | token 可以還原返原文（round-trip 恆等式） | §4.2 |
| T1.15 | 壞參數（len 0／負數／非整數／start 負數／null）→ `invalid-params` | §4.1 |
| T1.16 | 相鄰但唔重疊嘅兩個詞 → 兩個都有效 | §4.1 |
| T1.17 | `validate()` 直接用 → 每個詞都有 valid + reason，且每個 reason 都有中文說明 | §4.1 |

### 5.2 T2 Voice

| ID | Case | 對應 |
|---|---|---|
| T2.1 | `getVoices()` 首次回傳 `[]` → fire `voiceschanged` 後 → `Voice.state === 'ok'`，揀到 `zh-HK` voice | C1 |
| T2.2 | 永遠唔 fire `voiceschanged` → advance 1500ms → 仍然 resolve（timeout 兜底） | C1 |
| T2.3 | voices 只有 `zh-CN` → `state === 'no-hk'` → **學生端顯示黃色橫幅**（非靜默） | C2 |
| T2.4 | `window.speechSynthesis` 唔存在 → `state === 'unsupported'` → 顯示紅色橫幅 | C3 |
| T2.5 | `speak('茶')` → 攔截到 utterance：`lang === 'zh-HK'`、`voice` 係 zh-HK 嗰個 | C4 |
| T2.6 | `speak()` 預設 `rate === 0.75`；老師設定改 0.6 → 生效 | C5 |
| T2.7 | 連續 `speak()` 兩次 → log 入面 `cancel` 出現喺第二次 `speak` **之前** | §5.5.2 T3 |
| T2.8 | `onerror` fire → **`onend` callback 必須被呼叫**（唔可以停喺第一個字） | §5.5.2 T2 |
| T2.9 | `cancel()` 觸發 `onerror('interrupted')` → **串行唔會繼續推進**（generation counter） | §5.5.2 T8 |
| T2.10 | `speak('')` → 直接呼叫 `onend`，唔會 hang | — |
| T2.11 | 冇 voice 時 `speak()` → 唔會 throw；有 fallback 提示 | C2 |

### 5.3 T3 Reader

| ID | Case | 對應 |
|---|---|---|
| T3.1 | 撳第 3 個字 → 該 token 有 `.on` class，其餘冇 | A1 |
| T3.2 | 撳第 3 個字 → `speak()` 收到嗰個字 | A1 |
| T3.3 | 撳字後**唔准**用 inline `font-size` 放大（會重排）；Tier 2 驗證相鄰 token 嘅 rect.left **完全不變** | A2 |
| T3.4 | 撳詞 token → 兩個 `.g` 同時 `.on` | A3 |
| T3.5 | 撳詞 token → `speak()` 收到**完整詞**（如 `食飯`） | A3 |
| T3.6 | 撳「吃」（屬於詞「吃飯」）→ `speak()` 收到 **`吃飯`**（書面語；zh-HK TTS 讀出嚟係「食飯」），視覺上只有「吃」最深 | §5.5.3 |
| T3.7 | 撳詞中嘅字 → 讀音小卡顯示 `讀音：吃飯` | §5.5.3 |
| T3.8 | 老師設定切「單字優先」→ 撳「吃」→ `speak()` 收到 `吃` | §5.5.3 |
| T3.9 | `.tok` 有固定 `width`（結構斷言），唔係 `auto` | §5.2 |
| T3.10 | 撳字時唔觸發 text selection（`user-select:none` 存在） | §6.2 |
| T3.11 | 撳標點 token → 唔會 `speak()`（標點唔讀） | §5.4 |
| T3.12 | 撳字會停低正在進行嘅串行朗讀（兩個聲音唔會黐埋） | §5.4 |
| T3.13 | `highlightToken()` 高亮指定 token（讀全篇時個字跟住跳） | §5.4 |
| T3.14 | 重新渲染會清走舊嘅高亮狀態 | §5.2 |

### 5.4 T4 Sequence

| ID | Case | 對應 |
|---|---|---|
| T4.1 | 撳「讀全篇」→ 第一個 token 高亮 + `speak()` 收到第一個 token | B1 |
| T4.2 | 手動 trigger `onend` → **下一個** token 高亮 + `speak()` 收到下一個 | B1 |
| T4.3 | 第一個 token `onerror` → 仍然會讀第二個 token（唔卡死） | B2 |
| T4.4 | 全部 token 讀完 → 出現鼓勵語（emoji / 文字） | B5 |
| T4.5 | 標點 token → **永遠唔會出現喺 `spokenTexts()`** | B3 |
| T4.6 | 逗號停頓 ≥ 180ms；句號停頓 ≥ 600ms | B4 |
| T4.7 | 讀到一半再撳 → `cancel()` 被呼叫 + 狀態回 IDLE + **唔會再讀下一個** | B6 |
| T4.8 | 讀到一半再撳 → 即使 mock 觸發 `onerror('interrupted')`，都唔會推進 | B6 + T8 |
| T4.9 | 串行邏輯**必須**靠 `onend`（結構斷言 S5：Sequence 必須有 `onend:` 驅動） | §5.4 |
| T4.10 | **反向驗證**：mutate 掉 `onend` → 串行卡死喺第一個字 | §5.4 |
| T4.11 | `stop()` 之後語音自然完結都唔會再推進 | §5.5.2 T8 |
| T4.12 | **防禦縱深**：就算 `Sequence.stop()` 冇 cancel 語音，都唔會錯誤推進 | §5.5.2 T8 |

### 5.5 T5 Teacher

| ID | Case | 對應 |
|---|---|---|
| T5.1 | 撳第 1 個字 → 出現「再撳第 2 個字」提示 | A4 |
| T5.2 | 再撳相鄰嘅第 2 個字 → 合併成 1 個 `w` token | §6.2 |
| T5.3 | 撳**非相鄰**嘅字 → 拒絕 + toast「要揀相鄰嘅字」 | A5 |
| T5.4 | 撳**已屬於另一個詞**嘅字 → 拒絕 + toast | A5 |
| T5.5 | 撳標點 → 拒絕 + toast「標點唔可以組詞」 | A5 |
| T5.6 | 「拆開全部詞」→ 全部還原成 `c` token | A7 |
| T5.7 | 撳已組嘅詞 → 彈出「取消合併」面板 → 移除該詞 | §6.2 |
| T5.8 | 儲存 → `localStorage.crArticles` 有 1 篇文章，shape 正確（`words[].start/len/text`） | §4.1 |
| T5.9 | 改文章文字令詞失效 → 老師端標示「⚠️ 詞已失效」 | A8 |
| T5.10 | 詞長 5 字 → 要求二次確認 | §6.2 |
| T5.11 | 匯出 JSON → 匯入 → 內容完全一致（round-trip） | §6.3 |

### 5.6 T6 A11y / SEN

| ID | Case | 層級 | 對應 |
|---|---|---|---|
| T6.1 | axe-core 掃 3 個 route（hub / reader / teacher）→ `serious` + `critical` 違規 = 0 | T1 | D2 |
| T6.2 | 所有可撳元素觸控區 ≥ 70px | T2 | D1 |
| T6.3 | 正文對比度 ≥ 7:1（用 `tools/contrast-check.js` 計 CSS 變數；T2 用真 axe） | T1 工具 / T2 | D2 |
| T6.4 | `prefers-reduced-motion: reduce` → 關閉彈跳動畫（transition/animation 關或縮到 0） | T2 | D4 |
| T6.5 | 全文冇 `alert(` / `confirm(` / `prompt(` | T1 | SEN 原則 §2.1 |
| T6.6 | 閱讀區字級 ≥ 48px（可調到 80px） | T1 | D5 |
| T6.7 | 文字區有 `aria-live="polite"` + `role="status"` | T1 | §5.7 |
| T6.8 | 所有互動元素可用 Tab 到達，focus ring 清晰 | T1/T2 | §5.7 |
| T6.9 | 唔靠顏色單獨傳意（放大 + 底色 + 底線三重） | T1 結構 | §5.7 |

### 5.7 T7 Structure（靜態結構斷言清單）

> ⚠️ 呢啲斷言**唔可以**只靠 regex。必須用 §6 嘅 mutant 機制證明佢哋真係守得住。

| ID | 斷言 | 對應陷阱 |
|---|---|---|
| S1 | 冇 `alert(` / `confirm(` / `prompt(` | SEN 原則 |
| S2 | 放大用 `transform: scale(...)`，**唔係** `font-size` 改字級 | §5.2 |
| S3 | `.tok` 有固定寬度（`width:` 唔係 `auto`） | §5.2 |
| S2 | 放大用 `transform: scale(...)`，**唔係** `font-size` 改字級 | §5.2 |
| S3 | `.tok` 有固定寬度（`width:` 唔係 `auto`） | §5.2 |
| S4 | `u.onerror` 入面有呼叫 `onend`（同一個語句或下一行） | T2 |
| S5 | 串行推進靠 `onend`（唔係 `setTimeout` 估長度） | §5.4 |
| S6 | `speak()` 之後／之前有 `speechSynthesis.cancel()` | T3 |
| S7 | 存在 `seqGen` / generation counter，中斷後唔推進 | T8 |
| S8 | `u.lang = 'zh-HK'` | C4 |
| S9 | 預設 rate `0.75` | C5 |
| S10 | 有 `voiceschanged` listener | T1 |
| S11 | 有 1500ms timeout 兜底 | T1 |
| S12 | 有 `no-hk` / `unsupported` 嘅可見提示（唔可以靜默） | T5 |
| S13 | localStorage key 全部 `cr*` 前綴 | C3 |
| S14 | 有 `__BUILD_ID` 同 `_SCHEMA_VERSION` | §7 |
| S15 | 冇 `const a = {}, b = ...` 多變數 const 宣告陷阱 | P5 |
| S16 | 冇 top-level 直接讀 `window.speechSynthesis`（C4） | C4 |
| S17 | Tokenizer 必須用 `Array.from(text \|\| '')` 攞 code-point 陣列，**唔可以用 `split('')`** | §4.1 |
| S18 | `Sequence._afterSpeech` 必須有 generation guard（`gen !== this._gen`） | §5.5.2 T8 |

---

## 6. Mutant set（守門還原驗證）

### 6.1 原則（呢幾條係呢份計劃最重要嘅部分）

1. **每個結構斷言至少要有一個 mutant 對應**。
   冇對應 = 個斷言「從來冇被證明過」= 假守門。
   → 由 **T10 meta-test** 自動檢查（§6.3）。
2. **Mutant 同正式斷言必須共用同一個函數**（`structuralFails(src)`）。
   唔好寫兩份邏輯 —— 咁樣就會漏。
3. **Mutant 一律喺記憶體改 source**（`src.split(from).join(to)`），**唔好寫落磁盤**。
   避免「還原實驗手滑清走未 commit 改動」嘅事故。
4. **搵唔到目標字串要報紅**（測試本身壞），唔可以靜靜 skip。
5. **Regex 要錨定尾部**：結尾錨到 `)` `;` `,` `}` 或者加 `(?![\w])`。
   否則「加個乘數」呢類改壞會靜靜通過。

### 6.2 Mutant 表（實作版，2026-11-10 同步）

> ⚠️ 呢張表 = `tests/mutants.js` 嘅權威對照。**ID 唔准重複**（曾經撞過 M9／M12／M13／M14）。
> 實作時每加一個 mutant，T10 meta-test 會自動檢查「每條斷言至少一個 mutant」。

| # | 改壞方式 | 對應斷言 | 必須變紅嘅測試 |
|---|---|---|---|
| M1 | `u.onerror` 刪走 `onend?.()` | S4 | T2.8、T4.3 |
| M2 | `onend:` → `onboom:`（移除完成回調驅動） | S5 | T4.2–T4.6、T4.9、T4.10、T7、T9 |
| M3 | 刪走 `speechSynthesis.cancel();` | S6 | T2.7 |
| M4 | `const gen = ++this.seqGen;` → `const gen = 0;` | S7 | T2.9、T4.8 |
| M5 | `u.lang = 'zh-HK'` → `'zh-CN'` | S8 | T2.5 |
| M6 | `DEFAULT_SPEECH_RATE = 0.75` → `1` | S9 | T2.6 |
| M7 | 刪走 `voiceschanged` listener | S10 | T2.1 |
| M8 | 刪走 `setTimeout(finish, 1500)` | S11 | T2.2 |
| M9 | `Tokenizer._chars()` 嘅 `Array.from(text \|\| '')` → `(text \|\| '').split('')` | S17 | T1.5、T7、T9 |
| M12 | 移除 `Sequence._afterSpeech` 嘅 generation guard | S18 | T7、T9、T4.12 |
| M13 | `.g.on{transform:scale(1.45)}` → `.g.on{font-size:1.45em}` | S2 | T7、T9、T3.9 |
| M14 | `.tok{...width:1.15em;...}` → `width:auto` | S3 | T3.9、T7、T9 |
| M15 | 注入 `alert('mutant');` | S19 | T6.5、T7、T9 |
| M16 | 注入 `window.alert('mutant');` | S19 | T6.5、T7、T9 |
| M17 | 改壞 SHA-256 初始 hash 常數（`0x6a09e667` → `0x6a09e668`） | S20 | T7、T9、T11.1a |
| M18 | 喺 `Sha256.hash()` 注入 `crypto.subtle.digest(...)` | S20 | T7、T9 |
| M19 | `KEY_ARTICLES: 'crArticles'` → `'yueArticles'` | S21 | T7、T9、T8.4 |
| M20 | 注入 inline literal `localStorage.setItem('yueInline', 'x')` | S21 | T7、T9 |

> ⚠️ 每個 mutant 嘅 `from` 字串必須**唯一**出現（或者用更長嘅 context）。
> 出現多過一次 → mutant 會改錯地方 → 測試「變紅」咗但係因為另一個原因 → **假陽性**。
> → `mutants.js` 入面每個 mutant 要用 `countOf(src, from)` 斷言 === 1（T9 已自動檢查）。

> ⚠️ **實際撞號案例**：M9 一度用 `from: "Array.from(text || '')"`，
> 但 Teacher 模組入面**都有一模一樣嘅字串** → 出現 2 次 → mutant 會改錯地方。
> → 修正：錨定到 `Tokenizer._chars()` 嘅完整方法頭
> （`"  _chars(text) {\n    return Array.from(text || '');"`）。
> **教訓：通用嘅表達式唔可以用作 `from` 錨點，一定要連埋上下文。**

> ⚠️ **M16 點解要獨立存在**：S19 嘅規則有兩個分支 ——
> 裸呼叫 `alert(`（前面唔可以有 `.`）同 `window.alert(`（前面有 `.`）。
> 淨係靠第一個分支 → `window.alert()` **會漏網**。
> → 每個偵測分支都要有自己嘅 mutant（M15 守第一個，M16 守第二個）。

#### 6.2.1 已實作 vs 原計劃（避免誤會）

原計劃仲有幾條斷言**冇實作**（唔喺 `ASSERTION_IDS` 入面），因為佢哋已經由**行為測試**守住，
再加結構斷言只會係重複邏輯（兩份邏輯 = 會漏）：

| 原計劃 | 改由邊個守住 |
|---|---|
| S1（禁原生彈窗） | → 併入 **S19**（`nativeDialogCalls()` 共用函數，T6.5 同 S19 唔會走樣） |
| S12（no-hk 橫幅） | T2.3 行為測試（橫幅真係出現、唔係靜靜冇聲） |
| S13（localStorage key 前綴） | T8.1–T8.4 行為測試（真係寫入 `cr*` key） |
| S14（build id / schema version） | T8 行為測試 |
| S15（頂層 `const` 多變數賦值） | T0 行為測試（真係跑得出嚟就捉到；靜態掃描捉唔到 —— 見 memory「靜態結構斷言捉唔到 strict-mode runtime bug」） |
| S16（頂層讀 `window.speechSynthesis`） | T0 P3 行為測試（jsdom 冇 speechSynthesis 應該即爆） |

### 6.3 Mutant 覆蓋率對齊（meta-test，T10）

```js
// tests/t10-meta.test.js
import { ASSERTION_IDS } from '../structural.js';
import { MUTANTS } from '../mutants.js';

it('每個結構斷言都有至少一個 mutant 對應', () => {
  const covered = new Set(MUTANTS.flatMap(m => m.covers));
  const missing = ASSERTION_IDS.filter(id => !covered.has(id));
  expect(missing).toEqual([]);       // 有漏 → 紅
});

it('每個 mutant 嘅 from 字串喺 source 出現恰好一次', () => {
  for (const m of MUTANTS) {
    expect(countOf(realSrc, m.from)).toBe(1);   // 唔係 1 → 測試本身壞 → 紅
  }
});

it('mutant 必須令守門變紅', () => {
  for (const m of MUTANTS) {
    const mutated = realSrc.split(m.from).join(m.to);
    expect(mutated).not.toBe(realSrc);           // 真的改到
    const fails = structuralFails(mutated);
    expect(fails.length, `mutant ${m.id} 令守門變紅`).toBeGreaterThan(0);
  }
});
```

**核心規則**：`structuralFails(src)` 係**唯一**嘅結構真相來源。
正式測試斷言 `structuralFails(realSrc).length === 0`；mutant 測試斷言同一個函式對 mutated src 會 fail。
→ **唔可能出現「正式版全綠但 mutant 唔紅」**。

---

## 7. Guard 腳本與 M1 ship gate

### 7.1 `npm run guard` 內容

```bash
npm run guard  =
  lint 結構掃描（P5 const 陷阱 + S15/S16）
  && vitest run（Tier 1 全部）
  && vitest run --coverage（Tier 2 可選，無 browser 唔算 fail）
  && mutant 還原驗證（T9 + T10）
```

| Gate | 條件 | 違反後果 |
|---|---|---|
| G1 | Tier 1 全部綠 | 唔准 commit |
| G2 | mutant 全部變紅（守門有效） | 唔准 commit |
| G3 | coverage ≥ 實際值 − 3pp | 唔准 commit |
| G4 | axe `serious`/`critical` = 0 | 唔准 commit |
| G5 | 冇 `alert/confirm/prompt` | 唔准 commit |
| G6 | Tier 3 實機 checklist 全部簽核 | **唔准 M1 ship** |

### 7.2 Coverage threshold 點樣定（唔好拍腦袋）

#### ⚠️ 2026-11-10 實測發現：v8 coverage 對單檔 inline script 量唔到

原計劃寫「`coverage.include: ['index.html']` → v8 可以量 HTML 入面嘅 inline JS」。**實測係錯嘅**：

| 試過嘅方法 | 結果 |
|---|---|
| `coverage.include: ['index.html']` | 報告 0%，檔案根本冇出現 |
| `coverage.include: ['**/index.html']` + `all: true` | 仍然 0% |
| eval 前加 `//# sourceURL=file:///…/index.html` pragma | 仍然 0% |

根因：v8 coverage 靠 **script URL** 對應檔案；`window.eval()` 出嚟嘅 code 冇可對應嘅模組路徑，
vitest 嘅 v8 provider 收集到但對唔上檔 → 全部被 filter 走。

**處置：改規則，而唔係放寬驗收線。**
「coverage %」呢條驗收線嘅**目的**係「唔好有未測試嘅 code 偷偷入咗去」。
既然百分比工具喺單檔架構下唔適用，就**換一個真係守得住同一個風險**嘅 gate：

> **T10「模組 ↔ 測試檔對齊」守門** ——
> 每個 `window.CR` 入面嘅模組都必須喺 `MODULE_TESTS` 有映射；
> 模組一旦由 placeholder 變成真實實作（刪走 `__placeholder: true`），
> 就**必須**有對應測試檔，否則守門紅。

呢個 gate 直接封住「實作咗但冇測試」呢個風險 —— 同一個目的，但真係守得住。

#### M1 尾：重新評估百分比 coverage

到 M1 尾 app 大咗，值得再試呢條路（**量到先設 threshold**）：

| 方案 | 做法 | 代價 |
|---|---|---|
| A（推薦） | `src/app.js` 做 source of truth，`index.html` 由 build script inline 生成；再加一條測試斷言兩者 byte-identical（防 drift） | 多一個 build step（但部署仍然係單檔） |
| B | 放棄隔離 jsdom，改用 vitest 全域 jsdom + `vi.resetModules()` + 動態 import，配合 istanbul provider | 測試隔離性變差，mock 時序要重排 |

定 threshold 嘅規則不變：
1. 量到實際覆盖率（例如 72%）
2. threshold = `實際值 − 3pp`（即 69%）
3. **唔可以一開始就設 80%** —— 未寫測試前設高只會令人用 `--coverage=false` 繞過

> ⚠️ threshold 係 **FLOOR（地板）唔係 TARGET（目標）**。達到地板後應該逐步手動調高，
> 唔好自動調（自動調 = 測試愈差都愈過）。

---

## 8. Tier 3 實機測試清單（學校）

**必須喺 M1 尾做**，因為要驗證 `DESIGN.md` §9 嘅 **R1**（裝置冇 zh-HK voice）。

### 8.1 裝置

| # | 裝置 | 瀏覽器 | 必測項目 |
|---|---|---|---|
| D-1 | 學校 iPad | Safari | 全部 |
| D-2 | Windows 平板 | Chrome / Edge | 全部（**R1 高危**） |
| D-3 | 學校 Mac | Safari | 抽測 |

### 8.2 Checklist

| # | 檢查項目 | 通過標準 | 對應 |
|---|---|---|---|
| P1 | 有冇 `zh-HK` voice | `Voice.state === 'ok'`；冇就記錄 `no-hk` | **R1** |
| P2 | 首次撳有冇聲 | 第一次撳可能冇聲（iOS gesture）→ 提示有冇出現 | T5 |
| P3 | 撳字發音 | 即時出聲，冇 1 秒以上延遲 | A1 |
| P4 | 逐字讀唔會讀錯音 | 抽查 10 個多音字（和/了/行/重/長/得/着/的/個/中） | §5.5.3 |
| P5 | 串行讀唔會卡死 | 讀完整篇，中途唔會停喺同一個字 | B2 |
| P6 | 串行讀中途撳 → 立即停 | 唔會繼續讀落去 | B6 |
| P7 | 放大會唔會令句子跳 | 撳字時隔籬字唔郁 | A2 |
| P8 | 聲音同畫面對唔對上 | 高亮嘅字 = 聽到嘅字（同步） | B1 |
| P9 | iPad 長按會唔會彈「選擇/複製」 | 唔會（`user-select:none` 生效） | §6.2 |
| P10 | 字級夠唔夠大 | 48px 預設，學生睇得舒服 | D5 |
| P11 | 觸控誤觸 | 學生亂撳唔會令 app 卡死 / 讀錯頁 | — |
| P12 | 離線（飛行模式）可唔可以跑 | 可以（除語音要本機 voice） | R7 |
| P13 | 老師端喺同一部機入面用 | 密碼 gate 正常、貼文/標詞正常 | — |
| P14 | 字級調到 80px 會唔會爆版 | 唔會（閱讀區可 scroll） | D5 |
| P15 | 連續用 15 分鐘會唔會慢 | 唔會（記憶體冇 leak） | — |

> 每一項要記錄：**裝置型號 + OS 版本 + 瀏覽器版本 + 結果 + 備註**。
> 特登要記低 P1（voice 狀態）—— 呢個係決定發音層要唔要重新設計嘅唯一依據。

---

## 9. 已知限制（自動化做唔到嘅嘢）

| # | 限制 | 處理 |
|---|---|---|
| L1 | jsdom 冇 layout → 量唔到重排 / 觸控區 | Tier 2 或人手 |
| L2 | jsdom 冇 axe contrast 能力 | `tools/contrast-check.js` + Tier 2 |
| L3 | 冇真實語音引擎 → 讀音**準唔準**測唔到 | Tier 3 P4（人耳抽查） |
| L4 | 真實 TTS 延遲 / 佇列行為同 mock 有差 | Tier 3 P3/P5 |
| L5 | 學生真實使用行為（幾耐會放棄） | 觀察，v2 先做個人進度 |
| L6 | Web Speech API 喺 Firefox / Android WebView 支援度 | Tier 3 + 瀏覽器矩陣（v2） |

> ⚠️ L3 係最重要嘅一條：**自動化測試證明唔到「讀音啱唔啱」**。
> 讀音正確性 = Tier 3 人耳抽查 + §5.5.3 嘅詞優先設計。唔可以因為 CI 全綠就當讀音冇問題。

---

## 10. 執行方式

```bash
npm install          # dev 依賴（app 本身零依賴）
npm run test         # Tier 1 全部（vitest run）
npm run test:watch   # 開發模式
npm run test:browser # Tier 2（需要 npx playwright install chromium）
npm run guard        # commit 前全閘
```

`vitest.config.js`：
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // ⚠️ threshold 未設 —— v8 量唔到單檔 inline script（§7.2）。
      //    M1 尾揀咗方案 A/B 之後，量到實際值再寫返：
      //    thresholds: { lines: 實際−3, functions: 實際−3, branches: 實際−3, statements: 實際−3 },
    },
  },
});
```

> ⚠️ 單檔 HTML 入面嘅 **inline CSS 冇任何工具量到覆蓋率**（v8 只量 JS）。
> CSS 嘅守門靠 T7 結構斷言（例如「放大必須用 transform scale 唔係 font-size」）
> + Tier 2 真實瀏覽器驗證（A2 重排 / D1 觸控區 / D2 對比度）。

---

## 11. 進度追蹤

| 模組 | 狀態 | 備註 |
|---|---|---|
| T0 App 完整性 | ✅ 已寫（6 case） | P1–P6，單檔 HTML 自我保護 |
| T1 Tokenizer | ✅ 已寫（14 case） | T1.1–T1.14（+ T1.15–T1.17 已併入） |
| T2 Voice | ✅ 已寫（11 case） | T2.1–T2.11，語音層 |
| T3 Reader | ✅ 已寫（14 case） | T3.1–T3.14 |
| T4 Sequence | ✅ 已寫（12 case） | T4.1–T4.12 |
| T5 Teacher | ✅ 已寫（17 case） | T5.1–T5.14（含 T5.9b／T5.9c 延長一字模式、T5.10／T5.10b 二次確認） |
| T6 A11y | ✅ 已寫（7 case） | axe-core 已接（Tier 2 跑）；Toast `role=status` + `aria-live` |
| T7 Structure | ✅ 已寫 | S2/S3/S4/S5/S6/S7/S8/S9/S10/S11/S17/S18/S19（**13 條已實作**） |
| T8 Storage | ✅ 已寫（4 case） | T8.1–T8.4 |
| T9 Mutants | ✅ 已寫（**18 mutant**） | M1/M2/M3/M4/M5/M6/M7/M8/M9/M12/M13/M14/M15/M16/M17/M18/M19/M20 |
| T10 Meta | ✅ 已寫（7 case） | mutant 覆蓋率 + 模組↔測試檔對齊 |
| T11 Auth | ✅ 已寫（18 case） | Sha256（對齊 Node crypto）+ Auth 密碼 gate + `Modal.askText` |
| T12 Hub | ✅ 已寫（21 case） | Hub 首頁 + App 路由 + 閱讀頁 + 老師模式 gate |
| T13 TeacherUI | ✅ 已寫（21 case） | 文章庫（發佈/隱藏/刪除）+ 標詞編輯 + 設定 + 匯入匯出 |
| Tier 2 browser | ✅ 已寫（13 case，已跑通） | `tests/browser/layout.spec.js` · Playwright Chromium（閱讀頁 / hub / 老師頁 / modal 各自跑 axe） |
| Tier 3 實機 | ⬜ 未做 | **M1 尾必做，驗證 R1** |

**目前總數**：Tier 1 = **171 tests / 14 files**；Tier 2 = 13 tests；mutant = 18 個。

**已驗證**：
- 2026-11-10 四輪破壞（Reader）：關咗詞優先 → T3.4–T3.7 紅；放大改 font-size → T7(S2)+T9(M13) 紅；
  字格 width:auto → T3.9+T7(S3)+T9(M14) 紅；標點照讀 → T3.11 紅。
- 2026-11-10 **Tier 2 真實瀏覽器第一次跑**：axe 捉到 `<h1>` 金色 `#f59e0b` on `#f8fafc` 只有 2.05:1
  （大字要 3:1）→ 改用 `--gold-ink:#b45309`（5.4:1）；`.tok.punct` 亦由 `#94a3b8` 改 `#64748b`。
- 2026-11-10 手動改壞 `index.html`（刪走 `u.onerror` 入面嘅 `onend` 推進）
  → T7 / T9 / **T2.8 行為測試** 三條同時紅 → 還原後全綠。
- 2026-11-10 移除 `DOMContentLoaded` 啟動入口 → **只有 P6 紅** → 還原後全綠。
- 2026-11-10 移走 `offset-mismatch` 校驗 → **只有 T1.4 紅** → 還原後全綠。
- 2026-11-10 `Array.from` → `split('')` → **T1.5 + T7(S17) + T9(M9) 三條紅** → 還原後全綠。
- 2026-11-10 **T5 Teacher 三輪破壞**（`tools/verify-teacher-guard.sh`，自動做、做完自動還原）：
  - D1 拆走「延長一字」分支 → **T5.9b / T5.9c / T5.10 / T5.10b 四條紅**
  - D2 拆走 5 字詞嘅二次確認 → **T5.10 / T5.10b 兩條紅**
  - D3 「相鄰」判斷改成亂指 → **T5.9c 一條紅**
- 2026-11-10 **守門自我驗證**（`tools/verify-guard.mjs`，12 項全 PASS）：
  拆走 S19 嘅 `window.` 分支 → M16 捉唔到（即證明嗰個分支**必須**存在）；
  淨留裸呼叫規則 → `window.alert()` 漏網；
  拆走 S20 兩個分支 → M17 / M18 各自捉唔到；
  拆走 S21 兩個分支（KEY_* 常數 / inline literal）→ M19 / M20 各自捉唔到；
  全部 18 個 mutant 都令對應斷言變紅。
- 2026-11-10 **M0/M1 九輪破壞**（`tools/verify-m0m1-guard.sh`，自動做、做完自動還原）：
  - D4 學生端唔再過濾 published → **T12.6 紅**
  - D5 唔檢查密碼就入老師模式 → **T12.18 紅**
  - D6 老師清空文章庫後又自動生返預設文章 → **T12.4 紅**
  - D7 Modal 取消時 resolve 空字串而唔係 null → **T11.2j + T11.3b 紅**
  - D8 讀音小卡唔建立 → **T3.7 紅**
  - D9 儲存掣只喺標詞之後先出現 → **T13.2b/2c/2e/2h/2i 五條紅**
  - D10 空內容唔阻儲存 → **T13.2i 紅**
  - D11 字數計數器唔更新 → **T13.2j 紅**
  - D12 字級預設掣唔會套用 → **T13.3e 紅**
- 2026-11-10 **Tier 2 axe 捉到 4 類真問題**（全部已修）：
  `label-content-name-mismatch`（卡片／按鈕加咗 aria-label，同可見文字打架）→
  改用 `title`；`aria-dialog-name`（modal 冇 accessible name）→ `aria-labelledby="modal-title"`；
  掣高度 < 70px（tabs / article-row / word-del 覆蓋咗全域 min-height）→ 全部改返 70px；
  隱藏 modal 入面嘅掣高度 = 0 → 驗收線要跳過睇唔見嘅元素（唔係放寬線）。

⚠️ 2026-11-10 修正：`DESIGN.md` §4.1 嘅 offset 範例原本寫錯（茶餐廳 start 應為 **10** 唔係 8），
`TEST-PLAN.md` §5.1 T1.2 同步修正。呢個正正示範咗點解載入校驗係必須嘅。

⚠️ 2026-11-10 修正：`Modal.confirm()` 撞名原生 `confirm()` → 改名 **`Modal.askConfirm()`**。
撞名會令 S19 嘅偵測 regex 出現假陽性（`confirm(` 定義本身）。
同理，mutant `from` 錨點唔可以用通用表達式（M9 撞 `Array.from(text || '')`）。

---

## 12. 執行順序建議

1. **先寫 harness + mocks**（`harness.js` / `mocks/speech.js`）→ 呢兩個係地基，唔寫之後全部都要返工
2. **T2 Voice**（風險最高、陷阱最密）→ 順便寫 S4/S6/S8/S9/S10/S11
3. **T4 Sequence** → 順便寫 S5/S7
4. **T1 Tokenizer**（最易，唔靠 DOM）
5. **T3 Reader → T5 Teacher → T6 A11y → T8 Storage**
6. **T7 Structure + mutants.js + T9 + T10**（一定要最後做，因為要前面嘅斷言先定咗）
7. **Tier 3 實機** → 記錄 R1 結論

> ⚠️ **唔好先寫 mutants.js**。mutant 一定要對應真實存在嘅斷言，
> 否則會出現「mutant 對住一條唔存在嘅斷言」→ 假守門。
