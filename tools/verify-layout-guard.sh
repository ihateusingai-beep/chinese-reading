#!/usr/bin/env bash
# ==================== tools/verify-layout-guard.sh ====================
# 真實破壞驗證（版面）：改壞 index.html 嘅詞 token CSS，
# 確認 Tier 1 結構斷言（S22）同 Tier 2 版面測試（A6）會變紅。
#
# ⚠️ 背景：`.tok` 固定 width:1.15em 套落多字詞 token → 3–4 字詞嘅字喺
#    1.15em 闊嘅框入面「疊行」→ 文字溢出、互相覆蓋 → 學生撳唔到被蓋住嘅字。
#    jsdom 冇 layout engine → 只有 Tier 2（真瀏覽器）捉得到。
#
# ⚠️⚠️ 呢個腳本**自我驗證**：每一輪破壞都必須令**指定嗰層**測試變紅，
#    否則（錨點過期 / 守門有窩）即刻 exit 1 —— 唔准靜靜當通過。
#
# ⚠️ 每輪嘅期望層級唔一樣，唔可以一刀切：
#    L1（詞 token 用固定字格闊度）→ 會造成「疊行／溢出」→ Tier 1 同 Tier 2 都要紅
#    L2（詞內字格唔固定 1.15em）  → 淨係網格一致性問題（詞內外 pitch 唔一致），
#                                    **唔會**造成疊行 → 只有 Tier 1 結構斷言應該紅；
#                                    Tier 2 A6 正確唔報 —— 唔可以因此當成「守門有窩」。
set -uo pipefail
cd "$(dirname "$0")/.."

BAK="$(mktemp -d)"
cp index.html "$BAK/index.html.orig"
restore() { cp "$BAK/index.html.orig" index.html; }
trap 'restore; rm -rf "$BAK"' EXIT

run_case() {
  local label="$1"; shift
  local mode="$1"; shift
  local expect_tier2="$1"; shift      # yes | no
  restore
  if ! python3 - "$mode" <<'PY'
import sys
p = 'index.html'
s = open(p, encoding='utf-8').read()
mode = sys.argv[1]
if mode == 'word-fixed-width':
    old = ".tok.word{width:auto;white-space:nowrap;box-shadow:inset 0 -0.12em 0 #7c3aed}\n.tok.word .g{width:1.15em;text-align:center}"
    new = ".tok.word{box-shadow:inset 0 -0.12em 0 #7c3aed}"
elif mode == 'word-char-auto':
    old = ".tok.word .g{width:1.15em;text-align:center}"
    new = ".tok.word .g{width:auto;text-align:center}"
else:
    raise SystemExit('unknown mode ' + mode)
assert s.count(old) == 1, f'anchor count={s.count(old)} for {mode}'
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

  echo "— Tier 1 結構斷言 S22（應該紅）—"
  npx vitest run tests/t7-structure.test.js >"$out" 2>&1
  grep -E "×|Tests |Test Files |S22" "$out" | head -10
  if ! grep -qE "failed" "$out"; then
    echo ""
    echo "❌ Tier 1 冇變紅 → 錨點過期，或者 S22 守門有窩"
    exit 1
  fi

  if [ "$expect_tier2" = "yes" ]; then
    echo "— Tier 2 版面測試 A6（應該紅）—"
    npx playwright test -g "A6" >"$out" 2>&1
    grep -E "✘|×|passed|failed|Error:|expect" "$out" | head -12
    if ! grep -qE "failed" "$out"; then
      echo ""
      echo "❌ Tier 2 A6 冇變紅 → 錨點過期，或者 A6 守門有窩"
      exit 1
    fi
  else
    echo "— Tier 2 A6（呢輪**唔應該**紅：只係網格一致性問題，唔會造成疊行）—"
    npx playwright test -g "A6" >"$out" 2>&1
    grep -E "passed|failed" "$out" | head -4
  fi
}

run_case "L1 詞 token 用固定一個字格嘅闊度（2026-11-10 真 bug）" word-fixed-width yes
run_case "L2 詞 token 內每個字唔維持 1.15em 字格" word-char-auto no

restore
echo ""
echo "✅ 2 輪破壞全部令指定嗰層測試變紅 → 守門有效"
echo "已還原 index.html"
