// ==================== tools/verify-guard.mjs ====================
// 手動破壞驗證：喺**記憶體**改壞守門邏輯 / mutant 定義，
// 確認對應嘅守門真係會變紅。
//
// 用法：node tools/verify-guard.mjs
// 輸出：每項 PASS = 守門有效；FAIL = 守門有窿。exit code 0 = 全部有效。
//
// ⚠️ 呢個檔案唔入 vitest（唔好依賴 vitest —— 否則同一個 bug 可能令
//    驗證工具同測試一齊死）。
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const structuralSrc = readFileSync(resolve(ROOT, 'tests/structural.js'), 'utf8');
const mutantsSrc = readFileSync(resolve(ROOT, 'tests/mutants.js'), 'utf8');

const load = async (code) =>
  import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const { structuralFails, nativeDialogCalls } = await load(structuralSrc);
const { MUTANTS } = await load(mutantsSrc);

// 完整 regex（bare-call 分支 + window. 分支）
const FULL_RE = "/(?<![.\\w])(alert|confirm|prompt)\\s*\\(|window\\s*\\.\\s*(alert|confirm|prompt)\\s*\\(/g";
// 只有裸呼叫分支（= 拆走 window. 分支）
const BARE_RE = "/(?<![.\\w])(alert|confirm|prompt)\\s*\\(/g";

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

// ---------- 破壞 1：拆走 S19 嘅 window. 分支 → M16 應該捉唔到 ----------
{
  const broken = structuralSrc.split(FULL_RE).join(BARE_RE);
  if (broken === structuralSrc) {
    check('破壞1 拆走 S19 嘅 window. 分支 → M16 應該捉唔到', false,
      '搵唔到 regex 字串（structural.js 改咗？）');
  } else {
    const mod = await load(broken);
    const m16 = MUTANTS.find(m => m.id === 'M16');
    const mutated = src.split(m16.from).join(m16.to);
    const fails = mod.structuralFails(mutated);
    const hit = fails.some(f => f.startsWith('S19:'));
    check('破壞1 拆走 S19 嘅 window. 分支 → M16 捉唔到（即守門有窿）', !hit,
      `fails=${JSON.stringify(fails)}`);
  }
}

// ---------- 破壞 2：M9 嘅 from 改返做有歧義嘅版本 → 應該撞號 ----------
{
  const ambiguous = "Array.from(text || '')";
  const count = src.split(ambiguous).length - 1;
  check('破壞2 M9 舊嘅 from 字串喺 source 出現 >1 次（= 會改錯地方）', count > 1,
    `count=${count}`);
  const m9 = MUTANTS.find(m => m.id === 'M9');
  const countNew = src.split(m9.from).length - 1;
  check('破壞2 新 M9 from 字串喺 source 出現剛好 1 次', countNew === 1,
    `count=${countNew}`);
}

// ---------- 破壞 3：淨留裸呼叫規則 → window.alert() 會漏網 ----------
{
  const bareOnly = structuralSrc.split(FULL_RE).join(BARE_RE);
  const mod = await load(bareOnly);
  const calls = mod.nativeDialogCalls("window.alert('x');");
  check('破壞3 淨留裸呼叫規則 → window.alert() 漏網', calls.length === 0,
    `calls=${JSON.stringify(calls)}`);
}

// ---------- 破壞 4：拆走 S20 嘅 SHA-256 常數檢查 → M17 應該失效 ----------
{
  // ⚠️ S20 嘅語義係「常數**唔存在**就 fail」→ 要令佢永遠唔 fire，
  //    所以要改成 `if (false)`（只改 regex 唔夠：咁樣佢會對乜都 fail）
  const broken = structuralSrc
    .split('if (!/0x6a09e667/.test(shaSrc)) {')
    .join('if (false) {');
  if (broken === structuralSrc) {
    check('破壞4 拆走 S20 嘅 SHA-256 常數檢查 → M17 應該失效', false,
      '搵唔到要改嘅檢查式（structural.js 改咗？）');
  } else {
    const mod = await load(broken);
    const m17 = MUTANTS.find(m => m.id === 'M17');
    const mutated = src.split(m17.from).join(m17.to);
    const fails = mod.structuralFails(mutated);
    const hit = fails.some(f => f.startsWith('S20:'));
    check('破壞4 拆走 S20 嘅 SHA-256 常數檢查 → M17 捉唔到（即守門有窿）', !hit,
      `fails=${JSON.stringify(fails)}`);
  }
}

// ---------- 破壞 5：拆走 S20 嘅 crypto.subtle 檢查 → M18 應該失效 ----------
{
  const broken = structuralSrc.split('/crypto\\s*\\.\\s*subtle/').join('/ZZZcrypto\\s*\\.\\s*subtle/');
  const mod = await load(broken);
  const m18 = MUTANTS.find(m => m.id === 'M18');
  const mutated = src.split(m18.from).join(m18.to);
  const fails = mod.structuralFails(mutated);
  const hit = fails.some(f => f.startsWith('S20:'));
  check('破壞5 拆走 S20 嘅 crypto.subtle 檢查 → M18 捉唔到（即守門有窿）', !hit,
    `fails=${JSON.stringify(fails)}`);
}

