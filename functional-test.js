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
    // Spawn one enemy directly above the player and fire a bullet straight up.
    // Mark this specific test enemy so we can find it later, even if natural
    // spawns add more enemies during the wait.
    const before = await page.evaluate(() => {
      const pd = window.__pd;
      const px = pd.player.x;
      const e = pd._spawnTestEnemy(px, 120);
      e._isTest = true;
      pd._spawnTestBullet(px, pd.player.y - 20);
      return { enemies: pd.game.enemies.length, bullets: pd.game.bullets.length };
    });
    if (before.enemies !== 1 || before.bullets !== 1) {
      throw new Error('test setup wrong: ' + JSON.stringify(before));
    }
    // Give the bullet time to fly up ~500px (10 px/frame ≈ 60 frames ≈ 1s)
    await page.waitForTimeout(1500);
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

  // ---- Voice Commander: start a round, type an answer, submit ----
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

  await browser.close();
  if (failures) { console.log(`\n${failures} functional test(s) failed.`); process.exit(1); }
  else console.log('\nAll functional tests passed.');
})();
