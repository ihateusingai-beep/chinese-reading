# 互動中文閱讀（點讀）— 設計構思 v0.2

> **Project**: `chinese-reading`
> **Path**: `/Users/kencheng/workspace/vs code/education/chinese/chinese-reading/`
> **對象學生**: 中度智障 / 輕度智障 SEN
> **狀態**: M0/M1 已實作並部署（2026-11-10 上線 GitHub Pages）
> **Last updated**: 2026-11-10
> **User**: kencheng | 學校：匡智張玉瓊晨輝學校

---

## 0. 一句話

老師貼一篇 50–100 字嘅短文落去，學生逐個字（或者逐個詞）撳落去，個字即刻變大、讀出粵語，
跟住可以撳「🔊 讀全篇」由電腦一路串行讀落去，學生跟住讀。

---

## 1. 背景與定位

### 1.1 同區內兩個 sibling project 嘅分工

| Project | 互動模型 | 學生要做咩 | 適合 | 技術底盤 |
|---|---|---|---|---|
| `sen-yue-read-score` | 詞彙卡 → 錄音評分 | **產出**（自己讀出嚟） | 詞彙級 | 單檔 vanilla SPA |
| `reading-para` | 揀文章 → 錄音 → ASR 評分 | **產出**（自己讀出嚟） | 篇章級 | 單檔 vanilla SPA + Whisper |
| **`chinese-reading`（本專案）** | **撳字 → 電腦讀** | **接受**（聽住跟讀） | 篇章級、認字前段 | 單檔 vanilla SPA + Web Speech |

**關鍵定位**：呢個工具係「閱讀嘅第一步」——學生先要**睇得明、聽得明**，先至有動機去「自己讀出嚟」。
`reading-para` 係「已經識讀，想知道自己讀得幾好」。兩者係一條學習路徑嘅前後段，唔係重複。

### 1.2 為咩唔併入 `reading-para`

1. **互動模型根本唔同**：錄音 + ASR（7,000 行、354KB、Whisper 40MB 模型）vs 撳字 + TTS。硬併入會令呢條新路徑背上成個錄音系統嘅複雜度。
2. **中度學生要嘅係簡單**：`reading-para` 有 Hub、登入卡、4 維評分、證書、PDF 報告。對中度學生嚟講，Hub 已經係多餘嘅一步。
3. **部署解耦**：呢個工具可以獨立更新、獨立試，唔會影響緊朗讀評估嗰條線。

> **將來整合**：如果兩條線都想喺同一個入口，去 `reading-para` 加一個「去點讀」嘅連結即可，兩邊各自 keep 獨立 repo。

### 1.3 v1 明確 **唔** 做（避免 scope 膨脹）

- ❌ 錄音 / 跟讀評分（→ `reading-para` 已有）
- ❌ ASR / Whisper
- ❌ 認字測驗、搶答、計分、星星
- ❌ Dashboard、PDF 報告、學生個人檔案
- ❌ 圖片提示、詞語插圖
- ❌ 粵拼（Jyutping）自動對照（可留手動欄位）

---

## 2. 設計原則

### 2.1 沿用本校既有約定（`reading-para` 已驗證）

| 項目 | 值 |
|---|---|
| 主色（校色） | 天空藍 `#7DD3FC`、紫 `#7c3aed`、金 `#f59e0b`、綠 `#22c55e`、紅 `#ef4444` |
| 按鈕 | `min-height:70px`、`font-size:1.4em`、`padding:18px 32px`、`border-radius:16px` |
| 小屏 fallback | `min-height:60px`、`font-size:1.2em` |
| 禁用 | `alert()` / `confirm()` / `prompt()` → 一律 in-app modal |
| 技術棧 | 純 HTML + vanilla JS，冇 framework、冇 build step |
| 部署 | GitHub Pages，單一 `index.html` |
| 資料 | 純 `localStorage`，零 backend、零雲端、零追蹤 |
| 老師端 | password gate（hash 存 localStorage） |

### 2.2 SEN 專屬原則

1. **每次只做一件事** — 學生畫面同一時間只有一個主任務（讀 / 揀文章 / 睇進度）。
2. **零計時、零倒數、零失敗** — 揀錯字只會重讀，唔會有紅叉或扣分。
3. **聲音優先** — 所有操作都有聲音回應；靜默 = 故障（見 §5.6）。
4. **正增強** — 每讀完一句，出現一句鼓勵（emoji + 語音），唔計分。
5. **觸控區 ≥ 70px**、字級 ≥ 48px、行高 ≥ 1.8（追行容易）。
6. **一鍵返回** — 任何層級都有顯眼「⬅ 返回」，唔好用瀏覽器手勢。
7. **字可以撳到，詞都可以撳到** — 同一個互動，兩種粒度。

---

## 3. 使用者流程

### 3.1 老師流程

```
老師端（密碼進入）
  └─ 📄 文章
       ├─ ＋ 新文章 → 貼文 + 填標題 + 揀類型
       ├─ 標詞 → 撳字配對（§6）→ 儲存
       ├─ 發佈 / 隱藏（學生見唔見到）
       ├─ 匯出 / 匯入 JSON
       └─ 設定（語速、字級、詞優先/單字優先、粵拼提示）
```

### 3.2 學生流程

```
學生端（冇需登入）
  └─ 🏠 開始 → 📖 揀文章（大卡：標題 + 類型 + 字數）
       └─ 閱讀頁
            ├─ 逐字點讀：撳一個字 → 變大 + 發音
            ├─ 詞語點讀：撳「吃飯」→ 兩字一齊高亮 + 用粵語讀成「食飯」
            ├─ 🔊 讀全篇：自動逐個 token 串行讀，個字跟住跳
            ├─ ⏹ 停
            └─ ⬅ 返回
```

