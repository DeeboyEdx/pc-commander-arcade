/* ============================================================
   PC Commander Arcade — PUSH DEFENDER
   Shoot 'em up where you defend your PC from spam push notifications.
   Real PC Commander-style commands must be allowed to pass through;
   spam must be blocked.
   ============================================================ */

(function () {
  'use strict';

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayBody = document.getElementById('overlayBody');
  const hudScore = document.getElementById('hudScore');
  const hudWave  = document.getElementById('hudWave');
  const hudLives = document.getElementById('hudLives');
  const hudCombo = document.getElementById('hudCombo');
  const hudHigh  = document.getElementById('hudHigh');
  const hudPower = document.getElementById('hudPower');

  // Logical resolution (we render to this and CSS scales)
  const W = 480, H = 720;
  canvas.width = W; canvas.height = H;

  // ---------- Phrase banks ----------
  // Mirrors PC Commander intent style without any internal/PII data.
  const REAL_PUSHES = [
    'open notepad', 'play music', 'pause music', 'next track',
    'type hello world', 'launch browser', 'close window',
    'sleep PC', 'lock screen', 'press F11', 'turn on monitor',
    'find emails', 'set timer 10 min', 'print page',
    'send "good night"', 'open calculator', 'launch steam',
    'turn off lights', 'open spotify', 'pause video',
    'next slide', 'back', 'play next', 'press enter'
  ];

  const SPAM_PUSHES = [
    'YOU WON A IPHONE',
    'CLICK HERE 4 FREE',
    'PRINCE NEEDS HELP',
    'HOT SINGLES NEARBY',
    'UPDATE BIOS NOW!!!',
    'malware.exe ready',
    'CALL THIS NUMBER',
    'WORK FROM HOME $$$',
    'BUY CRYPTO NOW',
    'YOUR PC IS SLOW',
    'ALEXA HAS A VIRUS',
    'CONGRATS CLICK 2 WIN',
    'YOUR ECHO IS FAKE',
    'FREE V-BUCKS HERE',
    'DOWNLOAD TOOLBAR',
    'YOUR BANK NEEDS PIN',
    'SCAN FOR ERRORS',
    'IRS WILL ARREST U',
    'AMAZON ORDER 99999',
    'click for ✨ free ✨ ram'
  ];

  // Bosses are huge satirical "spam" packets
  const BOSSES = [
    { name: 'AMAZON ISP OUTAGE',     hp: 18, color: '#ff3366', loot: 'plus' },
    { name: 'BROADCAST INSTEAD OF SKILL', hp: 24, color: '#ff7a18', loot: 'plus' },
    { name: 'ROUTINE GONE ROGUE',    hp: 30, color: '#ff2bd6', loot: 'plus' },
    { name: 'CERT REVIEW REJECTED',  hp: 36, color: '#b026ff', loot: 'plus' }
  ];

  // ---------- Input ----------
  const keys = {};
  let touchActive = false;
  let touchX = W / 2;
  // Tap-vs-drag detection so sliding to reposition doesn't accidentally fire.
  let touchStartClientX = 0, touchStartClientY = 0, touchStartT = 0;
  let touchDragged = false;
  const TAP_MAX_DIST_PX = 12;   // px in client coords; beyond this, treat as drag
  const TAP_MAX_TIME_MS = 350;

  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    if (e.key.toLowerCase() === 'p') togglePause();
    if (e.key.toLowerCase() === 'm') toggleMusic();
  });
  window.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

  // Touch: drag to reposition, *tap* to shoot. A tap is defined as a touch
  // that moves <12px and ends within 350ms. Anything longer or further
  // counts as a drag and never fires a shot.
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    touchActive = true;
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    touchStartClientX = t.clientX;
    touchStartClientY = t.clientY;
    touchStartT = performance.now();
    touchDragged = false;
    touchX = ((t.clientX - r.left) / r.width) * W;
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    touchX = ((t.clientX - r.left) / r.width) * W;
    if (!touchDragged) {
      const dx = t.clientX - touchStartClientX;
      const dy = t.clientY - touchStartClientY;
      if (dx * dx + dy * dy > TAP_MAX_DIST_PX * TAP_MAX_DIST_PX) touchDragged = true;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', e => {
    touchActive = false;
    const dt = performance.now() - touchStartT;
    if (!touchDragged && dt < TAP_MAX_TIME_MS) {
      if (game.state === 'playing') tryShoot();
      else if (game.state === 'menu' || game.state === 'gameover') startGame();
    }
  });
  canvas.addEventListener('touchcancel', () => { touchActive = false; touchDragged = true; });

  // Mouse fallback: click to shoot
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    touchX = ((e.clientX - r.left) / r.width) * W;
  });
  canvas.addEventListener('mousedown', () => {
    if (game.state === 'playing') tryShoot();
    else if (game.state === 'menu' || game.state === 'gameover') startGame();
  });

  // ---------- Game state ----------
  const game = {
    state: 'menu',  // menu, playing, paused, gameover, wave_intro
    waveIntroUntil: 0,
    score: 0,
    combo: 1,
    lives: 3,
    wave: 0,
    spawnCooldown: 0,
    enemies: [],
    bullets: [],
    particles: [],
    powerups: [],
    floaters: [],   // floating score text
    starfield: [],
    bossAlive: false,
    powerup: { type: null, until: 0 },
    lastShot: 0,
    waveTargetReal: 0,
    waveTargetSpam: 0,
    waveDeliveredReal: 0,
    waveBlockedSpam: 0,
    wavePassedSpam: 0,
    waveDestroyedReal: 0
  };

  // Player
  const player = {
    x: W / 2, y: H - 56, w: 48, h: 16, speed: 4.6, cooldown: 0,
    flash: 0
  };

  // ---------- Starfield ----------
  for (let i = 0; i < 80; i++) {
    game.starfield.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z: 0.3 + Math.random() * 1.7,
      c: ['#ff2bd6', '#00f0ff', '#b026ff', '#39ff14', '#ffe600'][Math.floor(Math.random() * 5)]
    });
  }

  // ---------- Helpers ----------
  const rand    = (a, b) => a + Math.random() * (b - a);
  const choice  = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp   = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- Spawning ----------
  function startWave(n) {
    game.wave = n;
    const isBossWave = (n % 5 === 0);
    if (isBossWave) {
      const boss = BOSSES[Math.floor((n / 5 - 1)) % BOSSES.length];
      spawnBoss(boss);
      game.bossAlive = true;
      game.waveTargetSpam = 0;
      game.waveTargetReal = 0;
    } else {
      // Increasing intensity
      game.waveTargetSpam = 6 + n * 2;
      game.waveTargetReal = 3 + Math.floor(n * 1.2);
    }
    game.waveBlockedSpam = 0;
    game.waveDeliveredReal = 0;
    game.wavePassedSpam = 0;
    game.waveDestroyedReal = 0;
    game.state = 'wave_intro';
    game.waveIntroUntil = performance.now() + 1800;
    SFX.bossWarn();
  }

  function spawnEnemy() {
    if (game.bossAlive) return;
    const totalSpawned = game.waveBlockedSpam + game.waveDeliveredReal +
                         game.wavePassedSpam + game.waveDestroyedReal +
                         game.enemies.filter(e => !e.dying && !e.boss).length;
    const totalGoal = game.waveTargetSpam + game.waveTargetReal;
    if (totalSpawned >= totalGoal) return;

    const remainingSpam = game.waveTargetSpam - game.waveBlockedSpam - game.wavePassedSpam -
                          game.enemies.filter(e => e.type === 'spam' && !e.dying).length;
    const remainingReal = game.waveTargetReal - game.waveDeliveredReal - game.waveDestroyedReal -
                          game.enemies.filter(e => e.type === 'real' && !e.dying).length;
    if (remainingSpam <= 0 && remainingReal <= 0) return;

    let type;
    if (remainingSpam <= 0) type = 'real';
    else if (remainingReal <= 0) type = 'spam';
    else type = Math.random() < 0.65 ? 'spam' : 'real';

    // Pick a text that wasn't used in the previous 4 spawns (variety).
    const pool = type === 'spam' ? SPAM_PUSHES : REAL_PUSHES;
    const recent = (game._recentTexts = game._recentTexts || []);
    let text;
    for (let tries = 0; tries < 8; tries++) {
      text = choice(pool);
      if (!recent.includes(text)) break;
    }
    recent.push(text);
    if (recent.length > 5) recent.shift();

    const speed = 0.6 + game.wave * 0.12 + Math.random() * 0.4;
    const w = Math.min(220, 80 + text.length * 7);
    const minX = w / 2 + 8;
    const maxX = W - w / 2 - 8;
    const e = {
      type,
      text,
      x: rand(minX, maxX),
      y: -40,
      vy: speed,
      vx: rand(-0.3, 0.3),
      w,
      h: 30,
      hp: 1,
      dying: false,
      dieT: 0,
      shake: 0
    };
    game.enemies.push(e);
  }

  function spawnBoss(b) {
    const e = {
      type: 'spam', boss: true, bossData: b,
      text: b.name, x: W / 2, y: -60, vy: 0.35, vx: 0,
      w: 320, h: 64, hp: b.hp, maxHp: b.hp,
      dying: false, dieT: 0, shake: 0,
      wob: Math.random() * Math.PI * 2
    };
    game.enemies.push(e);
  }

  // ---------- Shooting ----------
  function tryShoot() {
    const now = performance.now();
    const cd = game.powerup.type === 'lite' ? 90 : 180;
    if (now - game.lastShot < cd) return;
    game.lastShot = now;
    const px = player.x;
    const py = player.y - 6;
    if (game.powerup.type === 'plus' && now < game.powerup.until) {
      game.bullets.push({ x: px - 10, y: py, vy: -10, vx: -1.2, w: 6, h: 14 });
      game.bullets.push({ x: px,      y: py, vy: -11, vx: 0,    w: 6, h: 14 });
      game.bullets.push({ x: px + 10, y: py, vy: -10, vx: 1.2,  w: 6, h: 14 });
    } else {
      game.bullets.push({ x: px, y: py, vy: -10, vx: 0, w: 6, h: 14 });
    }
    SFX.laser();
  }

  // ---------- Power-ups ----------
  function spawnPowerup(x, y) {
    const r = Math.random();
    let type;
    if (r < 0.4) type = 'lite';
    else if (r < 0.7) type = 'plus';
    else if (r < 0.85) type = 'courtesy';
    else type = 'brief';
    game.powerups.push({ x, y, vy: 1.2, type, t: 0 });
  }

  function activatePowerup(type) {
    const now = performance.now();
    if (type === 'lite')      { game.powerup = { type: 'lite',  until: now + 8000 }; PCCA.toast('LITE TIER', 'Rapid fire for 8s'); }
    else if (type === 'plus') { game.powerup = { type: 'plus',  until: now + 9000 }; PCCA.toast('PLUS TIER', 'Triple shot for 9s'); }
    else if (type === 'brief'){ game.powerup = { type: 'brief', until: now + 4500 }; PCCA.toast('BRIEF MODE', 'Slow-mo for 4.5s'); }
    else if (type === 'courtesy') {
      if (game.lives < 5) game.lives++;
      PCCA.toast('COURTESY ACCESS', 'One life restored');
    }
    SFX.pickup();
  }

  // ---------- Collision ----------
  function rectsOverlap(a, b) {
    return Math.abs(a.x - b.x) * 2 < (a.w + b.w) &&
           Math.abs(a.y - b.y) * 2 < (a.h + b.h);
  }

  // ---------- Floaters ----------
  function addFloater(text, x, y, color) {
    game.floaters.push({ text, x, y, vy: -1.0, life: 50, color: color || '#ffe600' });
  }

  // ---------- Particles ----------
  function burst(x, y, color, count) {
    count = count || 14;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 4);
      game.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(20, 40), color
      });
    }
  }

  // ---------- Update ----------
  function update(dt) {
    // starfield
    for (const s of game.starfield) {
      s.y += s.z * 0.4;
      if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
    }

    if (game.state === 'wave_intro') {
      if (performance.now() > game.waveIntroUntil) game.state = 'playing';
    }

    if (game.state !== 'playing') return;

    const slow = (game.powerup.type === 'brief' && performance.now() < game.powerup.until) ? 0.4 : 1.0;

    // Player movement
    if (touchActive) {
      // ease toward touch
      const tx = clamp(touchX, 30, W - 30);
      player.x += (tx - player.x) * 0.25;
    } else {
      let mv = 0;
      if (keys['arrowleft']  || keys['a']) mv -= 1;
      if (keys['arrowright'] || keys['d']) mv += 1;
      player.x += mv * player.speed;
      player.x = clamp(player.x, 30, W - 30);
    }

    // Auto-fire while holding space
    if (keys[' '] || keys['space']) tryShoot();

    if (player.flash > 0) player.flash--;

    // Spawn enemies
    if (!game.bossAlive) {
      game.spawnCooldown -= dt;
      if (game.spawnCooldown <= 0) {
        spawnEnemy();
        game.spawnCooldown = Math.max(220, 900 - game.wave * 50) - Math.random() * 200;
      }
    }

    // Update bullets
    for (const b of game.bullets) { b.x += b.vx; b.y += b.vy * slow; }
    game.bullets = game.bullets.filter(b => b.y > -10 && b.x > -10 && b.x < W + 10);

    // Update enemies
    for (const e of game.enemies) {
      if (e.dying) { e.dieT += dt; continue; }
      e.y += e.vy * slow;
      if (e.boss) {
        e.wob += 0.03 * slow;
        e.x = W / 2 + Math.sin(e.wob) * (W * 0.32);
        if (e.y > 80) { e.y = 80; e.vy = 0; }
      } else {
        e.x += e.vx * slow;
        const half = e.w / 2 + 4;
        if (e.x < half || e.x > W - half) e.vx *= -1;
      }
      if (e.shake > 0) e.shake--;
    }

    // Bullet vs enemy
    for (const b of game.bullets) {
      for (const e of game.enemies) {
        if (e.dying) continue;
        if (rectsOverlap(b, { x: e.x, y: e.y, w: e.w, h: e.h })) {
          e.hp--;
          b.y = -100; // mark dead
          e.shake = 6;
          burst(b.x, b.y, e.type === 'spam' ? '#ff2bd6' : '#00f0ff', 6);
          SFX.hit();
          if (e.hp <= 0) {
            e.dying = true;
            killEnemy(e);
          }
          break;
        }
      }
    }
    game.bullets = game.bullets.filter(b => b.y > -10);

    // Enemy reaches bottom or PC
    for (const e of game.enemies) {
      if (e.dying) continue;
      if (e.y > H - 70) {
        if (e.type === 'spam') {
          // spam reached PC — lose a life
          game.lives--;
          game.combo = 1;
          game.wavePassedSpam++;
          player.flash = 20;
          burst(e.x, e.y, '#ff3366', 26);
          SFX.error();
          addFloater('-1 LIFE', e.x, e.y - 20, '#ff3366');
          e.dying = true; e.dieT = 30;
          if (game.lives <= 0) gameOver();
        } else {
          // real push delivered — good!
          game.score += Math.floor(50 * game.combo);
          game.combo = Math.min(8, game.combo + 0.2);
          game.waveDeliveredReal++;
          burst(e.x, e.y, '#39ff14', 18);
          SFX.confirm();
          addFloater('+' + Math.floor(50 * game.combo), e.x, e.y - 20, '#39ff14');
          e.dying = true; e.dieT = 30;
        }
      }
    }

    // Cull dead enemies
    game.enemies = game.enemies.filter(e => !(e.dying && e.dieT > 30));

    // Update powerups
    for (const p of game.powerups) { p.y += p.vy; p.t += dt; }
    game.powerups = game.powerups.filter(p => p.y < H + 20);
    // Player collects powerup
    for (const p of game.powerups) {
      if (Math.abs(p.x - player.x) < 22 && Math.abs(p.y - player.y) < 22) {
        activatePowerup(p.type);
        p.collected = true;
      }
    }
    game.powerups = game.powerups.filter(p => !p.collected);

    // Particles & floaters
    for (const pa of game.particles) { pa.x += pa.vx; pa.y += pa.vy; pa.vx *= 0.96; pa.vy *= 0.96; pa.life--; }
    game.particles = game.particles.filter(pa => pa.life > 0);
    for (const f of game.floaters) { f.y += f.vy; f.life--; }
    game.floaters = game.floaters.filter(f => f.life > 0);

    // Wave completion check
    if (!game.bossAlive) {
      const allSpawned = (game.waveBlockedSpam + game.wavePassedSpam + game.waveDestroyedReal + game.waveDeliveredReal) >= (game.waveTargetSpam + game.waveTargetReal);
      const noActive = game.enemies.filter(e => !e.dying).length === 0;
      if (allSpawned && noActive) {
        SFX.levelup();
        // Wave bonus
        const bonus = 200 + game.wave * 50;
        game.score += bonus;
        addFloater('+' + bonus + ' WAVE BONUS', W / 2, H / 2, '#ffe600');
        setTimeout(() => startWave(game.wave + 1), 1000);
        game.state = 'wave_intro'; // freeze spawning while transition runs
        game.waveIntroUntil = performance.now() + 1300;
      }
    }
  }

  function killEnemy(e) {
    if (e.boss) {
      game.bossAlive = false;
      game.score += 1500;
      addFloater('+1500 BOSS', e.x, e.y - 20, '#ffe600');
      burst(e.x, e.y, e.bossData.color, 60);
      SFX.explode();
      spawnPowerup(e.x, e.y);
      spawnPowerup(e.x - 30, e.y);
      // boss wave completes when boss dies
      setTimeout(() => startWave(game.wave + 1), 1200);
      game.state = 'wave_intro';
      game.waveIntroUntil = performance.now() + 1400;
      return;
    }
    if (e.type === 'spam') {
      const pts = Math.floor(100 * game.combo);
      game.score += pts;
      game.combo = Math.min(8, game.combo + 0.15);
      game.waveBlockedSpam++;
      PCCA.bumpStat('pushesBlocked');
      burst(e.x, e.y, '#ff2bd6', 22);
      SFX.explode();
      addFloater('+' + pts, e.x, e.y - 20, '#ff2bd6');
      if (Math.random() < 0.10) spawnPowerup(e.x, e.y);
    } else {
      // destroyed a real push by mistake — penalty!
      game.score = Math.max(0, game.score - 75);
      game.combo = 1;
      game.waveDestroyedReal++;
      burst(e.x, e.y, '#ff3366', 16);
      SFX.badblip();
      addFloater('-75 REAL PUSH!', e.x, e.y - 20, '#ff3366');
    }
  }

  // ---------- Drawing ----------
  function draw() {
    // Background
    ctx.fillStyle = '#050118';
    ctx.fillRect(0, 0, W, H);

    // Synthwave horizon
    const hor = H * 0.55;
    const grd = ctx.createLinearGradient(0, 0, 0, hor);
    grd.addColorStop(0, '#1a0640');
    grd.addColorStop(1, '#3a0760');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, hor);

    // Stars
    for (const s of game.starfield) {
      ctx.fillStyle = s.c;
      ctx.globalAlpha = 0.55 + (s.z / 2) * 0.3;
      ctx.fillRect(s.x, s.y, s.z * 1.4, s.z * 1.4);
    }
    ctx.globalAlpha = 1;

    // Floor grid (synthwave)
    ctx.strokeStyle = 'rgba(255, 43, 214, 0.4)';
    ctx.lineWidth = 1;
    const offset = (performance.now() * 0.08) % 30;
    for (let i = 0; i < 12; i++) {
      const y = hor + i * 30 + offset;
      if (y > H) continue;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let x = -W; x <= W * 2; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, hor);
      ctx.lineTo(W / 2 + (x - W / 2) * 4, H);
      ctx.stroke();
    }

    // PC base (player tower)
    drawPC();

    // Bullets
    for (const b of game.bullets) {
      ctx.fillStyle = '#00f0ff';
      ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 10;
      ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
      ctx.shadowBlur = 0;
    }

    // Enemies (pushes)
    for (const e of game.enemies) drawEnemy(e);

    // Powerups
    for (const p of game.powerups) drawPowerup(p);

    // Particles
    for (const pa of game.particles) {
      ctx.globalAlpha = clamp(pa.life / 40, 0, 1);
      ctx.fillStyle = pa.color;
      ctx.fillRect(pa.x - 1.5, pa.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    // Floaters
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    for (const f of game.floaters) {
      ctx.globalAlpha = clamp(f.life / 50, 0, 1);
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color; ctx.shadowBlur = 8;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Wave intro overlay
    if (game.state === 'wave_intro') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, H / 2 - 60, W, 120);
      ctx.font = 'bold 22px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff2bd6';
      ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 12;
      ctx.fillText('WAVE ' + game.wave, W / 2, H / 2 - 10);
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillStyle = '#00f0ff'; ctx.shadowColor = '#00f0ff';
      ctx.fillText(game.wave % 5 === 0 ? '⚠ BOSS INCOMING ⚠' : 'INCOMING TRAFFIC', W / 2, H / 2 + 24);
      ctx.shadowBlur = 0;
    }

    // Pause overlay
    if (game.state === 'paused') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 26px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe600';
      ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 14;
      ctx.fillText('PAUSED', W / 2, H / 2);
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
      ctx.fillText('Press P to resume', W / 2, H / 2 + 28);
    }

    updateHUD();
  }

  function drawPC() {
    // Cute little CRT monitor
    const x = player.x, y = player.y;
    if (player.flash > 0 && (player.flash % 4 < 2)) {
      ctx.globalAlpha = 0.5;
    }
    // base / stand
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 14, y + 12, 28, 6);
    ctx.fillRect(x - 22, y + 18, 44, 4);
    // monitor body
    ctx.fillStyle = '#1a0a30';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.fillRect(x - 26, y - 16, 52, 32);
    ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 12;
    ctx.strokeRect(x - 26, y - 16, 52, 32);
    ctx.shadowBlur = 0;
    // screen
    ctx.fillStyle = '#001a30';
    ctx.fillRect(x - 22, y - 12, 44, 24);
    // smiley face on screen
    ctx.fillStyle = '#00ff88';
    ctx.shadowColor = '#39ff14'; ctx.shadowBlur = 8;
    ctx.fillRect(x - 10, y - 5, 4, 4);
    ctx.fillRect(x + 6, y - 5, 4, 4);
    ctx.fillRect(x - 8, y + 3, 16, 2);
    ctx.shadowBlur = 0;
    // turret
    ctx.fillStyle = '#ff2bd6';
    ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 8;
    ctx.fillRect(x - 2, y - 22, 4, 8);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawEnemy(e) {
    const sx = e.shake ? (Math.random() - 0.5) * 4 : 0;
    const sy = e.shake ? (Math.random() - 0.5) * 4 : 0;
    const x = e.x + sx, y = e.y + sy;
    const color  = e.type === 'spam' ? '#ff2bd6' : '#00f0ff';
    const colorD = e.type === 'spam' ? '#ff66e6' : '#66f6ff';
    const bg     = e.type === 'spam' ? 'rgba(40, 0, 30, 0.92)' : 'rgba(0, 20, 40, 0.92)';

    if (e.dying) {
      ctx.globalAlpha = clamp((30 - e.dieT) / 30, 0, 1);
    }

    // Drop shadow / glow
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillStyle = bg;
    roundRect(x - e.w / 2, y - e.h / 2, e.w, e.h, 6);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Bell icon
    ctx.fillStyle = colorD;
    ctx.fillRect(x - e.w / 2 + 6, y - 4, 8, 8);
    ctx.fillRect(x - e.w / 2 + 9, y - 8, 2, 4);

    // Text
    ctx.font = e.boss ? 'bold 14px "Press Start 2P", monospace' : 'bold 10px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    const maxChars = Math.floor((e.w - 24) / (e.boss ? 11 : 8));
    let txt = e.text;
    if (txt.length > maxChars) txt = txt.slice(0, maxChars - 1) + '…';
    ctx.fillText(txt, x - e.w / 2 + 18, y + (e.boss ? 5 : 4));
    ctx.shadowBlur = 0;

    // Boss HP bar
    if (e.boss) {
      const hpFrac = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = '#330'; ctx.fillRect(x - e.w / 2, y + e.h / 2 + 4, e.w, 4);
      ctx.fillStyle = '#ff7a18'; ctx.fillRect(x - e.w / 2, y + e.h / 2 + 4, e.w * hpFrac, 4);
    }

    ctx.globalAlpha = 1;
  }

  function drawPowerup(p) {
    const colors = { lite: '#ff7a18', plus: '#b026ff', courtesy: '#39ff14', brief: '#00f0ff' };
    const label  = { lite: 'L',       plus: 'P',       courtesy: '+',       brief: 'B' };
    const c = colors[p.type];
    const bob = Math.sin(p.t * 0.01) * 3;
    ctx.shadowColor = c; ctx.shadowBlur = 14;
    ctx.fillStyle = '#0a0420';
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 12, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = c;
    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label[p.type], p.x, p.y + bob + 4);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ---------- HUD ----------
  function updateHUD() {
    hudScore.textContent = PCCA.fmtNum(game.score);
    hudWave.textContent  = game.wave || '–';
    hudLives.textContent = '♥'.repeat(Math.max(0, game.lives));
    hudCombo.textContent = (game.combo).toFixed(1) + 'x';
    hudHigh.textContent  = PCCA.fmtNum(PCCA.state().highScores.pushDefender || 0);
    if (game.powerup.type && performance.now() < game.powerup.until) {
      const left = Math.ceil((game.powerup.until - performance.now()) / 1000);
      hudPower.textContent = game.powerup.type.toUpperCase() + ' ' + left + 's';
    } else {
      hudPower.textContent = '—';
      if (game.powerup.type && performance.now() >= game.powerup.until) game.powerup.type = null;
    }
  }

  // ---------- Game flow ----------
  function startGame() {
    overlay.classList.add('hidden');
    game.score = 0;
    game.combo = 1;
    game.lives = 3;
    game.enemies = [];
    game.bullets = [];
    game.particles = [];
    game.powerups = [];
    game.floaters = [];
    game.powerup = { type: null, until: 0 };
    game.bossAlive = false;
    startWave(1);
    MUSIC.start({ bpm: 130 });
  }

  function gameOver() {
    game.state = 'gameover';
    MUSIC.stop();
    SFX.gameover();
    const isNew = PCCA.setHighScore('pushDefender', game.score);
    PCCA.announceAchievements(PCCA.checkAchievements());
    overlay.classList.remove('hidden');
    overlayBody.innerHTML =
      '<h2>GAME OVER</h2>' +
      '<p>Final score: <span class="glow-yellow">' + PCCA.fmtNum(game.score) + '</span></p>' +
      '<p>Wave reached: <span class="glow-cyan">' + game.wave + '</span></p>' +
      (isNew ? '<p class="glow-pink flicker">★ NEW HIGH SCORE ★</p>' : '<p class="muted">High score: ' + PCCA.fmtNum(PCCA.state().highScores.pushDefender) + '</p>') +
      '<div class="row center mt-2"><button class="btn pink" id="btnRestart">Play Again</button> <a class="btn" href="../index.html">Arcade</a></div>';
    document.getElementById('btnRestart').addEventListener('click', startGame);
  }

  function togglePause() {
    if (game.state === 'playing') { game.state = 'paused'; MUSIC.stop(); }
    else if (game.state === 'paused') { game.state = 'playing'; MUSIC.start({ bpm: 130 }); }
  }

  function toggleMusic() {
    const s = PCCA.state();
    s.settings.musicOn = !s.settings.musicOn;
    PCCA.patch({ settings: s.settings });
    if (s.settings.musicOn && game.state === 'playing') MUSIC.start({ bpm: 130 });
    else MUSIC.stop();
    PCCA.toast('Music', s.settings.musicOn ? 'ON' : 'OFF', { duration: 1500 });
  }

  // ---------- Main loop ----------
  let lastT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min(50, now - lastT);
    lastT = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- Initial menu ----------
  function showMenu() {
    overlay.classList.remove('hidden');
    overlayBody.innerHTML =
      '<h2>PUSH DEFENDER</h2>' +
      '<p>Pushes are streaming in from the cloud.</p>' +
      '<p><span class="glow-cyan">CYAN</span> = real commands. Let them reach your PC.<br>' +
      '<span class="glow-pink">PINK</span> = spam. Blast them with <kbd>SPACE</kbd>.</p>' +
      '<p class="muted" style="font-size:0.95rem;">Move: <kbd>← →</kbd> or <kbd>A D</kbd> · Pause: <kbd>P</kbd> · Mute music: <kbd>M</kbd></p>' +
      '<p>High score: <span class="glow-yellow">' + PCCA.fmtNum(PCCA.state().highScores.pushDefender || 0) + '</span></p>' +
      '<div class="row center mt-2"><button class="btn pink" id="btnStart">START</button> <a class="btn" href="../index.html">Arcade</a></div>';
    document.getElementById('btnStart').addEventListener('click', startGame);
  }

  showMenu();
  requestAnimationFrame(loop);

  // Debug hook (safe in prod — just exposes state + a few test helpers)
  window.__pd = {
    game, player,
    // Force-spawn a basic spam enemy at the given x, near the top
    _spawnTestEnemy(x = W / 2, y = 60) {
      const e = {
        type: 'spam', boss: false,
        text: 'TEST SPAM', x, y, vy: 0, vx: 0,
        w: 160, h: 30, hp: 1,
        dying: false, dieT: 0, shake: 0, wob: 0
      };
      game.enemies.push(e);
      return e;
    },
    // Force-spawn a bullet at the given x just above the player
    _spawnTestBullet(x = W / 2, y = H - 80) {
      const b = { x, y, vy: -10, vx: 0, w: 6, h: 14 };
      game.bullets.push(b);
      return b;
    }
  };
})();
