// ==================== tests/structural.js ====================
// 結構斷言 —— **唯一真相來源**。
//
// 正式測試斷言 structuralFails(realSrc) 係空；mutant 測試斷言同一個函式
// 對改壞嘅 src 會 fail。兩邊共用同一個函數 → 唔可能出現「正式版全綠但 mutant 唔紅」。
// 見 docs/TEST-PLAN.md §6.1 / §6.3
//
// ⚠️ 每加一個新斷言，必須同時喺 tests/mutants.js 加對應 mutant，
//    否則 T10 meta-test 會紅。

/** 已實作嘅結構斷言 ID（每個都必須有 mutant 對應） */
export const ASSERTION_IDS = ['S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S17', 'S18', 'S19', 'S20', 'S21'];

/**
 * 剝走註解（保留字串內容）。
 * 用途：靜態斷言唔可以被註解入面嘅字串騙到
 * （例如註解寫「唔可以用 alert()」但 code 其實有 alert()）。
 */
export function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, '$1');
}

/**
 * 偵測原生對話框呼叫（alert / confirm / prompt）。
 *
 * ⚠️ 兩個寫法都要捉：
 *   1. 裸呼叫 `alert(...)`  —— 前面唔可以係 `.` 或字元（例如 `Modal.confirm(...)` 唔算）
 *   2. `window.alert(...)` —— 前面有 `.`，第一條規則會漏掉，所以要特登加多一條
 *
 * 註解唔算（stripComments 先剝走）—— 否則「⚠️ 唔可以用 alert()」呢句註解會令自己紅。
 *
 * ⚠️ 呢個函數係 S19 同 T6.5 嘅**唯一真相來源** —— 兩邊共用，
 *    免得靜態守門同行為測試嘅 regex 走樣（走樣 = 有一邊形同冇）。
 *
 * @param {string} src  index.html 全文（或 mutated 版本）
 * @returns {string[]} 命中嘅原生呼叫（空陣列 = 乾淨）
 */