---

## 4. 資料模型

### 4.1 Article（localStorage `crArticles`）

```js
{
  id: 'a_lz7k3x',                     // nanoid
  title: '去茶餐廳',
  type: 'life',                        // life | prose | poem
  text: '我今天和爸爸媽媽去了茶餐廳吃飯。',
  words: [                             // 老師組嘅詞（按文章順序）
    { start: 10, len: 3, text: '茶餐廳' },   // 茶(10)餐(11)廳(12)
    { start: 13, len: 2, text: '吃飯' }      // 吃(13)飯(14)
  ],
  jyutping: {},                       // v2：字 → 粵拼覆寫（例：{ '和': 'wok6' }）
  audio: {},                          // v2：字/詞 → mp3 路徑覆寫（預留欄位）
  createdAt: '2026-11-10T11:36:00.000Z',
  published: true
}
```

> ⚠️ **offset 係最容易出錯嘅地方**：上例「茶餐廳」係 start=**10** 唔係 8。
> 寫錯唔會 crash，只會令詞**靜靜失效**（降級成單字）→ 學生聽唔到詞組讀音。
> 所以 §4.1 嘅校驗係必須嘅，唔係 optional。
> （2026-11-10 修正：本文早期版本寫咗 start:8 / start:11，係錯嘅。）

**索引約定（重要）**：`start` / `len` 係 **`[...text]` 嘅 code-point index**，唔係 UTF-16 offset。
理由：中文喺 BMP 唔會出事，但學生文章一旦有 emoji 或罕見字（𠮷、𨋢），UTF-16 index 會錯位。
統一用 `[...text]` 切片，則 emoji 只佔 1 格，索引永遠對得上。

**校驗（每次載入必做）**：
```js
const chars = [...article.text];
const valid = article.words.filter(w =>
  w.start >= 0 && w.start + w.len <= chars.length &&
  chars.slice(w.start, w.start + w.len).join('') === w.text
);
// 失效嘅詞 → 學生端降級成普通字，老師端標示「⚠️ 詞已失效，請重新配對」
```
> ⚠️ 呢個係關鍵防線：老師改咗文章中間嘅字，之後面所有詞嘅 index 全部錯位。
> 冇呢個校驗就會出現「食飯」變成「飯吃」咁嘅幽靈 bug，而且**唔會 crash**，只係讀錯——最難發現嗰種。

### 4.2 Runtime tokenization

載入文章時，由 `text` + `words` 生成扁平 token 陣列（渲染同發音共用同一份 truth）：

```
text:  我 今 天 和 爸 爸 媽 媽 去 了 茶 餐 廳 吃 飯 。
words:                  [茶餐廳]      [吃飯]
tokens: 我(c) 今(c) 天(c) 和(c) 爸(c) 爸(c) 媽(c) 媽(c) 去(c) 了(c)
        茶餐廳(w)  吃飯(w)  。(p)
```

| token type | 來源 | 發音 | 高亮 |
|---|---|---|---|
| `c` — 單字 | 非詞、非標點 | 讀該字（若屬某詞 → 讀整個詞，見 §5.5） | 單字 |
| `w` — 詞 | 老師配對 | 讀整個詞 | 整個詞 |
| `p` — 標點 | 標點字元集 | **唔讀** | 短暫閃一下（可選） |

標點字元集：`，。！？、；：…—「」『』（）《》〈〉`
（`」` 唔算停頓，`。！？` 先算句界。）

### 4.3 localStorage keys

| Key | 內容 | 備註 |
|---|---|---|
| `crArticles` | `Article[]` | 核心資料 |
| `crSchemaVersion` | `1` | 同 `reading-para` 一致：形狀變就 bump |
| `crSettings` | `{ rate, fontScale, wordPriority, showJyutping, showPunctFlash }` | 老師設定，學生端可覆寫 rate/fontScale |
| `crProgress` | `{ [articleId]: { lastReadAt, taps: { tokenIndex: count } } }` | 簡單進度（v2 擴充） |
| `crTeacherPassHash` | `{ salt, hash }` | SHA-256，同 `reading-para` 做法 |
| `crLastStudentId` | v2 先用（emoji 卡登入） | |

### 4.4 預設文章

內嵌 4 篇 seed（唔靠 network），第一次開 app 自動植入：

| id | 標題 | 類型 | 字數 | 重點詞 |
|---|---|---|---|---|
| `a_seed_1` | 去茶餐廳 | 生活 | 39 | 媽媽、茶餐廳、吃飯、奶茶、菠蘿包、明天 |
| `a_seed_2` | 去公園 | 生活 | 36 | 星期天、爸爸、公園、小鳥、大樹 |
| `a_seed_3` | 小雨人 | 詩歌 | 35 | 小雨滴、滴答、下雨、帶遮、公園 |
| `a_seed_4` | 生日 | 生活 | 35 | 生日、媽媽、蛋糕、生日歌、蠟燭 |

⚠️ **刻意做短（35–40 字），唔係原定嘅 50–100 字**：
中度智障學生嘅持續注意力短，句子長、詞彙多嘅文章會令佢哋攰、失去興趣。
短篇 + 具體日常名詞（茶餐廳、公園、蛋糕）先貼合佢哋嘅生活經驗。
老師可以自己貼更長嘅文章（`Teacher` 新增文章）—— 預設文章只係**起點**。

⚠️ **offset 係 code-point index**（`Array.from`），手寫好易錯
→ 呢 4 篇嘅 `start`/`len` 全部用 script 計出嚟，唔靠肉眼。
（每次改 seed 文章正文，必須重新計 + 跑 `Tokenizer.validate` 確認全部 valid。）

