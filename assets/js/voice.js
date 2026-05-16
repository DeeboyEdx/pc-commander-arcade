/* ============================================================
   PC Commander Arcade — Web Speech API helpers
   ============================================================ */

(function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const SS = window.speechSynthesis;

  function isRecognitionSupported() { return !!SR; }
  function isSynthSupported() { return !!SS; }

  // Cache available voices, with a promise that resolves when ready.
  let cachedVoices = [];
  let voicesReady;

  function loadVoices() {
    if (!SS) return Promise.resolve([]);
    if (voicesReady) return voicesReady;
    voicesReady = new Promise(resolve => {
      const got = SS.getVoices();
      if (got && got.length) { cachedVoices = got; resolve(got); return; }
      SS.onvoiceschanged = () => {
        cachedVoices = SS.getVoices();
        resolve(cachedVoices);
      };
      // Safety fallback
      setTimeout(() => {
        if (!cachedVoices.length) cachedVoices = SS.getVoices() || [];
        resolve(cachedVoices);
      }, 1500);
    });
    return voicesReady;
  }

  function pickVoice(langPrefix) {
    if (!cachedVoices.length) cachedVoices = SS ? SS.getVoices() : [];
    if (!cachedVoices.length) return null;
    const lp = (langPrefix || 'en').toLowerCase();
    // Best: exact prefix and not "novelty" voices
    return (
      cachedVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(lp) && /female|woman|samantha|google/i.test(v.name)) ||
      cachedVoices.find(v => v.lang && v.lang.toLowerCase().startsWith(lp)) ||
      cachedVoices[0]
    );
  }

  function speak(text, opts) {
    if (!SS) return Promise.resolve(false);
    opts = opts || {};
    return loadVoices().then(() => new Promise(resolve => {
      try { SS.cancel(); } catch (e) {}
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(opts.lang || 'en');
      if (v) { u.voice = v; u.lang = v.lang; }
      else if (opts.lang) { u.lang = opts.lang; }
      u.rate   = opts.rate   != null ? opts.rate   : 1.0;
      u.pitch  = opts.pitch  != null ? opts.pitch  : 1.0;
      u.volume = opts.volume != null ? opts.volume : 1.0;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      SS.speak(u);
    }));
  }

  // Returns a "recognizer" object with start/stop and an event API.
  function createRecognizer(opts) {
    if (!SR) return null;
    opts = opts || {};
    const r = new SR();
    r.lang = opts.lang || 'en-US';
    r.continuous = !!opts.continuous;
    r.interimResults = !!opts.interim;
    r.maxAlternatives = opts.maxAlternatives || 3;
    const listeners = {};
    r.onresult = (ev) => {
      const out = [];
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const alts = [];
        for (let j = 0; j < res.length; j++) alts.push({ transcript: res[j].transcript, confidence: res[j].confidence });
        out.push({ isFinal: res.isFinal, alternatives: alts });
      }
      (listeners.result || []).forEach(fn => fn(out));
    };
    r.onerror = (e) => (listeners.error || []).forEach(fn => fn(e));
    r.onstart = () => (listeners.start || []).forEach(fn => fn());
    r.onend   = () => (listeners.end   || []).forEach(fn => fn());
    return {
      raw: r,
      start: () => { try { r.start(); } catch (e) { /* "already started" is fine */ } },
      stop:  () => { try { r.stop();  } catch (e) {} },
      abort: () => { try { r.abort(); } catch (e) {} },
      setLang: (lang) => { r.lang = lang; },
      on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); }
    };
  }

  // Levenshtein distance for fuzzy match scoring
  function lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const n = a.length, m = b.length;
    if (!n) return m; if (!m) return n;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i-1][j]   + 1,
          dp[i][j-1]   + 1,
          dp[i-1][j-1] + cost
        );
      }
    }
    return dp[n][m];
  }

  // Returns a similarity in [0,1].
  function similarity(a, b) {
    if (!a || !b) return 0;
    const ca = a.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');
    const cb = b.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');
    if (!ca || !cb) return 0;
    if (ca === cb) return 1;
    const d = lev(ca, cb);
    const maxLen = Math.max(ca.length, cb.length);
    return Math.max(0, 1 - d / maxLen);
  }

  // Compare a recognition transcript (possibly multiple alternatives) to expected phrase.
  function bestMatchScore(altsOrString, expected) {
    if (typeof altsOrString === 'string') return similarity(altsOrString, expected);
    let best = 0;
    for (const a of (altsOrString || [])) {
      const s = similarity(a.transcript || '', expected);
      if (s > best) best = s;
    }
    return best;
  }

  window.PCVoice = {
    isRecognitionSupported,
    isSynthSupported,
    loadVoices,
    pickVoice,
    speak,
    createRecognizer,
    similarity,
    bestMatchScore
  };
})();
