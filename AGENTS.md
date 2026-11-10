# AGENTS.md — chinese-reading (互動中文閱讀 · 點讀)

> **Resumability doc** — 任何 program / agent 開呢個 project 讀呢個 file 就知 status。
> User: kencheng | School: 匡智張玉瓊晨輝學校 | Last updated: 2026-11-10

---

## 1. Project 概要

單檔 vanilla JS SPA，專為**中度/輕度智障 SEN** 學生做「點讀」互動中文閱讀。
學生撳文章入面嘅**字**或者**詞** → 個字變大 + 讀出粵語；亦可以撳「🔊 讀全篇」串行讀。

| 項目 | 值 |
|---|---|
| Path | `/Users/kencheng/workspace/vs code/education/chinese/chinese-reading/` |
| Status | **M0/M1 完成 + 已部署**（166 Tier 1 + 13 Tier 2 全綠）；App 四個 view 已通 |
| Design doc | `DESIGN.md`（v0.1） |
| Live URL | **https://ihateusingai-beep.github.io/chinese-reading/**（GitHub Pages，公開） |
| Repo | https://github.com/ihateusingai-beep/chinese-reading（public，`main`） |
| Deploy | GitHub Pages，單一 `index.html`，零 backend |
| LLM / API | **完全唔用**。發音用瀏覽器內建 Web Speech API (zh-HK) |
| Git | ✅ 已 `git init`（`main`），remote = `origin` |

### 同 sibling projects 嘅分工（唔好搞混）

| Project | 模型 | 定位 |
|---|---|---|
| `sen-yue-read-score` | 詞彙卡 → 錄音評分 | 詞彙級產出 |
| `reading-para` | 揀文章 → 錄音 → ASR 評分 | 篇章級產出 |
| **`chinese-reading`** | **撳字 → 電腦讀** | **篇章級接受（聽住跟讀）** ← 本專案 |

⚠️ 唔好將本專案併入 `reading-para`（互動模型根本唔同；`reading-para` 已有 7000 行 + ASR 複雜度）。

---

## 2. 已鎖定嘅設計決策（2026-11-10 用戶確認）

1. **獨立新專案**，唔併入 `reading-para`
2. **發音：瀏覽器 Web Speech API (zh-HK) 即時讀，零預生成 mp3**
3. **老師標詞：老師面板預覽度連按兩個字，即刻組成詞**；3 字以上用**明確嘅「延長一字」模式**（唔自動延長）
4. **MVP 學生端三項**：逐字點讀 / 整句全篇連續點讀（自動逐字高亮）/ 詞語點讀
5. **MVP 唔做**：認字測驗、錄音評分、ASR、Dashboard、圖片提示

---

## 3. Stack（全部沿用 `reading-para` 慣例）

- 純 HTML + vanilla JS，**冇 framework、冇 build step、冇依賴**
- 單檔 `index.html` + inline CSS/JS；可離線、可以 host 喺任何 static server
- 資料：純 `localStorage`，零 backend、零 API key、零追蹤
- 部署：GitHub Pages（`ihateusingai-beep/chinese-reading`）
- **禁 `alert()` / `confirm()` / `prompt()`** → 一律 in-app modal（SEN 原則）
  ⚠️ 自己嘅 wrapper **唔可以叫同名**（`Modal.askConfirm()` 唔係 `confirm()`，見 T17）
- 按鈕 `min-height:70px`、`font-size:1.4em`、`border-radius:16px`
- 校色：天藍 `#7DD3FC`、紫 `#7c3aed`、金 `#f59e0b`、綠 `#22c55e`、紅 `#ef4444`
- 老師端 password gate（SHA-256 + salt，同 `reading-para`）

---

## 4. 資料模型（權威定義喺 `DESIGN.md` §4）

```js
Article = {
  id, title, type: 'life'|'prose'|'poem',
  text: '我今天和爸爸媽媽去了茶餐廳吃飯。',
  words: [ { start: 10, len: 3, text: '茶餐廳' }, { start: 13, len: 2, text: '吃飯' } ],
  jyutping: {},   // v2 預留：字 → 粵拼
  audio: {},      // v2 預留：字/詞 → mp3 覆寫
  createdAt, published
}
```

