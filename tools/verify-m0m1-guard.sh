#!/usr/bin/env bash
# ==================== tools/verify-m0m1-guard.sh ====================
# 真實破壞驗證（M0/M1 scaffold）：改壞 index.html 入面嘅新功能，
# 確認 t11 / t12 / t13 測試會變紅。
#
# ⚠️ 一定用完還原（mktemp -d 做暫存，唔喺 repo 留垃圾）。
set -uo pipefail
cd "$(dirname "$0")/.."

BAK="$(mktemp -d)"
cp index.html "$BAK/index.html.orig"
restore() { cp "$BAK/index.html.orig" index.html; }
trap 'restore; rm -rf "$BAK"' EXIT

run_case() {
  local label="$1"; shift
  local tests="$1"; shift
  restore
  python3 - "$@" <<'PY'
import sys
p = 'index.html'
s = open(p, encoding='utf-8').read()
mode = sys.argv[1]
if mode == 'no-published-filter':
    old = "const articles = Store.getArticles().filter(a => a.published !== false);"
    new = "const articles = Store.getArticles();"
elif mode == 'no-pass-check':
    old = "    if (!res.ok) { Toast.show('密碼唔啱'); return; }\n"
    new = ""
elif mode == 'seed-always':
    old = "    if (raw !== null) return false;\n"
    new = ""
elif mode == 'cancel-returns-empty':
    old = "      const onCancel = () => done(null);"
    new = "      const onCancel = () => done('');"
elif mode == 'no-read-card':
    old = "    const card = Reader.ensureCard(host);"
    new = "    const card = null;"
elif mode == 'save-only-after-marking':
    old = "    actionCard.appendChild(row);\n    wrap.appendChild(actionCard);"
    new = "    actionCard.appendChild(row);"
elif mode == 'no-empty-text-guard':
    old = "    if (!ed.text || !ed.text.trim()) {\n      Toast.show('文章內容係空嘅，請先貼上文章');"
    new = "    if (false) {\n      Toast.show('文章內容係空嘅，請先貼上文章');"
elif mode == 'no-char-count':
    old = "      count.textContent = `${n} 字`;"
    new = "      count.textContent = '';"
elif mode == 'no-font-presets':
    old = "        TeacherUI._applyFontScale(preset.value, fsInput, fsVal);"
    new = "        void preset.value;"
else:
    raise SystemExit('unknown mode ' + mode)
assert s.count(old) == 1, f'anchor count={s.count(old)} for {mode}'
s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
PY
  echo ""
  echo "──────────────────────────────────────────────"
  echo "破壞：$label"
  echo "──────────────────────────────────────────────"
  npx vitest run $tests 2>&1 | grep -E "×|Tests |Test Files |FAIL" | head -20
}

run_case "D4 學生端唔再過濾 published（隱藏咗嘅文章會畀學生見到）" "tests/t12-hub.test.js" no-published-filter
run_case "D5 唔檢查密碼就入老師模式" "tests/t12-hub.test.js" no-pass-check
run_case "D6 老師清空文章庫後又自動生返預設文章" "tests/t12-hub.test.js" seed-always
run_case "D7 Modal 取消時 resolve 空字串而唔係 null" "tests/t11-auth.test.js" cancel-returns-empty
run_case "D8 讀音小卡唔建立" "tests/t3-reader.test.js" no-read-card
run_case "D9 儲存掣只喺標詞之後先出現（即場貼文章就冇得儲存）" "tests/t13-teacher-ui.test.js" save-only-after-marking
run_case "D10 空內容唔阻儲存（會產生空文章）" "tests/t13-teacher-ui.test.js" no-empty-text-guard
run_case "D11 字數計數器唔更新" "tests/t13-teacher-ui.test.js" no-char-count
run_case "D12 字級預設掣唔會套用" "tests/t13-teacher-ui.test.js" no-font-presets

restore
echo ""
echo "已還原 index.html"
