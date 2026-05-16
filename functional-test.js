// Functional test — actually drive the games for a few seconds and confirm no errors.

const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ permissions: [] });
  let failures = 0;

  async function check(name, fn) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    try {
      await fn(page);
      if (errors.length) { failures++; console.log('❌ ' + name); errors.forEach(e => console.log('   - ' + e)); }
      else console.log('✅ ' + name);
    } catch (e) {
      failures++;
      console.log('❌ ' + name + ' — ' + e.message);
    }
    await page.close();
  }

  // ---- Push Defender: click START, simulate keyboard, run for 5s ----
  await check('push-defender: start + run 5s', async (page) => {
    await page.goto(BASE + '/games/push-defender.html', { waitUntil: 'networkidle' });
    await page.click('#btnStart');
    // Hold space and an arrow key for 5 seconds
    await page.keyboard.down(' ');
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up(' ');
    // pause
    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    await page.keyboard.press('p');
    await page.waitForTimeout(200);
  });

  // ---- Push Defender: bullets must actually hit enemies (regression test) ----
  await check('push-defender: bullet hits enemy', async (page) => {
    await page.goto(BASE + '/games/push-defender.html', { waitUntil: 'networkidle' });
    await page.click('#btnStart');
    // Wait for game to be in 'playing' state and __pd debug hook exposed
    await page.waitForFunction(() => window.__pd && window.__pd.game && window.__pd.game.state === 'playing', { timeout: 3000 });
    // Clear any naturally-spawned enemies and bullets so the test is deterministic
    await page.evaluate(() => {
      window.__pd.game.enemies.length = 0;
      window.__pd.game.bullets.length = 0;
      window.__pd.game.score = 0;
    });
    // Spawn one enemy at a known position and a bullet *just below* it so
    // it collides in the next 1-2 frames, before any naturally-spawned
    // enemy can intercept the bullet.
    const before = await page.evaluate(() => {
      const pd = window.__pd;
      const e = pd._spawnTestEnemy(pd.player.x, 200);
      e._isTest = true;
      pd._spawnTestBullet(pd.player.x, 230);
      return { enemies: pd.game.enemies.length, bullets: pd.game.bullets.length };
    });
    if (before.enemies !== 1 || before.bullets !== 1) {
      throw new Error('test setup wrong: ' + JSON.stringify(before));
    }
    // 100ms is ~6 frames — plenty of time for the bullet to traverse 30px
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
      const g = window.__pd.game;
      const testEnemy = g.enemies.find(e => e._isTest);
      return {
        testEnemyStillAlive: !!(testEnemy && !testEnemy.dying),
        score: g.score
      };
    });
    if (after.testEnemyStillAlive) {
      throw new Error('bullet did not kill the test enemy — collision broken');
    }
    if (!(after.score > 0)) {
      throw new Error('expected score > 0 after kill, got ' + after.score);
    }
  });

  // ---- Push Defender: tap fires, drag doesn't (regression) ----
  await check('push-defender: tap fires, drag does not', async (page) => {
    // Touch-emulating context
    const tctx = await browser.newContext({ hasTouch: true, viewport: { width: 700, height: 900 } });
    const tpage = await tctx.newPage();
    const errs = [];
    tpage.on('pageerror', e => errs.push(e.message));
    await tpage.goto(BASE + '/games/push-defender.html', { waitUntil: 'networkidle' });
    await tpage.click('#btnStart');
    await tpage.waitForFunction(() => window.__pd && window.__pd.game && window.__pd.game.state === 'playing', { timeout: 3000 });
    // Find canvas bounds
    const box = await tpage.locator('canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Reset bullets, then perform a SLIDE (drag) and assert no bullet is fired.
    await tpage.evaluate(() => { window.__pd.game.bullets.length = 0; });
    await tpage.touchscreen.tap(cx, cy); // first prime any audio unlock, but this also counts as a tap
    await tpage.waitForTimeout(50);
    // clear again, this time test only the drag
    await tpage.evaluate(() => { window.__pd.game.bullets.length = 0; });
    // Perform a slow slide that exceeds the tap threshold
    const slideSteps = 10;
    await tpage.evaluate(({x, y}) => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      const ev = new Touch({ identifier: 1, target: c, clientX: x, clientY: y, pageX: x, pageY: y });
      c.dispatchEvent(new TouchEvent('touchstart', { touches: [ev], targetTouches: [ev], changedTouches: [ev], bubbles: true, cancelable: true }));
    }, { x: cx, y: cy });
    for (let i = 1; i <= slideSteps; i++) {
      const dx = (80 * i) / slideSteps;
      await tpage.evaluate(({x, y}) => {
        const c = document.querySelector('canvas');
        const ev = new Touch({ identifier: 1, target: c, clientX: x, clientY: y, pageX: x, pageY: y });
        c.dispatchEvent(new TouchEvent('touchmove', { touches: [ev], targetTouches: [ev], changedTouches: [ev], bubbles: true, cancelable: true }));
      }, { x: cx + dx, y: cy });
      await tpage.waitForTimeout(20);
    }
    await tpage.evaluate(({x, y}) => {
      const c = document.querySelector('canvas');
      const ev = new Touch({ identifier: 1, target: c, clientX: x, clientY: y, pageX: x, pageY: y });
      c.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [ev], bubbles: true, cancelable: true }));
    }, { x: cx + 80, y: cy });
    await tpage.waitForTimeout(80);
    const afterDrag = await tpage.evaluate(() => window.__pd.game.bullets.length);
    if (afterDrag !== 0) throw new Error('drag fired ' + afterDrag + ' bullet(s); expected 0');

    // Now perform a real tap and assert at least one bullet appears
    await tpage.evaluate(() => { window.__pd.game.bullets.length = 0; });
    await tpage.touchscreen.tap(cx, cy);
    await tpage.waitForTimeout(80);
    const afterTap = await tpage.evaluate(() => window.__pd.game.bullets.length);
    if (afterTap < 1) throw new Error('tap did not fire any bullet');

    if (errs.length) throw new Error('page errors: ' + errs.join(' | '));
    await tctx.close();
  });


  await check('voice-commander: start + type + submit', async (page) => {
    await page.goto(BASE + '/games/voice-commander.html', { waitUntil: 'networkidle' });
    // Pick a known language for determinism
    await page.selectOption('#langPick', 'en');
    await page.click('#btnStart');
    await page.waitForTimeout(800);
    // Read the prompt and feed it back to test perfect match.
    const prompt = await page.$eval('#prompt', el => el.textContent.trim());
    await page.fill('#typeInput', prompt);
    await page.click('#btnSubmit');
    await page.waitForTimeout(1500);
    // Should have advanced to next round or game over
    const score = await page.$eval('#vScore', el => el.textContent.trim());
    if (score === '0') throw new Error('score did not update after perfect match (was 0)');
  });

  // ---- Echo Synth: add phrase, then save PNG ----
  await check('echo-synth: add phrase + save', async (page) => {
    await page.goto(BASE + '/games/echo-synth.html', { waitUntil: 'networkidle' });
    await page.fill('#phrase', 'hello world arcade');
    await page.click('#btnAdd');
    await page.waitForTimeout(400);
    // Check star count is > 0 (intro phrase + new one)
    const stars = await page.$eval('#totalWords', el => parseInt(el.textContent, 10));
    if (!(stars > 0)) throw new Error('expected stars > 0, got ' + stars);
    // Save image - trigger download
    const downloadPromise = page.waitForEvent('download', { timeout: 3000 });
    await page.click('#btnSave');
    const dl = await downloadPromise;
    if (!dl.suggestedFilename().startsWith('echo-synth-')) throw new Error('unexpected download filename: ' + dl.suggestedFilename());
  });

  // ---- About: check that achievements rendered ----
  await check('about: achievements render', async (page) => {
    await page.goto(BASE + '/about.html', { waitUntil: 'networkidle' });
    const count = await page.$$eval('.ach', els => els.length);
    if (count < 5) throw new Error('expected at least 5 achievement cards, got ' + count);
  });

  // ---- About: nav links resolve to real pages (root-relative, not ../) ----
  await check('about: nav links resolve to 200', async (page) => {
    await page.goto(BASE + '/about.html', { waitUntil: 'networkidle' });
    const hrefs = await page.$$eval('.nav a', els => els.map(a => a.getAttribute('href')));
    if (hrefs.length === 0) throw new Error('no nav links found');
    for (const href of hrefs) {
      if (href.startsWith('../')) {
        throw new Error('about.html nav link still uses ../ prefix: ' + href);
      }
      const resp = await page.request.get(new URL(href, page.url()).toString());
      if (resp.status() !== 200) {
        throw new Error('nav link ' + href + ' returned ' + resp.status());
      }
    }
  });

  // ---- Push Defender: tractor beam yanks an enemy to the floor ----
  await check('push-defender: tractor beam slams enemy', async (page) => {
    await page.goto(BASE + '/games/push-defender.html', { waitUntil: 'networkidle' });
    await page.click('#btnStart');
    await page.waitForFunction(() => window.__pd && window.__pd.game && window.__pd.game.state === 'playing', { timeout: 3000 });
    await page.evaluate(() => {
      const pd = window.__pd;
      pd.game.enemies.length = 0;
      pd.game.bullets.length = 0;
      pd.game.score = 0;
      pd.game.lives = 3;
      pd.player.tractorCooldown = 0;
    });
    // Spawn a REAL push (cyan) above the player and tractor-beam it
    const beforeLives = await page.evaluate(() => {
      const pd = window.__pd;
      const e = pd._spawnTestEnemy(pd.player.x, 200);
      e.type = 'real';
      e._isTest = true;
      return pd.game.lives;
    });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(600); // enemy should slam down and trigger floor logic
    const after = await page.evaluate(() => {
      const g = window.__pd.game;
      const stillAlive = g.enemies.some(e => e._isTest && !e.dying);
      return { stillAlive, score: g.score, lives: g.lives };
    });
    if (after.stillAlive) throw new Error('tractor-beamed real push still alive after 600ms');
    if (!(after.score > 0)) throw new Error('expected score > 0 after delivering real push, got ' + after.score);
    if (after.lives !== beforeLives) throw new Error('delivering a real push should not cost a life');

    // Now spawn a SPAM and tractor it: lives should drop
    await page.evaluate(() => {
      const pd = window.__pd;
      pd.game.enemies.length = 0;
      pd.player.tractorCooldown = 0;
      const e = pd._spawnTestEnemy(pd.player.x, 200);
      e.type = 'spam';
      e._isTest = true;
    });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(600);
    const after2 = await page.evaluate(() => ({ lives: window.__pd.game.lives }));
    if (after2.lives >= 3) throw new Error('tractor-beaming a spam should cost a life (lives=' + after2.lives + ')');
  });

  // ---- Push Defender: tractor beam picks the FIRST enemy in front, not
  // ----   a more-centered one further away (regression for "pulled bad
  // ----   push from behind a good push")
  await check('push-defender: tractor targets nearest enemy in column', async (page) => {
    await page.goto(BASE + '/games/push-defender.html', { waitUntil: 'networkidle' });
    await page.click('#btnStart');
    await page.waitForFunction(() => window.__pd && window.__pd.game && window.__pd.game.state === 'playing', { timeout: 3000 });
    await page.evaluate(() => {
      const pd = window.__pd;
      pd.game.enemies.length = 0;
      pd.game.bullets.length = 0;
      pd.game.score = 0;
      pd.game.lives = 3;
      pd.player.tractorCooldown = 0;
      const px = pd.player.x;
      // SPAM, higher up, perfectly centered on the player
      const upper = pd._spawnTestEnemy(px, 120);
      upper.type = 'spam';
      upper.tag = 'upper-spam';
      // REAL, lower (closer to player), slightly offset — still inside
      // its own hitbox over the column though, so it should be the pick
      const lower = pd._spawnTestEnemy(px + 30, 300);
      lower.type = 'real';
      lower.tag = 'lower-real';
    });
    await page.keyboard.press('ArrowUp');
    // Find which one got tractored within a short window
    await page.waitForTimeout(120);
    const tagged = await page.evaluate(() => {
      const g = window.__pd.game;
      const t = g.enemies.find(e => e.tractored);
      return t ? t.tag : null;
    });
    if (tagged !== 'lower-real') {
      throw new Error("tractor beam should have targeted the closer 'lower-real', got: " + tagged);
    }
    // And after it lands, confirm no life lost (it was a real push)
    await page.waitForTimeout(500);
    const lives = await page.evaluate(() => window.__pd.game.lives);
    if (lives !== 3) throw new Error('lives should be 3 (delivered a real), got ' + lives);
  });

  await browser.close();
  if (failures) { console.log(`\n${failures} functional test(s) failed.`); process.exit(1); }
  else console.log('\nAll functional tests passed.');
})();
