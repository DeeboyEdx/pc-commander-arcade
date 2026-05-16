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