⚠️ **`start`/`len` 係 `[...text]` 嘅 code-point index，唔係 UTF-16 offset**（emoji 會錯位）。
⚠️ **offset 一定會寫錯**（茶餐廳係 10 唔係 8）。寫錯唔會 crash，只會令詞**靜靜失效** → 降級成單字。

⚠️ **載入必校驗**：`chars.slice(start, start+len).join('') === word.text`
→ 唔合格 = 詞失效 → 學生端降級成單字，老師端標示要重新配對。
（老師改文中間嘅字，之後面所有詞 offset 全部錯位，冇校驗 = 幽靈 bug，讀錯但唔 crash。）

### localStorage keys

`crArticles` · `crSchemaVersion` · `crSettings` · `crProgress` · `crTeacherPassHash` · `crLastStudentId`

---

## 5. 三大技術陷阱（實作時唔好踩）

| # | 陷阱 | 對策 |
|---|---|---|
| T1 | `getVoices()` 首次非同步 → 首次撳冇聲 | `voiceschanged` + 1500ms timeout 雙保險，App 啟動就 `init()` |
| T2 | `onerror` 唔推進佇列 → **串行讀卡死喺第一個字** | `onerror` 必須呼叫 `onend` |
| T3 | 冇 `cancel()` → 疊音 | 每次 `speak()` 前 `speechSynthesis.cancel()` |
| T4 | 孤立單字多音字讀錯（和/了/行/重/長/得/着） | **以詞為單位發音、以字為單位視覺**；撳字時若屬某詞就讀整個詞 |
| T5 | 冇 zh-HK voice → 靜靜冇聲 | 明確橫幅 + 普通話 fallback（**絕唔可以靜默**） |
| T6 | 改 font-size 放大 → 成句重排，學生睇唔到撳咗邊 | 固定 `width:1.15em` 字格 + `transform: scale()`（唔參與 layout） |
| T7 | **`cancel()` 觸發 `onerror('interrupted')`** → 中斷後串行**繼續讀落去** | 用 **generation counter**（`seqGen++`，`onend` 檢查 `gen === seqGen`），唔靠 error 字串判斷 |
| T8 | 測試環境 jsdom 冇 `speechSynthesis` → module 頂層讀佢會即爆 | 延遲到 `Voice.init()` 先讀；harness 裝 mock 後先 eval |
| T9 | **v8 coverage 量唔到單檔 HTML 嘅 inline `<script>`**（eval 出嚟冇 file mapping） | 唔好靠 % 當守門；改用 T10「模組↔測試檔對齊」gate。詳見 `docs/TEST-PLAN.md` §7.2 |
| T10 | mock 嘅 `cancel()` 太乾淨 → 測試全綠但真機有 bug | mock 必須模仿 Chrome：cancel 觸發 `onerror('interrupted')` |
| T11 | harness `close()` 早過 app 啟動 → app 喺已死嘅 jsdom window 上 init，`document` 變 `undefined` | harness 喺 eval 之後主動 dispatch `DOMContentLoaded`，令 app 啟動可控 |
| T12 | `split('')` / `text.slice()` 切嘅係 **UTF-16 code unit** → emoji／生僻字被拆爛，之後所有詞 offset 全錯位 | 一律用 `Array.from(text \|\| '')` 攞 code-point 陣列（結構斷言 S17 + mutant M9 守住） |
| T13 | 隔離嘅 jsdom window **唔會**跟 vitest 嘅 fake timer → app 入面嘅 setTimeout 唔受控，停頓時序根本測唔到 | harness 提供 `installFakeTimers(win)`，手動把 fake timer 裝入隔離 window |
| T14 | 校色 `#f59e0b` 喺淺底只有 **2.05:1** → axe 判 serious 違規（SEN 學生要高對比） | 文字用 `--gold-ink:#b45309`（5.4:1）；`--gold` 只留嚟做邊框／accent |
| T15 | **mutant 嘅 `from` 錨點撞字串** → 改錯地方 → 測試「紅咗」但係假陽性 | `from` 必須喺 source 出現**恰好一次**；通用表達式（`Array.from(text \|\| '')`）唔可以用，要連埋上下文（M9 錨定 `Tokenizer._chars()`） |
| T16 | **偵測規則有多個分支 → 只驗其中一個** → 另一個分支冇人守住 | 每個分支都要有獨立 mutant（M15 守裸 `alert(`、M16 守 `window.alert(`） |
| T17 | **in-app wrapper 撞原生 API 名** → 靜態偵測 regex 出假陽性 | 改名：`Modal.askConfirm()`（唔係 `confirm()`）、`Toast.show()`（唔係 `alert()`） |
| T18 | **`crypto.subtle` 只喺 secure context 先有** → 學校用 `http://192.168.x.x` 本機伺服器 → **老師密碼 gate 完全死掉**（而且 jsdom 測試環境都冇） | 自己實作純 JS SHA-256（`Sha256` 模組，約 60 行）。結構斷言 S20 + mutant M17/M18 守住 |
| T19 | **喺有可見文字嘅元素上加 `aria-label`** → axe `label-content-name-mismatch`（serious）—— accessible name 要包含可見文字 | 唔好喺卡片／按鈕加 aria-label；改用 `title`（tooltip），可見文字做 accessible name |
| T20 | **`display:none` 嘅元素 `getBoundingClientRect()` 高度係 0** → 觸控區驗收線會誤報 | 量觸控區時要跳過高度 = 0 嘅（睇唔見 = 撳唔到 = 唔算觸控目標） |
| T21 | **對話框（`role="dialog"`）冇 accessible name** → axe `aria-dialog-name`（serious） | `aria-labelledby="modal-title"` + 標題元素要有 `id` |