// ---------- 破壞 6：拆走 S21 嘅 KEY_* 常數掃描 → M19 應該失效 ----------
{
  const broken = structuralSrc
    .split('/\\bKEY_[A-Z_]+\\s*:\\s*[\'"]([^\'"]+)[\'"]/g')
    .join('/\\bZZZ_[A-Z_]+\\s*:\\s*[\'"]([^\'"]+)[\'"]/g');
  if (broken === structuralSrc) {
    check('破壞6 拆走 S21 嘅 KEY_* 常數掃描 → M19 應該失效', false,
      '搵唔到要改嘅 regex（structural.js 改咗？）');
  } else {
    const mod = await load(broken);
    const m19 = MUTANTS.find(m => m.id === 'M19');
    const mutated = src.split(m19.from).join(m19.to);
    const fails = mod.structuralFails(mutated);
    const hit = fails.some(f => f.startsWith('S21:'));
    check('破壞6 拆走 S21 嘅 KEY_* 常數掃描 → M19 捉唔到（即守門有窿）', !hit,
      `fails=${JSON.stringify(fails)}`);
  }
}

// ---------- 破壞 7：拆走 S21 嘅 inline literal 掃描 → M20 應該失效 ----------
{
  const broken = structuralSrc
    .split('/localStorage\\.(?:getItem|setItem|removeItem)\\s*\\(\\s*[\'"]([^\'"]+)[\'"]/g')
    .join('/ZZZlocalStorage\\.(?:getItem|setItem|removeItem)\\s*\\(\\s*[\'"]([^\'"]+)[\'"]/g');
  if (broken === structuralSrc) {
    check('破壞7 拆走 S21 嘅 inline literal 掃描 → M20 應該失效', false,
      '搵唔到要改嘅 regex（structural.js 改咗？）');
  } else {
    const mod = await load(broken);
    const m20 = MUTANTS.find(m => m.id === 'M20');
    const mutated = src.split(m20.from).join(m20.to);
    const fails = mod.structuralFails(mutated);
    const hit = fails.some(f => f.startsWith('S21:'));
    check('破壞7 拆走 S21 嘅 inline literal 掃描 → M20 捉唔到（即守門有窿）', !hit,
      `fails=${JSON.stringify(fails)}`);
  }
}

// ---------- 對照組 A：正常版應該捉到所有嘢 ----------
{
  const m16 = MUTANTS.find(m => m.id === 'M16');
  const mutated = src.split(m16.from).join(m16.to);
  const fails = structuralFails(mutated);
  check('對照組A 正常版 S19 捉到 window.alert()', fails.some(f => f.startsWith('S19:')),
    `fails=${JSON.stringify(fails)}`);
}

// ---------- 對照組 A2：正常版應該捉到 SHA-256 / crypto.subtle / key 前綴 ----------
{
  const m17 = MUTANTS.find(m => m.id === 'M17');
  const m18 = MUTANTS.find(m => m.id === 'M18');
  const m19 = MUTANTS.find(m => m.id === 'M19');
  const m20 = MUTANTS.find(m => m.id === 'M20');
  const f17 = structuralFails(src.split(m17.from).join(m17.to));
  const f18 = structuralFails(src.split(m18.from).join(m18.to));
  const f19 = structuralFails(src.split(m19.from).join(m19.to));
  const f20 = structuralFails(src.split(m20.from).join(m20.to));
  check('對照組A2 正常版 S20/S21 全部捉到',
    f17.some(f => f.startsWith('S20:')) &&
    f18.some(f => f.startsWith('S20:')) &&
    f19.some(f => f.startsWith('S21:')) &&
    f20.some(f => f.startsWith('S21:')),
    `f17=${JSON.stringify(f17)} f18=${JSON.stringify(f18)} f19=${JSON.stringify(f19)} f20=${JSON.stringify(f20)}`);
}

// ---------- 對照組 B：全部 mutant 都令對應斷言變紅 ----------
{
  const bad = [];
  for (const m of MUTANTS) {
    const count = src.split(m.from).length - 1;
    if (count !== 1) { bad.push(`${m.id}(from 出現 ${count} 次)`); continue; }
    const mutated = src.split(m.from).join(m.to);
    const fails = structuralFails(mutated);
    const hit = m.covers.every(id => fails.some(f => f.startsWith(`${id}:`)));
    if (!hit) bad.push(`${m.id}(fails=${fails.join('|')})`);
  }
  check('對照組B 全部 mutant 都令對應斷言變紅', bad.length === 0, bad.join(', '));
}

// ---------- 對照組 C：正式版全部斷言通過 ----------
{
  const fails = structuralFails(src);
  check('對照組C 正式版冇結構違規', fails.length === 0, fails.join(' | '));
}

// ---------- 對照組 D：正常版偵測到原生彈窗 ----------
{
  const calls = nativeDialogCalls("alert('x');");
  const winCalls = nativeDialogCalls("window.alert('x');");
  check('對照組D 正常版捉到裸 alert() 同 window.alert()',
    calls.length === 1 && winCalls.length === 1,
    `bare=${JSON.stringify(calls)} win=${JSON.stringify(winCalls)}`);
}

// ---------- 輸出 ----------
let allOk = true;
for (const r of results) {
  if (!r.ok) allOk = false;
  console.log(`${r.ok ? '✅ PASS' : '❌ FAIL'}  ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}
console.log(`\n${allOk ? '全部通過：守門有效' : '有項目失敗：守門有窿'}`);
process.exit(allOk ? 0 : 1);
