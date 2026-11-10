// ==================== tests/t4-sequence.test.js ====================
// T4 · Sequence（串行播放）—— 陷阱最密嘅模組。
// 對應 docs/DESIGN.md §5.4、docs/TEST-PLAN.md §5.4
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readAppHtml, loadApp, installFakeTimers } from './harness.js';

const TEXT = '我今日，去咗茶餐廳。';
// token: 0我(c) 1今(c) 2日(c) 3，(p) 4去(c) 5咗(c) 6茶(c) 7餐(c) 8廳(c) 9。(p)

let ctx;
let speech;
let tokens;

beforeEach(async () => {
  ctx = await loadApp();
  speech = ctx.speech;
  tokens = ctx.api.Tokenizer.tokenize(TEXT, []).tokens;
});
afterEach(() => {
  ctx.close();
  vi.useRealTimers();
});

const S = () => ctx.api.Sequence;

/** 推動串行播放直到讀完 */
async function driveToEnd(maxSteps = 200) {
  const active = [];
  let done = false;
  let encourage = null;
  S().play(tokens, {
    onActive: (i) => active.push(i),
    onDone: (t) => { done = true; encourage = t; },
  });
  for (let guard = 0; guard < maxSteps && !done; guard++) {
    if (speech.pending.length) speech.endNext();
    await vi.advanceTimersByTimeAsync(1000);
  }
  return { active, done, encourage };
}

