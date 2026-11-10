// ==================== tests/t11-auth.test.js ====================
// T11 · Sha256（純 JS）+ Auth（老師密碼 gate）
//
// ⚠️ 點解要自己實作 SHA-256（唔用 crypto.subtle）：
//    `crypto.subtle` 只喺 secure context（https:// 或 localhost）先有。
//    學校如果用 `http://192.168.x.x` 開本機伺服器 → 冇 subtle → 密碼 gate 死掉。
//    jsdom 測試環境亦都冇。
//    → 呢個測試會**對齊 Node crypto** 嘅輸出，確保實作真係啱。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { loadApp } from './harness.js';

let ctx;

beforeEach(async () => {
  ctx = await loadApp();
});
afterEach(() => {
  ctx.close();
});

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('T11.1 · Sha256（純 JS 實作）', () => {
  it('T11.1a 對齊 Node crypto 嘅 SHA-256（多個輸入 + 跨 block 邊界）', () => {
    const cases = [
      '', 'abc', '230714', 'a', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63),
      'a'.repeat(64), 'a'.repeat(65), 'a'.repeat(1000),
      '中文密碼', '😀 emoji', 'The quick brown fox jumps over the lazy dog',
    ];
    for (const c of cases) {
      expect(ctx.api.Sha256.hash(c), `SHA-256(${JSON.stringify(c.slice(0, 16))}) 唔啱`).toBe(sha(c));
    }
  });

  it('T11.1b 已知測試向量（FIPS 180-4 / 維基）', () => {
    expect(ctx.api.Sha256.hash('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(ctx.api.Sha256.hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('T11.1c 唔靠 crypto.subtle（http:// 環境冇 secure context）', () => {
    // jsdom 根本冇 window.crypto.subtle → 如果實作靠佢，喺 http:// 就會死
    expect(ctx.win.crypto.subtle, 'jsdom 冇 subtle（模擬 http:// 環境）').toBeUndefined();
    expect(ctx.api.Sha256.hash('x')).toHaveLength(64);
  });

  it('T11.1d 中文 / emoji 唔會拆爛（UTF-8 編碼正確，唔係 UTF-16）', () => {
    expect(ctx.api.Sha256.hash('😀')).toBe(sha('😀'));
    expect(ctx.api.Sha256.hash('中')).toBe(sha('中'));
    // 唔可以用 UTF-16 code unit 編碼（emoji 會變 6 bytes）
    expect(ctx.api.Sha256.hash('😀')).not.toBe(sha('?'));
  });
});

describe('T11.2 · Auth（老師密碼 gate）', () => {
  it('T11.2a 第一次用 → 自動產生 salt + 預設密碼 hash（寫入 crTeacherPassHash）', () => {
    const rec = ctx.api.Auth.ensureSeeded();
    expect(typeof rec.salt).toBe('string');
    expect(rec.salt.length).toBeGreaterThanOrEqual(16);
    expect(rec.hash).toHaveLength(64);

    const raw = ctx.win.localStorage.getItem('crTeacherPassHash');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw).salt).toBe(rec.salt);
  });

  it('T11.2b 預設密碼（學校預設，同 reading-para 一致）入到', () => {
    expect(ctx.api.Auth.check('230714')).toBe(true);
  });

  it('T11.2c 錯密碼 / 空密碼 / 非字串 → 一律入唔到', () => {
    expect(ctx.api.Auth.check('wrong')).toBe(false);
    expect(ctx.api.Auth.check('')).toBe(false);
    expect(ctx.api.Auth.check(null)).toBe(false);
    expect(ctx.api.Auth.check(undefined)).toBe(false);
    expect(ctx.api.Auth.check(12345)).toBe(false);
  });

  it('T11.2d salt 唔同 → 同一個密碼嘅 hash 都唔同（真·salted）', () => {
    const a = ctx.api.Auth.hash('230714', 'salt-aaaa');
    const b = ctx.api.Auth.hash('230714', 'salt-bbbb');
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });

  it('T11.2e 改密碼 → 新密碼入到、舊密碼入唔到', () => {
    const res = ctx.api.Auth.changePassword('newpass123');
    expect(res.ok).toBe(true);
    expect(ctx.api.Auth.check('newpass123')).toBe(true);
    expect(ctx.api.Auth.check('230714')).toBe(false);
  });

  it('T11.2f 改密碼太短 → 拒絕 + 有錯誤訊息，舊密碼仲有效', () => {
    const res = ctx.api.Auth.changePassword('ab');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(ctx.api.Auth.check('230714')).toBe(true);
  });

  it('T11.2g crTeacherPassHash 係壞 JSON → 唔 crash，重新產生', () => {
    ctx.win.localStorage.setItem('crTeacherPassHash', '{ not json');
    expect(() => ctx.api.Auth.ensureSeeded()).not.toThrow();
    expect(ctx.api.Auth.check('230714')).toBe(true);
  });

  it('T11.2h askPassword → 密碼啱 → 老師模式開啟', async () => {
    expect(ctx.api.Auth.isTeacher()).toBe(false);
    const p = ctx.api.Auth.askPassword();

    const input = ctx.win.document.querySelector('.modal-input');
    expect(input, '應該出現密碼輸入框').toBeTruthy();
    expect(input.type).toBe('password');
    input.value = '230714';
    ctx.win.document.querySelector('.modal-ok').click();

    const res = await p;
    expect(res.ok).toBe(true);
    expect(ctx.api.Auth.isTeacher()).toBe(true);
  });

  it('T11.2i askPassword → 密碼錯 → ok=false 而且唔會開老師模式', async () => {
    const p = ctx.api.Auth.askPassword();
    ctx.win.document.querySelector('.modal-input').value = 'nope';
    ctx.win.document.querySelector('.modal-ok').click();

    const res = await p;
    expect(res.ok).toBe(false);
    expect(res.cancelled).toBe(false);
    expect(ctx.api.Auth.isTeacher()).toBe(false);
  });

  it('T11.2j askPassword → 取消 → cancelled=true（唔應該當成「密碼唔啱」）', async () => {
    const p = ctx.api.Auth.askPassword();
    ctx.win.document.querySelector('.modal-cancel').click();

    const res = await p;
    expect(res.cancelled).toBe(true);
    expect(res.ok).toBe(false);
    expect(ctx.api.Auth.isTeacher()).toBe(false);
  });
});

