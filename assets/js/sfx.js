/* ============================================================
   PC Commander Arcade — Chiptune SFX
   Pure Web Audio API. No samples, all synthesized.
   ============================================================ */

(function () {
  'use strict';

  let ctx = null;
  let masterGain = null;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
    return ctx;
  }

  function isSfxOn() {
    try { return PCCA.state().settings.sfxOn !== false; } catch (e) { return true; }
  }
  function isMusicOn() {
    try { return PCCA.state().settings.musicOn !== false; } catch (e) { return true; }
  }

  // Unlock audio on first user gesture (required by browsers)
  function unlock() {
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
  }
  ['click', 'keydown', 'touchstart'].forEach(ev => {
    window.addEventListener(ev, unlock, { once: false, passive: true });
  });

  // ---------- Primitive: scheduled tone ----------
  function tone(opts) {
    if (!isSfxOn()) return;
    const c = ensureCtx();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = opts.type || 'square';
    const t0 = c.currentTime;
    const startFreq = opts.freq || 440;
    const endFreq = opts.endFreq || startFreq;
    const dur = opts.dur || 0.12;
    o.frequency.setValueAtTime(startFreq, t0);
    if (endFreq !== startFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    const vol = opts.vol == null ? 0.18 : opts.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(masterGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseBurst(opts) {
    if (!isSfxOn()) return;
    const c = ensureCtx();
    if (!c) return;
    const dur = opts.dur || 0.15;
    const bufferSize = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = opts.freq || 1500;
    bp.Q.value = opts.q || 1.2;
    const g = c.createGain();
    const vol = opts.vol == null ? 0.22 : opts.vol;
    const t0 = c.currentTime;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(masterGain);
    src.start(t0);
  }

  // ---------- Curated SFX ----------
  const SFX = {
    laser:   () => tone({ type: 'square',   freq: 880, endFreq: 220, dur: 0.10, vol: 0.18 }),
    hit:     () => { tone({ type: 'square',   freq: 180, endFreq: 60,  dur: 0.10, vol: 0.20 }); noiseBurst({ freq: 600, dur: 0.10, vol: 0.10 }); },
    explode: () => { noiseBurst({ freq: 400, dur: 0.40, vol: 0.30, q: 0.5 }); tone({ type: 'sawtooth', freq: 160, endFreq: 40, dur: 0.4, vol: 0.16 }); },
    pickup:  () => { tone({ type: 'triangle', freq: 660, dur: 0.07, vol: 0.18 }); setTimeout(() => tone({ type: 'triangle', freq: 990, dur: 0.10, vol: 0.18 }), 70); },
    blip:    () => tone({ type: 'square',   freq: 1200, dur: 0.05, vol: 0.10 }),
    badblip: () => tone({ type: 'sawtooth', freq: 220, endFreq: 110, dur: 0.18, vol: 0.18 }),
    confirm: () => { tone({ type: 'square', freq: 523, dur: 0.08, vol: 0.16 }); setTimeout(() => tone({ type: 'square', freq: 784, dur: 0.12, vol: 0.16 }), 80); },
    error:   () => { tone({ type: 'sawtooth', freq: 220, dur: 0.10, vol: 0.18 }); setTimeout(() => tone({ type: 'sawtooth', freq: 165, dur: 0.18, vol: 0.18 }), 90); },
    levelup: () => {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => tone({ type: 'square', freq: f, dur: 0.12, vol: 0.20 }), i * 90));
    },
    gameover: () => {
      const notes = [523, 466, 392, 330, 262];
      notes.forEach((f, i) => setTimeout(() => tone({ type: 'square', freq: f, dur: 0.20, vol: 0.20 }), i * 180));
    },
    coin:    () => { tone({ type: 'square', freq: 988, dur: 0.05, vol: 0.18 }); setTimeout(() => tone({ type: 'square', freq: 1318, dur: 0.18, vol: 0.18 }), 60); },
    typewriter: () => tone({ type: 'square', freq: 1500 + Math.random() * 400, dur: 0.02, vol: 0.05 }),
    bossWarn:() => {
      [220, 220, 220].forEach((f, i) => setTimeout(() => tone({ type: 'sawtooth', freq: f, dur: 0.18, vol: 0.22 }), i * 240));
    }
  };

  // ---------- Simple background music loop (synthwave-ish) ----------
  let musicTimer = null;
  let musicTick = 0;
  // Bass line in C minor pentatonic, plus a higher arpeggio
  const BASS    = [130.81, 130.81, 174.61, 130.81, 196.00, 196.00, 174.61, 130.81]; // C3, C3, F3, C3, G3, G3, F3, C3
  const LEAD    = [523.25, 622.25, 783.99, 622.25, 698.46, 622.25, 523.25, 466.16]; // C5, D#5, G5, ...
  const DRUM    = [1, 0, 0, 1, 0, 0, 1, 0]; // hits

  function musicStep() {
    if (!isMusicOn()) return;
    const c = ensureCtx();
    if (!c) return;
    const i = musicTick % 8;
    // bass
    tone({ type: 'triangle', freq: BASS[i], dur: 0.22, vol: 0.07 });
    // lead every other beat
    if (i % 2 === 0) tone({ type: 'square', freq: LEAD[i], dur: 0.18, vol: 0.045 });
    // drum
    if (DRUM[i]) noiseBurst({ freq: 200, dur: 0.06, vol: 0.05, q: 0.4 });
    musicTick++;
  }

  function musicStart(opts) {
    opts = opts || {};
    if (musicTimer) return;
    if (!isMusicOn()) return;
    ensureCtx();
    const bpm = opts.bpm || 120;
    const stepMs = (60000 / bpm) / 2; // 8th notes
    musicTick = 0;
    musicTimer = setInterval(musicStep, stepMs);
  }

  function musicStop() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  // ---------- Public ----------
  window.SFX = SFX;
  window.MUSIC = { start: musicStart, stop: musicStop, isOn: isMusicOn };
})();
