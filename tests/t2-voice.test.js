// ==================== tests/t2-voice.test.js ====================
// T2 · Voice（粵語發音層）—— 風險最高嘅模組。
// 對應 docs/DESIGN.md §10 C1–C5、docs/TEST-PLAN.md §5.2
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadApp } from './harness.js';

const HK_VOICE = { name: 'Sinji', lang: 'zh-HK', voiceURI: 'sinji', localService: true };
const CN_VOICE = { name: 'Tingting', lang: 'zh-CN', voiceURI: 'tingting', localService: true };

afterEach(() => { vi.useRealTimers(); });

describe('T2 · Voice（粵語發音層）', () => {
  it('T2.1 getVoices 首次空 → voiceschanged 之後解析到 zh-HK', async () => {
    const { api, win, speech, initPromise, close } = await loadApp({
      speech: { voices: [HK_VOICE], voicesInitiallyEmpty: true },
    });
    expect(api.Voice.state).toBe('unknown');

    speech.setVoices([HK_VOICE]);
    speech.fireVoicesChanged();
    await initPromise;

    expect(api.Voice.state).toBe('ok');
    expect(api.Voice.voice.name).toBe('Sinji');
    expect(win.document.getElementById('voice-banner').hidden).toBe(true);
    close();
  });

  it('T2.2 永遠唔 fire voiceschanged → advance 1500ms 之後仍然 resolve（唔會 hang）', async () => {
    vi.useFakeTimers();
    const { api, initPromise, close } = await loadApp({ speech: { voices: [] } });

    await vi.advanceTimersByTimeAsync(1500);
    await initPromise;

    expect(api.Voice.state).toBe('no-hk');
    close();
  });

  it('T2.3 冇 zh-HK voice → 顯示黃色橫幅（絕對唔可以靜默）', async () => {
    vi.useFakeTimers();
    const { api, win, initPromise, close } = await loadApp({ speech: { voices: [CN_VOICE] } });

    await vi.advanceTimersByTimeAsync(1500);
    await initPromise;

    expect(api.Voice.state).toBe('no-hk');
    const banner = win.document.getElementById('voice-banner');
    expect(banner).toBeTruthy();
    expect(banner.hidden).toBe(false);
    expect(banner.getAttribute('data-state')).toBe('no-hk');
    expect(banner.textContent).toContain('廣東話');
    close();
  });

  it('T2.4 唔支援 speechSynthesis → 顯示紅色橫幅', async () => {
    const { api, win, initPromise, close } = await loadApp({ speech: null });
    await initPromise;

    expect(api.Voice.state).toBe('unsupported');
    const banner = win.document.getElementById('voice-banner');
    expect(banner.hidden).toBe(false);
    expect(banner.getAttribute('data-state')).toBe('unsupported');
    expect(banner.textContent).toContain('唔支援');
    close();
  });

  it('T2.5 speak() 出嘅 utterance：lang=zh-HK + 揀到 zh-HK voice', async () => {
    const { api, speech, initPromise, close } = await loadApp();
    await initPromise;

    api.Voice.speak('茶');
    const last = speech.log.filter(x => x.t === 'speak').pop();
    expect(last.lang).toBe('zh-HK');
    expect(last.voice).toBe('Sinji');
    close();
  });

  it('T2.6 預設 rate 0.75；老師設定可以改', async () => {
    const { api, speech, initPromise, close } = await loadApp();
    await initPromise;

    api.Voice.speak('茶');
    expect(speech.log.filter(x => x.t === 'speak').pop().rate).toBe(0.75);

    api.Voice.rate = 0.6;
    api.Voice.speak('飯');
    expect(speech.log.filter(x => x.t === 'speak').pop().rate).toBe(0.6);
    close();
  });

  it('T2.7 每次 speak() 之前必須先 cancel()', async () => {
    const { api, speech, initPromise, close } = await loadApp();
    await initPromise;

    api.Voice.speak('甲');
    api.Voice.speak('乙');

    const log = speech.log;
    const iSpeak1 = log.findIndex(x => x.t === 'speak' && x.text === '甲');
    const iSpeak2 = log.findIndex(x => x.t === 'speak' && x.text === '乙');
    const iCancel2 = log.findIndex((x, i) => x.t === 'cancel' && i > iSpeak1);

    expect(iCancel2).toBeGreaterThan(iSpeak1);
    expect(iCancel2).toBeLessThan(iSpeak2);
    close();
  });

  it('T2.8 onerror 之後必須推進（否則串行讀卡死喺第一個字）', async () => {
    const { api, speech, initPromise, close } = await loadApp();
    await initPromise;

    let ended = false;
    api.Voice.speak('甲', { onend: () => { ended = true; } });
    speech.errorNext('synthesis-failed');

    expect(ended).toBe(true);
    close();
  });

  it('T2.9 cancel() 之後串行唔會繼續推進（generation counter）', async () => {
    const { api, speech, initPromise, close } = await loadApp();
    await initPromise;

    let advanced = false;
    api.Voice.speak('甲', { onend: () => { advanced = true; api.Voice.speak('乙'); } });
    const u = speech.current();

    api.Voice.stop();
    expect(advanced).toBe(false);

    // 模擬瀏覽器喺 cancel 之後仍然派 onend
    if (u && u.onend) u.onend({});
    expect(advanced).toBe(false);
    expect(speech.spokenTexts()).toEqual(['甲']);
    close();
  });

  it('T2.10 speak(空字串) → 直接 onend，唔會 hang，唔會出聲', async () => {
    const { api, speech, initPromise, close } = await loadApp();
    await initPromise;

    let ended = false;
    api.Voice.speak('', { onend: () => { ended = true; } });

    expect(ended).toBe(true);
    expect(speech.spokenTexts()).toEqual([]);
    close();
  });

  it('T2.11 冇 voice 時 speak() 都唔會 throw（唔會炸 app）', async () => {
    vi.useFakeTimers();
    const { api, speech, initPromise, close } = await loadApp({ speech: { voices: [CN_VOICE] } });

    await vi.advanceTimersByTimeAsync(1500);
    await initPromise;

    expect(() => api.Voice.speak('茶')).not.toThrow();
    expect(speech.spokenTexts()).toContain('茶');
    close();
  });
});