describe('T11.3 · Modal.askText（in-app 文字輸入）', () => {
  it('T11.3a 輸入內容 + 撳好 → resolve 個字串', async () => {
    const p = ctx.api.Modal.askText({ title: '測試', label: '輸入啲嘢' });
    const input = ctx.win.document.querySelector('.modal-input');
    input.value = '你好';
    ctx.win.document.querySelector('.modal-ok').click();

    await expect(p).resolves.toBe('你好');
  });

  it('T11.3b 取消 → resolve null', async () => {
    const p = ctx.api.Modal.askText({ title: '測試' });
    ctx.win.document.querySelector('.modal-cancel').click();
    await expect(p).resolves.toBe(null);
  });

  it('T11.3c askText 之後再用 askConfirm → 唔會殘留個輸入框', async () => {
    const p1 = ctx.api.Modal.askText({ title: '測試' });
    ctx.win.document.querySelector('.modal-cancel').click();
    await p1;

    const p2 = ctx.api.Modal.askConfirm({ title: '測試', message: '你確定？' });
    const input = ctx.win.document.querySelector('.modal-input');
    expect(input.hidden, 'askConfirm 應該把輸入框收埋').toBe(true);
    ctx.win.document.querySelector('.modal-ok').click();
    await expect(p2).resolves.toBe(true);
  });

  it('T11.3d 密碼模式 → input type = password', async () => {
    const p = ctx.api.Modal.askText({ title: '密碼', password: true });
    const input = ctx.win.document.querySelector('.modal-input');
    expect(input.type).toBe('password');
    ctx.win.document.querySelector('.modal-cancel').click();
    await p;
  });
});