⚠️ **只喺 `crArticles` 完全唔存在時先植入**：
老師如果自己清空咗文章庫，唔應該又自動生返一堆出嚟（要尊重老師決定）。

Seed 文章同時係**測試 fixture** —— 每個字都喺預期 token 位置，寫守門測試時可以直接斷言
（`tests/t12-hub.test.js` T12.2 會驗證全部 seed 詞嘅 offset 有效）。

---

## 5. 學生端設計

### 5.0 四個畫面（M0/M1 已完成）

```
App.view = 'hub'          學生首頁：揀文章（大卡片 + 類型 badge + 讀咗幾多次）
        ├─ 'read'        閱讀頁：頂 bar + 閱讀區 + 讀音小卡 + 底部工具列
        ├─ 'teacher'     老師端：文章庫 / 設定（兩個 tab）
        └─ 'teacher-edit'標詞編輯器（獨立畫面 —— 切走會遺失未儲存嘅標詞）
```

- 只有 `published !== false` 嘅文章會出現喺 hub（學生見唔到老師未準備好嘅文章）
- 閱讀頁有：⬅️ 返回 / 🔊 讀全篇 / ⏹ 停 / A− / A+
- 每次開一篇文章 → `crProgress` 記低讀咗幾多次（Hub 卡片顯示）
- 老師模式入口喺 hub 底部「⚙️ 老師模式」→ **要密碼**（見 §6.4）

### 5.1 版面

```
┌────────────────────────────────────────┐
│  ⬅ 返回          去茶餐廳      ⚙ 🔊 ⏹  │   ← 頂 bar
├────────────────────────────────────────┤
│                                        │
│   我今天和爸爸媽媽去了茶餐廳吃飯。      │   ← 閱讀區（scroll）
│                                        │
│                        ┌──────────┐    │
│                        │  食 飯   │    │   ← 撳咗嘅字／詞，放大卡
│                        └──────────┘    │
├────────────────────────────────────────┤
│  🔊 讀全篇      ⏹ 停       字級 A− A+  │   ← 底部工具列
└────────────────────────────────────────┘
```

- 閱讀區：`font-size: calc(48px * var(--font-scale))`、`line-height: 1.9`、`max-width: 22em`、置中
- 字體：`"Noto Sans TC", "PingFang HK", "Microsoft JhengHei", "Heiti TC", sans-serif`
  （Windows 平板 fallback 必備 —— 學校 iPad 同 PC 都有機會）
- 背景：淺色底 + 深色字（`#1f2937` on `#f8fafc`），高對比；校色用喺按鈕同標題

### 5.2 逐字點讀（核心互動）

**行為**：
1. 學生撳一個字
2. 該字 **scale 放大 + 底色高亮 + 輕微彈跳動畫**
3. 同時用 Web Speech 讀出該字（粵語）
4. 0.6 秒後自動還原（或者一直保留到下一次點擊——建議保留，避免學生見唔到自己讀咗乜）

**放大機制（技術陷阱，唔好用改 font-size）**：

```css
.tok {
  display: inline-block;
  width: 1.15em;               /* 固定字格 → 放大唔會推走隔籬字 */
  height: 1.5em;
  line-height: 1.5em;
  text-align: center;
  vertical-align: middle;
  border-radius: .18em;
  transition: background .12s ease;
  user-select: none;           /* 避免長按選字 */
  -webkit-tap-highlight-color: transparent;
}
.tok .g {
  display: inline-block;
  transition: transform .14s cubic-bezier(.34,1.56,.64,1);
}
.tok.on { background: #fef08a; box-shadow: 0 0 0 3px #f59e0b; }
.tok.on .g { transform: scale(1.45); }
.tok.word {                    /* 詞：底部紫線 */
  width: auto;                 /* ⚠️ 多字詞唔可以跟單字用 1.15em（見下） */
  white-space: nowrap;         /* 詞唔可以喺中間斷行 */
  box-shadow: inset 0 -0.12em 0 #7c3aed;
}
.tok.word .g { width: 1.15em; text-align: center; }  /* 詞內每個字維持同一個字格 */
.tok.word.on { background: #ddd6fe; }
```

**點解唔可以直接改 `font-size`**：
- 改 font-size → 觸發 reflow → 成句字會被推開／跳動 → 中度學生睇唔到自己點咗邊個字
- `transform: scale()` → **唔參與 layout** → 鄰字唔郁，只有目標字「彈出」
- 固定 `width:1.15em` 字格保證放大後唔會蓋住鄰字嘅可見筆畫（1.45em ÷ 2 邊溢出 ≈ 0.15em，剛好等於格間隙）

**⚠️ 多字詞 token 嘅例外（2026-11-10 真 bug，T22）**：
- **單字**用固定 `width:1.15em` 字格（上面嗰條），但**多字詞**（2–4 字）**唔可以**照抄：
  詞 token 入面有 N 個 `.g`（每個 ≈ 1em），N × 1em 遠超 1.15em 嘅框 →
  啲字會喺 1.15em 闊嘅框入面「疊行」，文字溢出、互相覆蓋 →
  **學生撳唔到被蓋住嘅字**（Playwright 判定「被遮擋」→ actionability 永遠唔成立 → 測試 timeout）。
- 解法：**詞 token 用 `width:auto`（內容寬度），字格喺詞內逐字維護**（每個 `.g` 都係 `1.15em`）。
  → 每個字仍然對齊同一個網格（詞內外一致）、冇重疊，放大亦唔會推走隔籬字。
- 結構守門 **S22**（兩個分支）+ mutant **M21/M22**；Tier 2 **A6** 喺真瀏覽器驗「冇疊行、冇蓋住隔籬字」
  （jsdom 冇 layout engine → 呢類 bug 只有 Tier 2 捉得到）。