---

## 6. 已知風險（要喺 M1 尾實機驗證）

- **R1** 裝置冇 zh-HK voice（Windows 平板機會較常見）→ **M1 尾一定要用學校實機測**，
  如果真係常見，發音層要即刻重新設計（可能直接轉預生成 mp3）。
- **R3** Chrome 桌面版會將 TTS 文字送去 Google 伺服器 → **唔好喺文章放學生全名**；
  `reading-para` 嘅「零私隱」guarantee 喺本專案唔再成立（v2 `audio` 欄位可完全解決）。
- **R4** 殘留多音字限制：Web Speech 唔支援 phoneme/SSML，孤立字冇得救 → v2 預生成 mp3 / 老師錄音。

---

## 7. 里程碑

- M0 Scaffold → **M1 MVP**（貼文+標詞+三種點讀+設定+fallback）→ M2 管理 → M3 教學增強 → v2

## 8. 下一步

1. ✅ 寫 `docs/TEST-PLAN.md`（`DESIGN.md` §10 展開成 T1–T10 模組 + mutant set + 三層測試）
2. ✅ **測試地基 + T2 Voice**（`docs/TEST-PLAN.md` §12 步驟 1–2）：測試全綠，已手動破壞驗證守門有效
3. ✅ **T1 Tokenizer**（步驟 3）：token 化 + code-point index + 載入校驗 + 失效降級，14 個測試
4. ✅ **T4 Sequence**（步驟 4）：串行播放（靠完成回調推進）+ 標點停頓 + 中斷 + 防禦縱深，12 個測試
5. ✅ **T3 Reader**（步驟 5）：渲染 + 點擊 + 詞優先發音 + 放大不重排，14 個測試 + 13 個 Tier 2 真實瀏覽器測試
6. ✅ **T5 Teacher**（步驟 6）：標詞配對 + **延長一字模式** + 文章 CRUD + 匯入匯出 + 失效標示，17 個測試
7. ✅ **M0/M1 scaffold**：Hub 首頁 / 閱讀頁 / 老師端 UI / 密碼 gate / 發佈隱藏 / 預設文章 / 進度記錄
   （新增 `Sha256` `Auth` `Hub` `TeacherUI` 四個模組 + T11/T12/T13 三個測試檔，55 個測試）
8. ✅ **`git init` + GitHub Pages 部署** → https://ihateusingai-beep.github.io/chinese-reading/
   （公開 repo；線上檔案同本地**逐 byte 一致** + 結構斷言全過，已驗證）
