#!/usr/bin/env bash
# ==================== tools/verify-teacher-guard.sh ====================
# 真實破壞驗證：改壞 index.html 入面嘅 Teacher 實作，確認 T5 測試會變紅。
#
# ⚠️ 一定要用完還原原檔（用 mktemp -d 做暫存，唔喺 repo 留垃圾）。
#    臨時備份用完會由 rm -rf 收尾（喺 temp dir，唔係 repo 內嘅危險路徑）。
#
# ⚠️⚠️ 呢個腳本**自我驗證**：每一輪破壞都必須令測試變紅，
#    否則（錨點過期 / 守門有窩）即刻 exit 1 —— 唔准靜靜當通過。
set -uo pipefail
cd "$(dirname "$0")/.."

BAK="$(mktemp -d)"
cp index.html "$BAK/index.html.orig"
restore() { cp "$BAK/index.html.orig" index.html; }
trap 'restore; rm -rf "$BAK"' EXIT

run_case() {
  local label="$1"; shift
  local mode="$1"; shift
  restore
  if ! python3 - "$mode" <<'PY'
import sys
p = 'index.html'
s = open(p, encoding='utf-8').read()
mode = sys.argv[1]
if mode == 'no-extend':
    old = """    if (this._extending >= 0) {
      const wi = this._extending;
      this._extending = -1;"""
    new = """    if (false) {
      const wi = this._extending;
      this._extending = -1;"""
elif mode == 'no-longword-confirm':
    old = "    if (len > 4) {"
    new = "    if (false) {"
    assert s.count(old) == 2, f'anchor count={s.count(old)}'
    # 第二個 = _extendWord 入面嗰個
    i = s.rindex(old)
    s = s[:i] + new + s[i+len(old):]
elif mode == 'adjacent-any':
    old = "      if (w.start === pos + 1 || w.start + w.len === pos) return wi;"
    new = "      return 0;"
else:
    raise SystemExit('unknown mode ' + mode)
if mode != 'no-longword-confirm':
    assert s.count(old) == 1, f'anchor count={s.count(old)}'
    s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
PY
  then
    echo ""
    echo "❌ 破壞錨點搵唔到（mode=$mode）→ 錨點過期，呢輪驗證**無效**，請更新腳本"
    exit 1
  fi
  echo ""
  echo "──────────────────────────────────────────────"
  echo "破壞：$label"
  echo "──────────────────────────────────────────────"
  local out="$BAK/out.txt"
  npx vitest run tests/t5-teacher.test.js >"$out" 2>&1
  grep -E "×|✗|Tests |Test Files |FAIL" "$out" | head -40
  if ! grep -qE "failed" "$out"; then
    echo ""
    echo "❌ 呢輪破壞**冇令測試變紅** → 錨點過期，或者守門有窩"
    exit 1
  fi
}

run_case "D1 拆走「延長一字」分支" no-extend
run_case "D2 拆走 5 字詞嘅二次確認" no-longword-confirm
run_case "D3 「相鄰」判斷改成亂指" adjacent-any

restore
echo ""
echo "✅ 3 輪破壞全部令測試變紅 → 守門有效"
echo "已還原 index.html"