export function nativeDialogCalls(src) {
  const code = stripComments(src);
  return code.match(/(?<![.\w])(alert|confirm|prompt)\s*\(|window\s*\.\s*(alert|confirm|prompt)\s*\(/g) || [];
}

/**
 * 檢查 source 有冇違反結構規則。
 * @param {string} src  index.html 全文（或 mutated 版本）
 * @returns {string[]} 失敗訊息（空陣列 = 全部通過）
 */
export function structuralFails(src) {
  const fails = [];
  const fail = (id, msg) => fails.push(`${id}: ${msg}`);
  // 剝走註解一次，全函數共用（靜態斷言唔可以被註解入面嘅字串騙到）
  const codeNoComment = stripComments(src);

  // ---- CSS 段（放大機制）----
  const styleStart = src.indexOf('<style>');
  const styleEnd = src.indexOf('</style>');
  const css = (styleStart >= 0 && styleEnd > styleStart) ? src.slice(styleStart, styleEnd) : '';

  // ---- S2：放大必須用 transform: scale，唔可以用 font-size ----
  // 改 font-size 會觸發 reflow → 成句字被推開 → 學生睇唔到自己撳咗邊個字（DESIGN §5.2）
  if (!css) {
    fail('S2', '搵唔到 <style> 段');
  } else {
    if (!/transform\s*:\s*scale\(/.test(css)) {
      fail('S2', '放大必須用 transform: scale()');
    }
    const onRules = css.match(/[^{}]*\.on[^{}]*\{[^}]*\}/g) || [];
    if (onRules.some(r => /font-size\s*:/.test(r))) {
      fail('S2', '放大規則唔可以用 font-size（會令成句重排），要用 transform: scale()');
    }
  }

  // ---- S3：.tok 必須有固定 width ----
  // 字格固定 → 放大唔會推走隔籬字（DESIGN §5.2）
  const tokRule = (css.match(/\.tok\{([^}]*)\}/) || [])[1] || '';
  const mWidth = tokRule.match(/width\s*:\s*([^;]+);/);
  if (!mWidth) {
    fail('S3', '.tok 必須有固定 width（字格）');
  } else if (/auto/.test(mWidth[1])) {
    fail('S3', '.tok 唔可以用 width:auto（放大會推走隔籬字）');
  }

  // ---- S4：u.onerror 必須呼叫 onend ----
  // 否則 TTS 失敗一次就成個串行卡死喺第一個字（DESIGN §5.5.2 T2）
  const mOnErr = src.match(/u\.onerror\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\};/);
  if (!mOnErr) {
    fail('S4', '搵唔到 u.onerror 嘅 handler');
  } else if (!/\bonend\b/.test(mOnErr[1])) {
    fail('S4', 'u.onerror 必須呼叫 onend，否則 TTS 失敗一次就卡死喺第一個字');
  }

  // ---- S6：speak() 必須先 cancel() 再 speak() ----
  // 否則殘留 queue 會疊音（DESIGN §5.5.2 T3）
  const iSpeakFn = src.indexOf('speak(text');
  const iStopFn = src.indexOf('stop()');
  const seg = (iSpeakFn >= 0 && iStopFn > iSpeakFn) ? src.slice(iSpeakFn, iStopFn) : '';
  if (!seg) {
    fail('S6', '搵唔到 speak() / stop() 嘅 source 段');
  } else {
    const iCancel = seg.indexOf('speechSynthesis.cancel()');
    const iSpeakCall = seg.indexOf('speechSynthesis.speak(u)');
    if (iCancel < 0) {
      fail('S6', 'speak() 必須先 speechSynthesis.cancel()，否則會疊音');
    } else if (iCancel > iSpeakCall) {
      fail('S6', 'cancel() 必須喺 speechSynthesis.speak() 之前');
    }
  }

  // ---- S7：generation counter ----
  // cancel() 會觸發 onerror('interrupted') → 冇 guard 就會喺中斷後繼續讀落去（DESIGN §5.5.2 T8）
  if (!/\+\+this\.seqGen/.test(src)) {
    fail('S7', '必須有 generation counter（++this.seqGen），否則取消後會繼續讀落去');
  }
  const genChecks = (src.match(/gen !== this\.seqGen/g) || []).length;
  if (genChecks < 2) {
    fail('S7', `onend 同 onerror 都要檢查 gen !== this.seqGen（而家只有 ${genChecks} 處）`);
  }

  // ---- S8：語言必須係粵語 ----
  if (!/u\.lang\s*=\s*'zh-HK'/.test(src)) {
    fail('S8', "u.lang 必須係 'zh-HK'，否則會用錯語言");
  }

  // ---- S9：預設語速 ----
  // 中度學生要比正常慢（DESIGN §5.5.2 T7）
  if (!/const DEFAULT_SPEECH_RATE = 0\.75;/.test(src)) {
    fail('S9', '預設語速常數必須係 0.75（中度學生要比正常慢）');
  }

  // ---- S10：voiceschanged ----
  // getVoices() 首次係非同步，冇事件就永遠攞唔到 voice（DESIGN §5.5.2 T1）
  if (!/'voiceschanged'/.test(src)) {
    fail('S10', '必須監聽 voiceschanged，否則首次撳冇聲');
  }

  // ---- S11：timeout 兜底 ----
  // iOS Safari 有時唔 fire voiceschanged（DESIGN §5.5.2 T1）
  if (!/setTimeout\(\s*finish\s*,\s*1500\s*\)/.test(src)) {
    fail('S11', '必須有 1500ms timeout 兜底');
  }

  // ---- S5：串行推進必須靠完成回調（onend），唔可以用 setTimeout 估字長 ----
  // 中文字長唔同，估時長一定 out-of-sync；靠回調先同步得到
  const seqStart = src.indexOf('const Sequence = {');
  const seqEnd = src.indexOf('const Reader = {');
  const seqSrc = (seqStart >= 0 && seqEnd > seqStart) ? src.slice(seqStart, seqEnd) : '';
  if (!seqSrc) {
    fail('S5', '搵唔到 Sequence 模組嘅 source 段');
  } else if (!/onend\s*:/.test(seqSrc)) {
    fail('S5', 'Sequence 必須靠完成回調（onend）推進串行，唔可以用 setTimeout 估字長');
  }

  // ---- S18：Sequence._afterSpeech 必須有 generation guard ----
  // 防禦縱深：Voice 自己都有 guard，但万一 Sequence.stop() 冇 cancel 語音，
  // 語音自然完結就會推進到下一輪 → 學生聽到一截無頭無尾嘅朗讀
  if (!/_afterSpeech\(gen\)\s*\{\s*if\s*\(\s*gen\s*!==\s*this\._gen\s*\)\s*return;/.test(seqSrc)) {
    fail('S18', 'Sequence._afterSpeech 必須有 generation guard（gen !== this._gen）');
  }

  // ---- S17：Tokenizer 必須用 code-point index ----
  // split('') / text.slice() 切嘅係 UTF-16 code unit → emoji／生僻字被拆爛
  // → 之後所有詞 offset 錯位（幽靈 bug）。DESIGN §4.1
  const tokStart = src.indexOf('const Tokenizer = {');
  const tokEnd = src.indexOf('const Reader = {');
  const tokSrc = (tokStart >= 0 && tokEnd > tokStart) ? src.slice(tokStart, tokEnd) : '';
  if (!tokSrc) {
    fail('S17', '搵唔到 Tokenizer 模組嘅 source 段');
  } else {
    if (!/Array\.from\(\s*text\s*\|\|\s*''\s*\)/.test(tokSrc)) {
      fail('S17', "Tokenizer 必須用 Array.from(text || '') 攞 code-point 陣列");
    }
    if (/\.split\(\s*''\s*\)/.test(tokSrc)) {
      fail('S17', "Tokenizer 唔可以用 split('')：UTF-16 code unit 會令 emoji 拆爛、offset 錯位");
    }
  }

  // ---- S19：唔可以用原生 alert / confirm / prompt ----
  // SEN 原則：原生彈窗會令學生 / 老師措手不及，一律用 in-app modal / toast
  const nativeCalls = nativeDialogCalls(src);
  if (nativeCalls.length) {
    fail('S19', `唔可以用原生 ${nativeCalls.join(', ')}（SEN 原則：一律用 in-app modal / toast）`);
  }

  // ---- S20：密碼 hash 一定要用自己實作嘅 SHA-256，唔可以用 crypto.subtle ----
  // ⚠️ `crypto.subtle` 只喺 **secure context**（https:// 或 localhost）先有：
  //    學校用 `http://192.168.x.x` 開嘅本機伺服器會**完全冇** → 密碼 gate 死掉，
  //    而且 jsdom 測試環境亦都冇 → 自己實作係唯一穩陣做法。
  const shaStart = src.indexOf('const Sha256 = {');
  const shaEnd = src.indexOf('const Auth = {');
  const shaSrc = (shaStart >= 0 && shaEnd > shaStart) ? src.slice(shaStart, shaEnd) : '';
  if (!shaSrc) {
    fail('S20', '搵唔到 Sha256 模組嘅 source 段');
  } else {
    if (!/0x6a09e667/.test(shaSrc)) {
      fail('S20', 'Sha256 必須自己實作（要見到 SHA-256 初始 hash 常數 0x6a09e667）');
    }
    if (/crypto\s*\.\s*subtle/.test(codeNoComment)) {
      fail('S20', '唔可以用 crypto.subtle（http:// 環境冇 secure context → 老師密碼 gate 會死掉）');
    }
  }

  // ---- S21：所有 localStorage key 都必須用 cr* 前綴 ----
  // ⚠️ T8.4（行為測試）只查 `Store.KEY_*` 常數嘅**值**；
  //    如果有人寫 `localStorage.setItem('yueSettings', ...)` 呢種 inline literal，
  //    T8.4 捉唔到 → 會撞 sibling `reading-para` 嘅資料。
  //    → 所以呢度要掃兩個地方：KEY_* 常數 + inline literal。
  const badKeys = [];
  const lsKeyRe = /localStorage\.(?:getItem|setItem|removeItem)\s*\(\s*['"]([^'"]+)['"]/g;
  const constKeyRe = /\bKEY_[A-Z_]+\s*:\s*['"]([^'"]+)['"]/g;
  let km;
  while ((km = lsKeyRe.exec(codeNoComment)) !== null) {
    if (!/^cr[A-Z]/.test(km[1])) badKeys.push(km[1]);
  }
  while ((km = constKeyRe.exec(codeNoComment)) !== null) {
    if (!/^cr[A-Z]/.test(km[1])) badKeys.push(km[1]);
  }
  if (badKeys.length) {
    fail('S21', `localStorage key 必須用 cr* 前綴（唔會撞 reading-para 嘅 yue*）：${badKeys.join(', ')}`);
  }

  return fails;
}
