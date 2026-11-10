// ==================== tests/mutants.js ====================
// Mutant set：故意改壞 source，證明結構守門真係守得住。
//
// 規則（docs/TEST-PLAN.md §6.1）：
//   1. 每個結構斷言至少一個 mutant
//   2. mutant 同正式斷言共用 structuralFails()
//   3. 一律喺記憶體改 source，唔好寫落磁盤
//   4. from 字串必須喺 source 出現**恰好一次**（否則會改錯地方 → 假陽性）
export const MUTANTS = [
  {
    id: 'M2',
    covers: ['S5'],
    from: '      onend: () => { this._afterSpeech(gen); },',
    to: '      onboom: () => { this._afterSpeech(gen); },',
    why: '串行唔靠完成回調 → 卡死喺第一個字',
  },
  {
    id: 'M1',
    covers: ['S4'],
    from: '      onerror?.(e);\n      onend?.();',
    to: '      onerror?.(e);',
    why: 'onerror 唔推進 → 串行讀卡死喺第一個字',
  },
  {
    id: 'M3',
    covers: ['S6'],
    from: '    window.speechSynthesis.cancel();\n    const u = new SpeechSynthesisUtterance(text);',
    to: '    const u = new SpeechSynthesisUtterance(text);',
    why: '冇 cancel() → 疊音',
  },
  {
    id: 'M4',
    covers: ['S7'],
    from: '    const gen = ++this.seqGen;',
    to: '    const gen = 0;',
    why: '冇 generation counter → 取消後會繼續讀落去',
  },
  {
    id: 'M5',
    covers: ['S8'],
    from: "    u.lang = 'zh-HK';",
    to: "    u.lang = 'zh-CN';",
    why: '唔係粵語 → TTS 讀成普通話',
  },
  {
    id: 'M6',
    covers: ['S9'],
    from: 'const DEFAULT_SPEECH_RATE = 0.75;',
    to: 'const DEFAULT_SPEECH_RATE = 1;',
    why: '語速太快 → 學生跟唔上',
  },
  {
    id: 'M7',
    covers: ['S10'],
    from: "      window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });",
    to: '',
    why: '冇 voiceschanged → 首次撳冇聲',
  },
  {
    id: 'M8',
    covers: ['S11'],
    from: '      setTimeout(finish, 1500);',
    to: '',
    why: '冇 timeout 兜底 → 永遠攞唔到 voice',
  },
  {
    id: 'M9',
    covers: ['S17'],
    // ⚠️ 必須錨定 Tokenizer 嘅 `_chars()`：Teacher 都有 `Array.from(text || '')`，
    //    如果淨係用呢句做 from 字串 → 喺 source 出現 2 次 → 會改錯地方（假陽性）。
    from: "  _chars(text) {\n    return Array.from(text || '');",
    to: "  _chars(text) {\n    return (text || '').split('');",
    why: '用 UTF-16 code unit 切字 → emoji 拆爛、詞 offset 全部錯位',
  },
  {
    id: 'M12',
    covers: ['S18'],
    from: '  _afterSpeech(gen) {\n    if (gen !== this._gen) return;',
    to: '  _afterSpeech(gen) {',
    why: '冇 generation guard → 語音自然完結時會錯誤推進下一輪',
  },
  {
    id: 'M13',
    covers: ['S2'],
    from: '.g.on{transform:scale(1.45)}',
    to: '.g.on{font-size:1.45em}',
    why: '用 font-size 放大 → 觸發 reflow，成句字被推開，學生睇唔到撳咗邊個字',
  },
  {
    id: 'M15',
    covers: ['S19'],
    from: 'const Toast = {',
    to: "alert('mutant');\nconst Toast = {",
    why: '用原生 alert() → 學生畫面彈出原生視窗，違反 SEN 原則',
  },
  {
    id: 'M16',
    covers: ['S19'],
    from: 'const Modal = {',
    to: "window.alert('mutant');\nconst Modal = {",
    why: '用 window.alert() → 前面前面有 "."，淨係靠裸呼叫規則會漏掉（要獨立守門）',
  },
  {
    id: 'M14',
    covers: ['S3'],
    from: '.tok{display:inline-block;width:1.15em;',
    to: '.tok{display:inline-block;width:auto;',
    why: '字格唔固定 → 放大會推走隔籬字',
  },
  {
    id: 'M17',
    covers: ['S20'],
    from: '0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,',
    to: '0x6a09e668, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,',
    why: '改壞 SHA-256 初始 hash 常數 → 密碼 hash 全部唔啱（好難靠肉眼發現）',
  },
  {
    id: 'M18',
    covers: ['S20'],
    from: '    const bytes = this._utf8(msg);',
    to: "    const bytes = this._utf8(msg);\n    if (window.crypto && window.crypto.subtle) return window.crypto.subtle.digest('SHA-256', msg);",
    why: '改用 crypto.subtle → http://（學校本機伺服器）冇 secure context → 密碼 gate 死掉',
  },
  {
    id: 'M19',
    covers: ['S21'],
    from: "  KEY_ARTICLES: 'crArticles',",
    to: "  KEY_ARTICLES: 'yueArticles',",
    why: 'localStorage key 撞 sibling reading-para 嘅 yue* 前綴 → 兩邊資料互相覆蓋',
  },
  {
    id: 'M20',
    covers: ['S21'],
    from: '  getArticle(id) {\n    return this.getArticles().find(a => a.id === id) || null;\n  },',
    to: "  getArticle(id) {\n    localStorage.setItem('yueInline', 'x');\n    return this.getArticles().find(a => a.id === id) || null;\n  },",
    why: 'inline localStorage literal 冇 cr* 前綴 → T8.4（只查 KEY_* 常數）捉唔到',
  },
];