**詞（2–4 字）→ 一個 token 入面 N 個 `.g`，一齊 scale**。

**「變大」之後仲要有乜？** 對中度學生，純放大未必夠 —— 加 **彈跳 + 底色 + 圈線** 三重回饋先夠醒目。

### 5.3 詞語點讀

- 撳一個詞 token（老師配對過嘅）→ **整個詞一齊 scale + 底色**
- 讀音 = 整個詞（書面語「吃飯」經 zh-HK voice 讀成粵語「食飯」，唔係 `吃` + `飯` 兩個獨立音）
- 詞 token 默認帶紫底線，學生一眼分得出「呢個係詞」

### 5.4 連續點讀（串行讀全篇）⭐ MVP 重點

**狀態機**：

```
IDLE ──撳🔊──► PLAYING
PLAYING:
  for each token:
     ① 設 active（視覺：scale + 高亮）
     ② if token is 標點:
          等 pauseMs（，、；：→ 220ms ｜ 。！？→ 700ms）
     ③ else:
          speak(token.text, { rate })
          等 onend → 等 90ms 間隙 → 下一個
  到尾 → 停 + 鼓勵語（emoji + 語音）
任何一撳 → cancel() → IDLE
```

**關鍵實作規則**：

| 規則 | 原因 |
|---|---|
| 串行**必須**靠 `onend`，唔可以用 `setTimeout(估計長度)` | 廣東話每個字長度唔同，估計一定會 out-of-sync |
| `onerror` **一定要呼叫 `onend`** | 否則 TTS 失敗一次就**成個串行卡死喺第一個字**（最常見 bug） |
| 每次 `speak()` 前先 `speechSynthesis.cancel()` | 避免殘留 queue 疊音、避免 Chrome 15 秒 bug |
| `setTimeout` 只用嚟做「token 之間嘅間隙」同「標點停頓」 | 呢兩個係相對時間，唔使對齊語音 |
| 標點**唔送入 TTS** | 送咗會讀出「逗號」「句號」 |
| 句號停 700ms | 畀學生跟讀一次（教學重點） |
| 每次開始新串行遞增 `seqGen`；`onend` callback 先檢查 `gen === seqGen`，唔啱就直接 return | `cancel()` 喺 Chrome 會觸發 `onerror('interrupted')` → 若 `onerror` 一律推進，**中斷後會繼續讀落去**（見 T8） |

**中途中斷**：任何一次 touch/click 都 `cancel()` 並回到 IDLE。中度學生好容易亂撳，唔可以鎖死。

### 5.5 發音層設計（Web Speech API）⚠️ 本專案最大風險點

#### 5.5.1 核心實作

```js
const Voice = {
  state: 'unknown',        // unknown | ok | no-hk | unsupported
  voice: null,
  all: [],

  async init() {
    if (!('speechSynthesis' in window)) { this.state = 'unsupported'; return this.state; }
    const pick = () => {
      this.all = window.speechSynthesis.getVoices();
      this.voice =
        this.all.find(v => /^zh[-_]HK/i.test(v.lang)) ||
        this.all.find(v => /hong ?kong|cantonese|粵|粤/i.test(v.name)) ||
        null;
      this.state = this.voice ? 'ok' : 'no-hk';
      return this.state;
    };
    if (pick() === 'ok') return 'ok';
    // iOS Safari 有時唔 fire voiceschanged → 兩重保險
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(pick()); } };
      window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
      setTimeout(finish, 1500);
    });
  },

  speak(text, { rate = 0.75, onend, onerror } = {}) {
    if (!text) { onend?.(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-HK';
    if (this.voice) u.voice = this.voice;
    u.rate = rate;
    u.pitch = 1;
    u.onend = () => onend?.();
    u.onerror = (e) => { onerror?.(e); onend?.(); };   // ← 必須推進，唔會卡死
    window.speechSynthesis.speak(u);
  },

  stop() { window.speechSynthesis.cancel(); }
};
```

#### 5.5.2 已知陷阱（全部要喺守門測試覆蓋）

| # | 陷阱 | 症狀 | 對策 |
|---|---|---|---|
| T1 | `getVoices()` 首次非同步 | 首次撳冇聲 | `voiceschanged` + 1500ms timeout 雙保險；App 啟動時就 `init()` |
| T2 | `onerror` 唔推進佇列 | 串行讀卡死喺第一個字 | `onerror` 必須呼叫 `onend` |
| T3 | 冇 `cancel()` | 連撳就疊音、變亂 | 每次 speak 前 cancel |
| T4 | Chrome 長句 15 秒 bug | 讀到一半停 | 我哋逐 token 讀（短）→ 天然避開 |
| T5 | iOS 需要 user gesture | 第一次撳冇聲、第二次先有 | 頂部加「👆 撳一下開始」提示；第一次點擊當 unlock |
| T6 | 冇 zh-HK voice | 讀成普通話 / 完全冇聲 | §5.6 fallback（**唔可以靜靜冇聲**） |
| T7 | rate 太快 | 學生跟唔上 | 預設 **0.75**（比 `reading-para` 嘅 0.85 再慢），老師可調 0.6–1.0 |
| T8 | **`cancel()` 會觸發 `onerror('interrupted')`** | 中斷咗之後串行**繼續讀落去**，學生聽到一截無頭無尾嘅朗讀 | 用 **generation counter**：`seqGen++` 之後 `onend` callback 檢查 `gen === seqGen`，唔啱就 return（唔靠 error 字串判斷，跨瀏覽器穩陣） |

