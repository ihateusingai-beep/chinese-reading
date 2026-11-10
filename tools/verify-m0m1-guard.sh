#!/usr/bin/env bash
# ==================== tools/verify-m0m1-guard.sh ====================
# 真實破壞驗證（M0/M1 scaffold）：改壞 index.html 入面嘅新功能，
# 確認 t11 / t12 / t13 測試會變紅。
#
# ⚠️ 一定用完還原（mktemp -d 做暫存，唔喺 repo 留垃圾）。
#
# ⚠️⚠️ 呢個腳本**自我驗證**：每一輪破壞都必須令測試變紅，否則即刻 exit 1。
#    原因（2026-11-10 真實踩坑）：內容版本機制改寫之後，D6 嘅破壞錨點
#    （`if (raw !== null) return false;`）已經唔存在 → 改壞冇發生 → 測試照綠
#    → 表面上「9 輪破壞全部有效」，實際上嗰輪**完全冇測過**。
#    → 所以：錨點搵唔到 = 硬錯誤；改壞之後測試唔紅 = 硬錯誤。
set -uo pipefail
cd "$(dirname "$0")/.."

BAK="$(mktemp -d)"
cp index.html "$BAK/index.html.orig"
restore() { cp "$BAK/index.html.orig" index.html; }
trap 'restore; rm -rf "$BAK"' EXIT

run_case() {
  local label="$1"; shift
  local mode="$1"; shift
  local testfile="$1"; shift
  restore
  if ! python3 - "$mode" <<'PY'
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
    # ⚠️ 內容版本機制之後，「尊重老師清空文章庫」有**兩層**保護：
    #    ① 早退：版本已經最新 → 完全唔再種
    #    ② 逐篇過濾：舊批次嘅預設文章唔會復活
    #    兩層都拆走 → 老師清空咗，預設文章就會無故返嚟
    old = "    if (storedVer >= SEED_VERSION) return false;\n"
    new = ""
    old2 = "        if ((a.seedVersion || 1) <= storedVer) continue;   // 舊批次 → 唔好復活\n"
    new2 = ""
    assert s.count(old) == 1, f'anchor1 count={s.count(old)}'
    assert s.count(old2) == 1, f'anchor2 count={s.count(old2)}'
    s = s.replace(old, new).replace(old2, new2)
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
if mode not in ('seed-always',):
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
  npx vitest run "$testfile" >"$out" 2>&1
  grep -E "×|Tests |Test Files |FAIL" "$out" | head -20
  if ! grep -qE "failed" "$out"; then
    echo ""
    echo "❌ 呢輪破壞**冇令測試變紅** → 錨點過期，或者守門有窩"
    exit 1
  fi
}

run_case "D4 學生端唔再過濾 published（隱藏咗嘅文章會畀學生見到）" no-published-filter tests/t12-hub.test.js
run_case "D5 唔檢查密碼就入老師模式" no-pass-check tests/t12-hub.test.js
run_case "D6 老師清空文章庫後又自動生返預設文章" seed-always tests/t12-hub.test.js
run_case "D7 Modal 取消時 resolve 空字串而唔係 null" cancel-returns-empty tests/t11-auth.test.js
run_case "D8 讀音小卡唔建立" no-read-card tests/t3-reader.test.js
run_case "D9 儲存掣只喺標詞之後先出現（即場貼文章就冇得儲存）" save-only-after-marking tests/t13-teacher-ui.test.js
run_case "D10 空內容唔阻儲存（會產生空文章）" no-empty-text-guard tests/t13-teacher-ui.test.js
run_case "D11 字數計數器唔更新" no-char-count tests/t13-teacher-ui.test.js
run_case "D12 字級預設掣唔會套用" no-font-presets tests/t13-teacher-ui.test.js

restore
echo ""
echo "✅ 9 輪破壞全部令測試變紅 → 守門有效"
echo "已還原 index.html"
