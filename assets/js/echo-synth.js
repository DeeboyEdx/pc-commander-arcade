/* ============================================================
   PC Commander Arcade — ECHO SYNTH
   Speak or type. Each word becomes a star in a drifting
   constellation; syllable rhythm sets colour and size.
   ============================================================ */

(function () {
  'use strict';

  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const elInput = document.getElementById('phrase');
  const elBtnAdd = document.getElementById('btnAdd');
  const elBtnSay = document.getElementById('btnSay');
  const elBtnClear = document.getElementById('btnClear');
  const elBtnSave = document.getElementById('btnSave');
  const elStatus = document.getElementById('synthStatus');
  const elTotal = document.getElementById('totalWords');
  const elBest = document.getElementById('bestConst');

  // Fixed logical resolution; CSS scales
  const W = 960, H = 540;
  canvas.width = W; canvas.height = H;

  // ---------- World ----------
  const world = {
    stars: [],         // { x, y, r, color, label, vx, vy, life, born }
    bg: [],            // background dim stars
    constellations: 0
  };

  // Background stars
  for (let i = 0; i < 220; i++) {
    world.bg.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.3 + 0.3,
      tw: Math.random() * Math.PI * 2
    });
  }

  // ---------- Colour palette ----------
  const PALETTE = [
    '#ff2bd6', '#00f0ff', '#39ff14', '#ffe600',
    '#b026ff', '#ff7a18', '#ff66e6', '#66f6ff', '#aaff66'
  ];

  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function syllableEstimate(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 1;
    const m = w.match(/[aeiouy]+/g);
    let n = m ? m.length : 1;
    if (w.endsWith('e') && n > 1) n--;
    return Math.max(1, n);
  }

  // ---------- Add a phrase as a constellation ----------
  function addPhrase(text) {
    if (!text || !text.trim()) return;
    const words = text.trim().split(/\s+/);
    const startX = 80 + Math.random() * (W - 160);
    const startY = 80 + Math.random() * (H - 160);
    const radius = 50 + words.length * 14;
    const constColor = PALETTE[hashCode(text) % PALETTE.length];

    const newStars = [];
    const now = performance.now();
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const syl = syllableEstimate(w);
      const angle = (i / words.length) * Math.PI * 2 + Math.random() * 0.4;
      const wob = 0.7 + Math.random() * 0.6;
      const x = startX + Math.cos(angle) * radius * wob;
      const y = startY + Math.sin(angle) * radius * wob;
      const r = 3 + syl * 1.8 + Math.min(8, w.length * 0.3);
      const star = {
        x, y, r,
        color: PALETTE[(hashCode(w) + i) % PALETTE.length],
        label: w,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.10,
        born: now,
        constColor,
        constId: world.constellations
      };
      world.stars.push(star);
      newStars.push(star);
    }
    world.constellations++;
    PCCA.bumpStat('constellationsCreated');
    PCCA.setHighScore('echoSynth', world.stars.length);
    PCCA.announceAchievements(PCCA.checkAchievements());

    // Soft chord chime: one tone per word
    const baseFreq = 220 + (hashCode(text) % 8) * 30;
    for (let i = 0; i < newStars.length; i++) {
      setTimeout(() => {
        SFX.blip && SFX.blip();  // tiny tap
        // also a triangle tone for more melody
        try {
          const w = newStars[i].label;
          const freq = baseFreq * Math.pow(1.122, (hashCode(w) % 10));
          customTone(freq, 0.18, 'triangle', 0.05);
        } catch (e) {}
      }, i * 90);
    }
    updateHud();
  }

  // Custom tone, ducked
  function customTone(freq, dur, type, vol) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!customTone._ctx) customTone._ctx = new AC();
      const c = customTone._ctx;
      if (c.state === 'suspended') c.resume();
      const o = c.createOscillator(); const g = c.createGain();
      o.type = type || 'triangle'; o.frequency.value = freq;
      const t0 = c.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.2));
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + (dur || 0.2) + 0.02);
    } catch (e) {}
  }

  // ---------- Draw ----------
  function draw() {
    // Cosmic gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0420');
    g.addColorStop(0.5, '#11052e');
    g.addColorStop(1, '#1a073b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Nebula clouds (cheap radial gradients)
    drawNebula(W * 0.25, H * 0.35, 220, 'rgba(255, 43, 214, 0.10)');
    drawNebula(W * 0.75, H * 0.65, 280, 'rgba(0, 240, 255, 0.10)');
    drawNebula(W * 0.55, H * 0.20, 180, 'rgba(176, 38, 255, 0.10)');

    // Background twinkle
    const t = performance.now() * 0.001;
    for (const s of world.bg) {
      const tw = (Math.sin(t * 1.2 + s.tw) + 1) * 0.5;
      ctx.globalAlpha = 0.25 + tw * 0.55;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // Connect lines per constellation
    const byConst = {};
    for (const s of world.stars) (byConst[s.constId] = byConst[s.constId] || []).push(s);
    for (const k of Object.keys(byConst)) {
      const group = byConst[k];
      if (group.length < 2) continue;
      ctx.strokeStyle = group[0].constColor;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < group.length; i++) {
        const a = group[i], b = group[(i + 1) % group.length];
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Stars + labels
    for (const s of world.stars) {
      // halo
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // inner white pip
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1, s.r * 0.45), 0, Math.PI * 2); ctx.fill();
      // label
      ctx.font = '14px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 6;
      ctx.fillText(s.label, s.x, s.y + s.r + 14);
      ctx.shadowBlur = 0;
    }

    // Title
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(216, 210, 255, 0.45)';
    ctx.textAlign = 'right';
    ctx.fillText('★ PC COMMANDER ARCADE — ECHO SYNTH ★', W - 14, H - 14);
    ctx.shadowBlur = 0;
  }

  function drawNebula(x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- Update ----------
  function update() {
    for (const s of world.stars) {
      s.x += s.vx;
      s.y += s.vy;
      // gentle bounce
      if (s.x < 20 || s.x > W - 20) s.vx *= -1;
      if (s.y < 20 || s.y > H - 20) s.vy *= -1;
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- HUD ----------
  function updateHud() {
    elTotal.textContent = world.stars.length;
    elBest.textContent = PCCA.fmtNum(PCCA.state().highScores.echoSynth || 0);
  }

  // ---------- Save image ----------
  function saveImage() {
    // Force a redraw before saving (no animation issues)
    draw();
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
      a.download = 'echo-synth-' + stamp + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      PCCA.toast('Saved!', 'Constellation downloaded as PNG');
    } catch (e) {
      PCCA.toast('Save failed', e.message || 'See console');
      console.error(e);
    }
  }

  // ---------- Voice input ----------
  let recognizer = null, listening = false;
  function toggleListen() {
    if (!PCVoice.isRecognitionSupported()) {
      elStatus.textContent = 'Speech recognition not supported. Type instead.';
      return;
    }
    if (listening) { recognizer && recognizer.stop(); return; }
    if (!recognizer) {
      recognizer = PCVoice.createRecognizer({ lang: 'en-US', interim: false, continuous: false });
      recognizer.on('result', results => {
        const final = results.find(r => r.isFinal);
        if (final) {
          const t = final.alternatives[0].transcript;
          elInput.value = t;
          addPhrase(t);
        }
      });
      recognizer.on('end', () => {
        listening = false; elBtnSay.textContent = '🎤 Speak';
        elStatus.textContent = '';
      });
      recognizer.on('error', e => {
        listening = false; elBtnSay.textContent = '🎤 Speak';
        elStatus.textContent = 'Mic error: ' + (e.error || 'unknown');
      });
    }
    listening = true; elBtnSay.textContent = '🛑 Stop';
    elStatus.textContent = 'Listening… speak a phrase.';
    recognizer.start();
  }

  // ---------- Wire ----------
  elBtnAdd.addEventListener('click', () => {
    const v = (elInput.value || '').trim();
    if (!v) return;
    addPhrase(v);
    elInput.value = '';
  });
  elInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); elBtnAdd.click(); }
  });
  elBtnSay.addEventListener('click', toggleListen);
  elBtnClear.addEventListener('click', () => {
    world.stars = [];
    world.constellations = 0;
    updateHud();
    PCCA.toast('Sky cleared', '');
  });
  elBtnSave.addEventListener('click', saveImage);

  if (!PCVoice.isRecognitionSupported()) {
    elBtnSay.disabled = true; elBtnSay.title = 'Speech recognition not supported.';
  }

  updateHud();
  // Seed with a fun starter constellation
  addPhrase('open my computer');
  requestAnimationFrame(loop);
})();