#### 5.5.3 多音字問題（設計上嘅核心取捨）⚠️

Web Speech 讀**孤立單字**時，粵語多音字會讀錯：

| 字 | 期望 | TTS 可能讀成 |
|---|---|---|
| 和 | wó4（同） | hok6（和） |
| 的 | dik1（結構助詞） | dik1 ✅ |
| 了 | zo2（完成） | liu5（明白） |
| 行 | haang4（銀行） | haang4 / hing2（行走） |
| 重 | cung4（重要） | cung4 / cung2（重複） |
| 長 | coeng4（長） | zoeng2（增長） |
| 得 | dak1（得閒） | dak1 / dei2（要） |
| 着 | zoek6（着衫） | zok6 |

**核心設計決策：以詞為單位發音，以字為單位視覺。**

> 撳單字時，**如果該字屬於某個詞，就讀整個詞**（TTS 有 context，讀音準確），但視覺上只係嗰個字最亮。

例子（`我今天和爸爸媽媽去了茶餐廳吃飯`）：
- 撳「吃」→ 讀 **整個詞「吃飯」**（TTS 有詞 context，正確）→ 視覺：「吃飯」兩字一齊淡紫底，「吃」最深色
- 撳「茶餐廳」→ 讀 **「茶餐廳」**
- 撳「媽」（屬於「爸爸媽媽」咁嘅詞，如果老師組咗）→ 讀整個詞

**點解唔直接讀單字？** 因為孤立單字嘅多音字錯誤率遠高於詞組，TTS 對詞嘅處理遠好過對單字。

**取捨要老師知**：學生會聽到「食飯」但見到「吃飯」，可能困惑。
→ **解法**：撳單字時，UI 同步顯示「讀音：吃飯」嘅小卡，學生知聽到嘅係邊個詞。
> ⚠️ **書面語 vs 粵語**：文章寫「吃飯」，送入 TTS 嘅**字串仍然係「吃飯」**；
> 因為 voice 係 `zh-HK`，TTS 會用廣東話讀成「食飯」。
> 所以讀音小卡顯示**書面語**，唔好改成「食飯」——學生見到嘅字要同文章一致先唔會混淆。
→ 再加一個老師設定掣：**「詞優先 / 單字優先」**（預設詞優先），老師可以按需要切換。

**殘留限制（誠實記錄）**：孤立字冇詞包住（例如句尾嘅「了」）仍然可能讀錯。
Web Speech API **唔支援 phoneme / SSML 覆寫** → 冇辦法喺 runtime 修正讀音。
唯一真解 = 預生成 mp3 或老師錄音 → 已喺 schema 預留 `audio` 欄位（v2）。

### 5.6 冇語音時嘅行為（絕對唔可以靜靜冇聲）

`reading-para` 已知 F4 問題：TTS 失敗冇提示，學生以為自己撳錯。呢度要做得更嚴：

| `Voice.state` | 學生端行為 |
|---|---|
| `ok` | 正常 |
| `no-hk` | 頂部出現黃色橫幅：「⚠️ 呢部裝置冇廣東話語音，讀唔到。請聯絡老師。」+ 提供「用普通話試讀」按鈕（用任何 `zh-*` voice） |
| `unsupported` | 紅色橫幅：「呢個瀏覽器唔支援語音。請用 Safari / Chrome 開啟。」 |

同時老師端 Dashboard 出現「⚠️ 有 N 部裝置冇 zh-HK voice」（v2，跨裝置上報；v1 淨係本機提示）。

### 5.7 無障礙

| 項目 | 做法 |
|---|---|
| 對比度 | 正文 ≥ 7:1（WCAG AAA 級）；高亮底色配深字 |
| 觸控 | 觸控區 ≥ 70px；字格點擊區 = 字格本身（1.15em × 1.5em ≈ 70×105px @48px） |
| 鍵盤 | 所有操作可用 Tab + Enter；focus ring 清晰（`outline: 3px solid #7c3aed`） |
| Screen reader | 文字區 `aria-live="polite"`，讀到邊個字就 announce（配合 `role="status"`） |
| 唔靠顏色單獨傳意 | 放大 + 底色 + 動畫三重回饋；詞另外有底線 |
| `prefers-reduced-motion` | 關彈跳動畫，只留底色 + scale |
| 圖示 | 全部 emoji + 文字標籤（萬一學生唔識圖示） |

### 5.8 進度記錄（v1 極簡）

`crProgress[articleId] = { lastReadAt, taps: { [tokenIndex]: count } }`
- 用途：老師知道邊啲字學生撳得多（= 難字），可以加強教學
- **唔做個人檔案**（單機/班機，冇 student id）

---

## 6. 老師端：點字配對組詞

### 6.1 互動流程

```
「＋ 新文章」→ 貼 text + 填標題 → 「儲存並標詞」
   ↓
標詞模式（同一個畫面，token 全部變成可撳）
   ↓
撳第 1 個字  → 藍底 + 頂部提示「再撳第 2 個字，組成一個詞」
撳第 2 個字  → 兩個字合併成「詞 token」（紫底線）
   ↓
再撳已組嘅詞 → 彈出小面板：「✂️ 取消合併」「➕ 延長一字」
   ↓
「➕ 延長一字」→ 再撳詞旁邊嗰個字 → 個詞加長一個字（可以重複）
   ↓
「✂️ 拆開全部詞」按鈕（批量復原）
   ↓
「💾 儲存」
```

### 6.2 互動細節