describe('T4 · Sequence（串行播放）', () => {
  it('T4.1 play() → 第一個 token 即時 active + speak 收到佢', () => {
    const active = [];
    S().play(tokens, { onActive: (i) => active.push(i) });

    expect(active).toEqual([0]);
    expect(speech.spokenTexts()).toEqual(['我']);
    expect(S().state).toBe('playing');
    expect(S().isPlaying()).toBe(true);
  });

  it('T4.2 完成回調 → 下一個 token active（靠回調串聯，唔係估字長）', async () => {
    installFakeTimers(ctx.win);
    const active = [];
    S().play(tokens, { onActive: (i) => active.push(i) });

    speech.endNext();
    await vi.advanceTimersByTimeAsync(0);
    expect(active).toEqual([0]);          // 仲喺 token 之間嘅間隙

    await vi.advanceTimersByTimeAsync(S().GAP);
    expect(active).toEqual([0, 1]);
    expect(speech.spokenTexts()).toEqual(['我', '今']);
  });

  it('T4.3 出錯之後仍然推進（唔卡死喺第一個字）', async () => {
    installFakeTimers(ctx.win);
    const active = [];
    S().play(tokens, { onActive: (i) => active.push(i) });

    speech.errorNext('synthesis-failed');
    await vi.advanceTimersByTimeAsync(S().GAP);

    expect(active).toEqual([0, 1]);
    expect(speech.spokenTexts()).toEqual(['我', '今']);
  });

  it('T4.4 讀完整篇 → 出現鼓勵語 + 狀態回 idle', async () => {
    installFakeTimers(ctx.win);
    const { done, encourage } = await driveToEnd();

    expect(done).toBe(true);
    expect(encourage).toBeTruthy();
    expect(speech.spokenTexts()).toContain(encourage);
    expect(S().state).toBe('idle');
  });

  it('T4.5 標點永遠唔會被讀出嚟', async () => {
    installFakeTimers(ctx.win);
    await driveToEnd();

    const spoken = speech.spokenTexts();
    expect(spoken).not.toContain('，');
    expect(spoken).not.toContain('。');
    for (const ch of spoken) {
      expect(ctx.api.Tokenizer.PUNCT.has(ch), `標點「${ch}」唔應該被讀出嚟`).toBe(false);
    }
  });

  it('T4.6 逗號停頓 ≥180ms、句號停頓 ≥600ms', async () => {
    installFakeTimers(ctx.win);
    const stamps = [];
    let doneAt = null;
    S().play(tokens, {
      onActive: (i) => stamps.push({ i, t: Date.now() }),
      onDone: () => { doneAt = Date.now(); },
    });

    const pushUntil = async (target) => {
      for (let g = 0; g < 50 && !stamps.some(s => s.i === target); g++) {
        if (speech.pending.length) speech.endNext();
        await vi.advanceTimersByTimeAsync(100);
      }
      return stamps.find(s => s.i === target);
    };

    const atComma = await pushUntil(3);
    expect(atComma, '應該行到逗號').toBeTruthy();
    const atAfterComma = await pushUntil(4);
    expect(atAfterComma, '應該行過逗號').toBeTruthy();

    const commaPause = atAfterComma.t - atComma.t;
    expect(commaPause, '逗號停頓要 ≥180ms').toBeGreaterThanOrEqual(180);
    expect(commaPause).toBe(S().PAUSE_COMMA);

    const atPeriod = await pushUntil(9);
    expect(atPeriod, '應該行到句號').toBeTruthy();
    for (let g = 0; g < 50 && doneAt === null; g++) {
      if (speech.pending.length) speech.endNext();
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(doneAt, '應該讀得完').not.toBe(null);

    const sentencePause = doneAt - atPeriod.t;
    expect(sentencePause, '句號停頓要 ≥600ms').toBeGreaterThanOrEqual(600);
    expect(sentencePause).toBe(S().PAUSE_SENTENCE);
  });

  it('T4.7 讀到一半 stop() → cancel() + 回到 idle + 唔會再讀下一個', async () => {
    installFakeTimers(ctx.win);
    const active = [];
    S().play(tokens, { onActive: (i) => active.push(i) });

    speech.endNext();
    S().stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(S().state).toBe('idle');
    expect(active).toEqual([0]);
    expect(speech.spokenTexts()).toEqual(['我']);
    expect(speech.log.some(x => x.t === 'cancel')).toBe(true);
  });

  it('T4.8 stop() 觸發嘅 onerror(interrupted) 都唔會令串行繼續讀', async () => {
    installFakeTimers(ctx.win);
    const active = [];
    S().play(tokens, { onActive: (i) => active.push(i) });

    S().stop();   // cancel() → mock 模仿 Chrome 觸發 onerror('interrupted')
    await vi.advanceTimersByTimeAsync(1000);

    expect(active).toEqual([0]);
    expect(speech.spokenTexts()).toEqual(['我']);
    expect(S().state).toBe('idle');
  });

  it('T4.9 play() 兩次 → 舊一輪作廢，只剩最新一輪喺行', async () => {
    installFakeTimers(ctx.win);
    const active = [];
    S().play(tokens, { onActive: (i) => active.push(i) });
    speech.endNext();

    S().play(tokens, { onActive: (i) => active.push(i) });   // 再撳一次「讀全篇」
    speech.endNext();
    await vi.advanceTimersByTimeAsync(1000);

    expect(active).toEqual([0, 0, 1]);   // 第二輪由 0 重新開始
    expect(speech.spokenTexts()).toEqual(['我', '我', '今']);
  });

  it('T4.11 stop() 之後，語音自然完結都唔會再推進', async () => {
    installFakeTimers(ctx.win);
    const active = [];
    S().play(tokens, { onActive: (i) => active.push(i) });

    S().stop();
    speech.endNext();          // 語音自然完結（模擬真機情況）
    await vi.advanceTimersByTimeAsync(1000);

    expect(active).toEqual([0]);
    expect(speech.spokenTexts()).toEqual(['我']);
    expect(S().state).toBe('idle');
  });

  it('T4.12 防禦縱深：就算 Sequence.stop() 冇 cancel 語音，都唔會錯誤推進', async () => {
    const src = readAppHtml();
    // 模擬「有人日後喺 stop() 漏咗 Voice.stop()」—— Voice 自己嘅 guard 就唔會生效，
    // 呢個時候 Sequence 嘅 generation guard 係唯一防線。
    const html = src.replace('    Voice.stop();\n  },', '  },');
    expect(html, 'mutate 必須真係改到 source').not.toBe(src);

    const { api, speech: sp, win, close } = await loadApp({ html });
    installFakeTimers(win);
    const active = [];
    api.Sequence.play(api.Tokenizer.tokenize(TEXT, []).tokens, { onActive: (i) => active.push(i) });

    api.Sequence.stop();
    sp.endNext();               // 語音自然完結（冇被 cancel）
    await vi.advanceTimersByTimeAsync(1000);

    expect(active, '就算語音自然完結都唔應該再推進').toEqual([0]);
    close();
  });

  it('T4.10 反向驗證：冇完成回調 → 串行卡死喺第一個字', async () => {
    const src = readAppHtml();
    const html = src.replace(
      'onend: () => { this._afterSpeech(gen); },',
      'onboom: () => { this._afterSpeech(gen); },'
    );
    expect(html, 'mutate 必須真係改到 source').not.toBe(src);

    const { api, speech: sp, win, close } = await loadApp({ html });
    installFakeTimers(win);
    api.Sequence.play(api.Tokenizer.tokenize(TEXT, []).tokens, {});

    sp.endNext();
    await vi.advanceTimersByTimeAsync(1000);

    expect(sp.spokenTexts(), '冇完成回調 → 卡死喺第一個字').toEqual(['我']);
    close();
  });
});