9. ⬜ **學校實機測試**（iPad + Windows 平板）— 驗證 R1 ⬅️ **M1 ship 硬門檻，仲未做**

### 已實作模組（全部喺 `index.html` 單檔內）

| 模組 | 狀態 | 內容 |
|---|---|---|
| `Store` | ✅ | settings + 文章庫 CRUD（`cr*` keys）+ 預設文章植入 + 進度記錄 |
| `Voice` | ✅ | zh-HK TTS、voice 偵測（`voiceschanged` + 1500ms timeout）、`seqGen` generation counter |
| `Tokenizer` | ✅ | code-point index（`Array.from`）、`validate()`、五種失效原因 |
| `Sequence` | ✅ | 串行播放、標點停頓、雙層 generation guard |
| `Reader` | ✅ | 渲染、點擊、詞優先發音、讀音小卡（`ensureCard()` 單一真相來源）、固定 `1.15em` 字格 + `transform: scale(1.45)` |
| `Teacher` | ✅ | 標詞配對、**延長一字模式**、文章 CRUD、匯入匯出、失效詞標示 |
| `Toast` / `Modal` | ✅ | `Toast.show()`（`role=status`）、`Modal.askConfirm()`、`Modal.askText()`（in-app 文字／密碼輸入） |
| `Sha256` | ✅ | 純 JS SHA-256（**唔用** `crypto.subtle` —— 見 T18） |
| `Auth` | ✅ | 老師密碼 gate（SHA-256 + 每次安裝隨機 salt）、預設密碼 `230714`（老師指定） |
| `Hub` | ✅ | 學生端首頁（**只顯示 published 文章**）、大卡片 |
| `TeacherUI` | ✅ | 文章庫（發佈/隱藏/刪除）+ 標詞編輯器 + 設定（語速/字級/詞優先）+ 改密碼 + 匯入匯出 |
| `App` | ✅ | 冪等 `init()`、四個 view 路由（hub / read / teacher / teacher-edit）、字級縮放 |

### 測試基建現況

- `npm test` → vitest run（**171 tests / 14 files**）
- `npm run test:browser` → Playwright Tier 2（**13 tests**，已裝 Chromium）
- `npm run guard:full` → Tier 1 + Tier 2
- 依賴：vitest + jsdom + axe-core（**dev-only**，app 本身零依賴）
- harness：`tests/harness.js` → 抽 `index.html` 嘅 inline script → 隔離 jsdom → `win.CR` 攞模組
- app 必須喺尾行設 `window.CR = { App, Voice, Tokenizer, Sequence, Reader, Teacher, Toast, Modal, Store, Sha256, Auth, Hub, TeacherUI }`（TEST-PLAN §2.3 C1）
- 守門三層：行為測試 → 結構斷言（`tests/structural.js`，**15 條** S2–S11/S17–S21）→
  mutant 還原（`tests/mutants.js`，**18 個** M1–M9/M12–M20）→ meta 對齊（`tests/t10-meta.test.js`）
- **自我驗證工具**（唔入 vitest，刻意唔依賴 vitest）：
  - `node tools/verify-guard.mjs` → 12 項，證明守門規則每個分支都有 mutant 守住
  - `bash tools/verify-teacher-guard.sh` → 3 輪真實改壞 Teacher 實作，確認 T5 測試會紅（做完自動還原）
  - `bash tools/verify-m0m1-guard.sh` → 9 輪真實改壞 M0/M1 新功能，確認 T11/T12/T13/T3 測試會紅（做完自動還原）

---

## 9. 相關文件

- `DESIGN.md` — 完整構思（v0.1）
- `docs/TEST-PLAN.md` — 測試計劃（T1–T10 模組、mutant set、三層測試、實機 checklist）
- `tools/verify-guard.mjs` — 守門自我驗證（每個偵測分支都有 mutant 守住？）
- `tools/verify-teacher-guard.sh` — Teacher 實作真實破壞驗證
- `../reading-para/AGENTS.md` — sibling project 慣例來源
- `../reading-para/.mavis/plans/cantonese-analysis-research.md` — 粵語朗讀評估研究（評分演算法參考，本專案 v1 唔用）