- 撳字時必須 `user-select: none` + `preventDefault`，否則 iPad 長按會彈出「選擇/複製」選單，擋住操作
- 組詞嘅兩個字**必須相鄰**；唔相鄰 → 拒絕 + toast「要揀相鄰嘅字㗎」
- 第二個字如果已經屬於另一個詞 → 拒絕 + toast「呢個字已經喺『XXX』入面㗎」
- 標點唔可以參與組詞 → toast「標點唔可以組詞」
- 詞長 2–4 字；>4 字要二次確認（防止手滑連按）→ `Modal.askConfirm()`
- 支援**詞語清單側欄**：列出所有詞，可逐個刪除、可以睇整篇文章有咩重點詞

### 6.2.1 「延長一字」模式（明確模式，唔自動延長）⚠️

3 字以上嘅詞（例如「茶餐廳」）喺兩字配對模型之下**組唔到**。
解法係一個**明確嘅延長模式**，唔係「撳完自動延伸」：

| 步驟 | 老師做咗乜 | 系統 |
|---|---|---|
| 1 | 撳「茶」→「餐」 | 組咗 2 字詞「茶餐」 |
| 2 | 撳返「茶餐」 | 顯示面板（`✂️ 取消合併` / `➕ 延長一字`） |
| 3 | 撳「➕ 延長一字」 | 進入延長模式，提示「撳『茶餐』旁邊嘅字，就可以延長個詞」 |
| 4 | 撳「廳」 | 個詞變成「茶餐廳」（3 字） |

規則：
- 延長模式**淨係接受詞旁邊嘅字**（`start === pos+1` 或 `start+len === pos`）
  → 撳錯位置 → toast「要撳詞旁邊嘅字先可以延長」，個詞唔變
- 延長後長度 >4 → 一樣要 `Modal.askConfirm()` 二次確認
- 延長模式開咗之後撳第一下就會退出（一次延長 = 一步），避免手滑連按

⚠️ **點解唔做「自動延長」**：
如果撳完第二個字自動向後延伸，「茶餐廳」之後想再組「吃飯」就會出錯
（自動延長會吞咗「廳」）。明確模式每次都係老師主動決定，行為可預測。

### 6.2.2 確認框命名 ⚠️

`Modal.askConfirm()` —— **唔可以叫 `confirm()`**。
原因：靜態守門 S19 要偵測原生 `confirm(` 呼叫，
如果我哋自己嘅方法都叫 `confirm`，偵測 regex 會撞名（假陽性），
而且「我哋自己嘅 confirm」同「原生 confirm」喺 code review 時根本分唔出。

同理，**任何 in-app 取代原生 API 嘅 wrapper 都要改名**：
`askConfirm`（唔係 `confirm`）、`Toast.show`（唔係 `alert`）。


### 6.3 老師端其他

| 功能 | v1 |
|---|---|
| 文章 CRUD（新增/編輯/刪除） | ✅ |
| 發佈 / 隱藏 | ✅（學生端只見到 published） |
| 匯出 / 匯入 JSON | ✅（跨裝置搬文章；匯出可下載 / 複製，匯入貼 JSON） |
| 設定：語速、字級、詞優先 | ✅ |
| 重設密碼 | ✅ |
| 文章使用統計（幾多次被讀） | ✅（簡單：讀咗幾多次） |
| 學生個人檔案 / Dashboard | ❌ v2 |

### 6.4 「老師即場輸入文章」流程 ⭐

老師喺教室即場貼一篇文章出嚟，學生即刻可以讀：

```
老師模式 → ＋ 新文章
   ↓
[標題] [類型：生活／散文／詩歌]
[文章內容]  ← 直接長按貼上（或撳「📋 貼上」由剪貼簿讀）
  123 字     ← 字數計數（code point，emoji 當 1 個字）
[✨ 開始標詞]（可撳可唔撳）
   ↓
[💾 儲存文章]  ← **一直喺度，唔使先開始標詞**
   ↓
回到文章庫 → 學生喺 Hub 就見到新文章
```

⚠️ **儲存掣唔可以只喺「開始標詞」之後先出現**：
老師好多時只想快快貼完文章出嚟，標詞可以返去慢慢做。
→ 儲存掣同標詞區**解耦**：標詞係可選嘅增值功能，唔係儲存嘅前置條件。

⚠️ **內容係空嘅唔可以儲存**（會產生一篇空文章，學生撳落去乜都冇）。

⚠️ **儲存完要話俾老師知有冇標詞**：
「已儲存（5 個詞）」vs「已儲存（未標詞，學生會逐個字讀）」
→ 老師唔會以為標咗詞，但其實學生係逐個字讀。

### 6.5 字級控制

| 位置 | 控制 |
|---|---|
| 老師端「⚙️ 設定」 | slider（**0.7 – 2.0**，**每格 5%**）+ 4 個預設掣：細(85%)／標準(100%)／大(130%)／特大(170%) |
| 閱讀頁工具列 | `A−` / `A+`（每撳 5%）+ 顯示目前百分比 |

⚠️ **點解咁細步（5%）**：中度學生對字級好敏感，10% 一跳大細差好多，
逐級微調先可以搵到「啱」嘅大細。預設掣就係俾老師快速調到常用大細。

⚠️ **範圍同步長係單一真相來源**（`FONT_SCALE_MIN` / `MAX` / `STEP`），
slider、預設掣、閱讀頁掣三處共用，唔准各寫各的。

### 6.6 老師密碼 gate

| 項目 | 值 |
|---|---|
| 預設密碼 | `230714`（2026-11-10 老師指定；⚠️ 唔同 sibling `reading-para` 嘅 `Hcwmc`） |
| 演算法 | SHA-256（**自己實作**，唔用 `crypto.subtle`） |
| Salt | 每次安裝隨機 16 bytes（`crTeacherPassHash` 存 `{salt, hash}` JSON） |
| 最短長度 | 5 個字元 |
| 輸入方式 | in-app modal（`Modal.askText`，`type=password`）—— **唔可以用原生 `prompt()`** |
| 作用範圍 | 只喺當前分頁有效（reload 要再入） |

