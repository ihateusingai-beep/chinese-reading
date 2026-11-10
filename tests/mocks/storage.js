// ==================== tests/mocks/storage.js ====================
// localStorage 隔離 / 損壞資料輔助
export function clearStorage(win) {
  try { win.localStorage.clear(); } catch { /* private mode */ }
}

export function setRaw(win, key, raw) {
  win.localStorage.setItem(key, raw);
}

export function getRaw(win, key) {
  return win.localStorage.getItem(key);
}

/** 注入一篇文章（shape 同 DESIGN §4.1） */
export function seedArticles(win, articles) {
  win.localStorage.setItem('crArticles', JSON.stringify(articles));
}

/** 注入壞 JSON（測試載入時唔可以 crash） */
export function corrupt(win, key, raw = '{ this is not json') {
  win.localStorage.setItem(key, raw);
}
