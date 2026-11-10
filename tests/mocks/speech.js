// ==================== tests/mocks/speech.js ====================
// Web Speech API mock。
//
// ⚠️ 關鍵設計：cancel() **刻意**模仿 Chrome —— 會對未完嘅 utterance 觸發
// onerror('interrupted')。太乾淨嘅 mock = 測試全綠但真機有 bug
//（DESIGN §5.5.2 T8）。另外 onend 由測試手動觸發，否則測唔到串行順序。
export function installSpeechMock(win, {
  voices = [{ name: 'Sinji', lang: 'zh-HK', voiceURI: 'sinji', localService: true }],
  voicesInitiallyEmpty = false,
  fireVoicesChanged = true,
  autoEnd = false,
} = {}) {
  const log = [];
  const pending = [];
  const interrupted = [];
  let vcHandler = null;
  let getVoicesCalls = 0;

  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.voice = null;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
    }
  }

  win.SpeechSynthesisUtterance = FakeUtterance;
  win.speechSynthesis = {
    getVoices() {
      getVoicesCalls += 1;
      if (voicesInitiallyEmpty && getVoicesCalls === 1) return [];
      return voices.slice();
    },
    speak(u) {
      log.push({
        t: 'speak',
        text: u.text,
        rate: u.rate,
        pitch: u.pitch,
        lang: u.lang,
        voice: u.voice ? u.voice.name : null,
      });
      pending.push(u);
      if (autoEnd) queueMicrotask(() => { if (u.onend) u.onend({}); });
    },
    cancel() {
      log.push({ t: 'cancel' });
      // 模仿 Chrome：cancel 會令未完嘅 utterance 觸發 onerror('interrupted')
      while (pending.length) {
        const u = pending.shift();
        interrupted.push(u);
        if (u.onerror) u.onerror({ error: 'interrupted' });
      }
    },
    pause() { log.push({ t: 'pause' }); },
    resume() { log.push({ t: 'resume' }); },
    addEventListener(type, fn) { if (type === 'voiceschanged') vcHandler = fn; },
    removeEventListener(type) { if (type === 'voiceschanged') vcHandler = null; },
  };

  return {
    log,
    pending,
    interrupted,

    /** 所有被讀出嘅字串（順序） */
    spokenTexts() { return log.filter(x => x.t === 'speak').map(x => x.text); },

    /** 手動觸發下一個待播 utterance 嘅 onend（推進串行播放） */
    endNext() {
      const u = pending.shift();
      if (u && u.onend) u.onend({});
      return !!u;
    },

    /** 手動觸發下一個待播 utterance 嘅 onerror（模擬 TTS 失敗） */
    errorNext(error = 'synthesis-failed') {
      const u = pending.shift();
      if (u && u.onerror) u.onerror({ error });
      return !!u;
    },

    /** 手動觸發 voiceschanged（測非同步 voice 解析路徑） */
    fireVoicesChanged() { if (vcHandler) vcHandler(); },

    /** 換 voice 清單（配合 voicesInitiallyEmpty 模擬「遲啲先載入」） */
    setVoices(list) { voices.length = 0; voices.push(...list); },

    /** 攞 utterance 引用（測試要喺 cancel 之前攞住） */
    current() { return pending[pending.length - 1] || null; },
  };
}