⚠️ **點解自己實作 SHA-256（唔用 `crypto.subtle`）**：
`crypto.subtle` 只喺 **secure context**（`https://` 或 `localhost`）先有。
學校如果用 `http://192.168.x.x` 開本機伺服器（好常見），瀏覽器會**完全冇** `crypto.subtle`
→ 密碼 gate 死掉，老師入唔到。jsdom 測試環境亦都冇。
→ 自己實作約 60 行、零依賴，任何環境都跑得。
（結構斷言 S20 + mutant M17/M18 守住呢個決定。）

⚠️ **呢個唔係「真安全」**：目標係**阻擋學生誤入老師模式**（改咗文章、睇到設定），
唔係防 Hacking —— localStorage 本来就係明文可讀，前端 hash 只係唔好咁容易撞見。
真正嘅安全要靠後端（呢個專案係零 backend，係刻意取捨）。

---

## 7. 技術架構

### 7.1 檔案結構

```
chinese-reading/
├── index.html          # 單檔 SPA（inline CSS + JS）
├── data/
│   └── seed-articles.json   # 預設文章（可選，唔用 network 都能跑）
├── docs/
│   ├── DESIGN.md       # ← 本文件
│   └── TEST-PLAN.md    # 守門測試計劃
├── AGENTS.md           # 實作後寫（resumability doc）
└── README.md
```

> **單檔原則**：跟 `reading-para` 一致，零 build、零依賴、可以雙擊打開、可以 host 喺任何 static server。

### 7.2 狀態管理

純 vanilla，模組式單例（`App` / `Voice` / `Store` / `Reader` / `Teacher`），
無框架。狀態喺 `localStorage`，記憶體只保留當前文章嘅 token 陣列。

### 7.3 關鍵模組職責

| 模組 | 職責 |
|---|---|
| `Store` | localStorage 讀寫、schema version、遷移 |
| `Voice` | Web Speech 封裝、voice 偵測、fallback（§5.5.1） |
| `Tokenizer` | `text` + `words` → token 陣列 + 有效性校驗（§4.1） |
| `Reader` | 學生端渲染、點擊處理、串行播放狀態機（§5.4） |
| `Teacher` | 老師端 CRUD、標詞配對互動、匯入匯出 |
| `Modal` / `Toast` | 取代 `alert/confirm/prompt`（SEN 原則 §2.1） |

### 7.4 部署

- GitHub Pages：`https://ihateusingai-beep.github.io/chinese-reading/`
- 老師 iPad 加到主畫面（PWA manifest + iOS `apple-touch-icon`）
- 零 backend、零 API key、零追蹤（⚠️ 見 §9 私隱注意）

---

## 8. 里程碑

| 階段 | 內容 | 產出 | 狀態 |
|---|---|---|---|
| **M0 Scaffold** | 專案結構、校色、字體、App shell、Hub 頁、老師密碼 gate | 見到兩個 entry | ✅ 2026-11-10 |
| **M1 MVP** ⭐ | 貼文 + 標詞配對 + 逐字點讀 + 詞語點讀 + **連續讀全篇** + 語速/字級設定 + 冇語音 fallback | 完整可用流程 | ✅ 2026-11-10（仲差部署 + 實機測試） |
| **M2 管理** | 學生個人檔案、詞語清單抽屜、粵拼提示、鼓勵語設定、匯出/匯入 UI 打磨 | 老師日常用得順 | ⬜ |
| **M3 教學增強** | 認字測驗（簡單版）、重點詞高亮模式 | 教學深度 | ⬜ |
| **v2 展望** | 錄音跟讀、`audio` 欄位（mp3 / 老師錄音覆寫）、圖片提示、與 `reading-para` 打通 | — | ⬜ |

⚠️ **M1 仲差一樣嘢**：
**學校實機測試**（iPad + Windows 平板）—— 驗證 **R1**（裝置有冇 zh-HK voice）。
呢個係 M1 ship 嘅硬門檻：冇驗證過就唔知發音層會唔會喺學校機房死掉。

✅ 已部署：https://ihateusingai-beep.github.io/chinese-reading/（GitHub Pages，公開 repo）
⚠️ 線上版本**未經學校實機驗證**（2026-11-10 部署時 R1 未確認）。

---

## 9. 風險與對策

| # | 風險 | 影響 | 對策 |
|---|---|---|---|
| R1 | 裝置冇 zh-HK voice（Windows 平板機會較常見） | 學生完全讀唔到 | §5.6 明確橫幅 + 普通話 fallback + 老師端提示；v1 交付前用學校實際裝置測 |
| R2 | Web Speech API 支援度參差（Firefox / 部分 Android WebView） | 讀唔到 | §5.6 明確報錯 + 建議 Safari/Chrome；v2 `audio` 欄位可完全脫離 Web Speech |
| R3 | **Chrome 桌面版會把 TTS 文字送去 Google 伺服器** | ⚠️ 私隱 | 見下方詳述 |
| R4 | 多音字讀錯 | 學生學錯音 | §5.5.3 詞優先 + 讀音小卡 + 設定掣；殘留限制已記錄 |
| R5 | 老師改文 → 詞 index 錯位 | 幽靈 bug（讀錯但唔 crash） | §4.1 載入校驗 + 老師端失效提示 |
| R6 | 中度學生注意力窗口短 | 學生失去興趣 | 每句 ≤ 25 字、鼓勵語、隨時可停、唔計分 |
| R7 | 學校 Wi-Fi 唔穩 | 頁面載入唔到 | 單檔零依賴；所有 asset inline；可離線行（除語音） |

### ⚠️ R3 私隱詳述（要老師知）

| 瀏覽器 | TTS 文字去向 |
|---|---|
| Safari（macOS / iPadOS） | **本機語音引擎**，唔外傳 ✅ |
| Chrome（桌面） | 送到 Google 伺服器 → **文字離開裝置** ⚠️ |
| Chrome（部分版本） | 本機 voices 亦有，視乎 voice 來源 ⚠️ |

`reading-para` 之所以敢寫「零私隱風險」，係因為佢嘅 TTS mp3 係 **build 時預生成、本地 bundled**。
本專案改用 Web Speech 實時讀 → 呢個 guarantee 唔再成立。

**緩解措施（v1 必須做）**：
1. 預設文章**唔好包含學生姓名／身份資料**；老師端加提示：「⚠️ 請勿喺文章內寫學生全名（Chrome 會將讀出嘅文字送去 Google）」。
2. 老師端設定加一個「只用 Safari／本機語音」提示。
3. v2 `audio` 欄位 → 預生成 mp3 即可完全回到「零外傳」。

---

## 10. 驗收標準（MVP 可測）

### 10.1 互動

| # | 標準 | 測法 |
|---|---|---|
| A1 | 撳單字 → 該字 scale ≥ 1.4x + 高亮 + 播放粵語 | 實機手動 + DOM 斷言 `classList.contains('on')` |
| A2 | 撳單字 **唔會** 令成句字重排 | 記錄相鄰字 `getBoundingClientRect().left` 撳前撳後相同 |
| A3 | 撳詞 → 兩個字同度高亮 + 讀出整個詞 | 斷言兩個 `.g` 同時 `.on`，且 speak 收到完整詞字串 |
| A4 | 撳第 1 字 → 出現「再撳第 2 個字」提示 | DOM 斷言 |
| A5 | 組詞時撳標點 / 撳非相鄰字 → 拒絕 + toast | DOM 斷言 toast 出現 |
| A6 | 已屬於另一詞嘅字 → 拒絕 + toast | DOM 斷言 |
| A7 | 「拆開全部詞」→ 全部還原成單字 | 斷言 tokens 全部 `type==='c'` |
| A8 | 老師改文令詞失效 → 學生端降級成單字（唔 crash） | 改 `text` 令 offset 錯位，斷言仍可渲染 |

### 10.2 串行播放

| # | 標準 | 測法 |
|---|---|---|
| B1 | 每個 token 高亮時機 == 該 token 嘅 `onend` 之前 | mock `speechSynthesis`，記錄 speak/end 序列 |
| B2 | `onerror` 觸發後**仍會**推進去下一個 token | mock 令第一個 token throw → 斷言最後一個 token 有被 speak |
| B3 | 標點唔會被送入 TTS | mock 記錄所有 `speak()` 入參 → 斷言無標點字元 |
| B4 | 句號停頓 ≥ 600ms，逗號 ≥ 180ms | mock timestamp |
| B5 | 讀完最後一個 token 出現鼓勵語 | DOM 斷言 |
| B6 | 播放中再撳 → 立即停 | mock 斷言 `cancel()` 被呼叫 |

### 10.3 語音層

| # | 標準 | 測法 |
|---|---|---|
| C1 | `getVoices()` 首次空 → 仍能喺 timeout 後解析到 voice | mock 空 array → voiceschanged |
| C2 | 冇 zh-HK voice → 顯示黃色橫幅（非靜默） | mock `no-hk` → DOM 斷言橫幅存在 |
| C3 | 唔支援 `speechSynthesis` → 顯示紅色橫幅 | mock 刪 `window.speechSynthesis` → DOM 斷言 |
| C4 | `u.lang` 恆為 `'zh-HK'` | mock 攔截 utterance |
| C5 | 預設 rate = 0.75 | mock 攔截 utterance |

### 10.4 無障礙 / SEN

| # | 標準 | 測法 |
|---|---|---|
| D1 | 所有可撳元素觸控區 ≥ 70px | axe + 程式化 rect 量測 |
| D2 | 對比度 ≥ 7:1 | axe-core（serious/critical） |
| D3 | 無 `alert()` / `confirm()` / `prompt()` | grep |
| D4 | `prefers-reduced-motion` 下關閉彈跳 | 程式化切換 media query |
| D5 | 字級可由 48px 調到 80px | 設定掣 → computed style 斷言 |

---

## 11. 明確唔做（v1 範圍外）

- 錄音、跟讀評分、ASR、Whisper
- 認字測驗、計分、星星、獎狀
- Dashboard、PDF 報告、學生個人檔案、emoji 卡登入
- 圖片提示、詞語插圖
- 粵拼自動對照（`pingyam-js` 可留待 v3 手工欄位）
- 雲端同步 / 老師雲端後台（v1 係 localStorage + JSON 匯入匯出）
- PWA 離線快取（可加，但非必要）

---

## 12. 下一步

1. ✅ 構思定稿（本文檔）
2. ⬜ 寫 `docs/TEST-PLAN.md`（把 §10 展開成具體測試 case + mutant set）
3. ⬜ M0 Scaffold：專案結構 + 校色 + App shell + Hub + 密碼 gate
4. ⬜ M1 MVP：貼文 → 標詞 → 三種點讀
5. ⬜ 學校實機測試（iPad + Windows 平板各一部）—— **驗證 R1 係咪真實存在**

> ⚠️ 實機測試要喺 M1 尾做，唔好等到 v2。R1（冇 zh-HK voice）如果真係常見，
> 成個方案的發音層要即刻重新設計（可能直接轉預生成 mp3）。
