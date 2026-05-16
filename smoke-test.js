// Smoke test all pages via Playwright.
// Loads each page, captures console errors and page errors, and verifies
// that critical DOM elements exist. Exits non-zero if any page fails.

const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8765';

const PAGES = [
  { url: '/index.html',                  required: ['.marquee h1', '.game-grid', '.game-tile'] },
  { url: '/about.html',                  required: ['h1', '#scoresHost', '#achHost'] },
  { url: '/games/push-defender.html',    required: ['#game', '#overlay', '#btnStart'] },
  { url: '/games/voice-commander.html',  required: ['#prompt', '#btnStart', '#langPick'] },
  { url: '/games/echo-synth.html',       required: ['#sky', '#phrase', '#btnAdd'] }
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  let failures = 0;

  for (const page of PAGES) {
    const errors = [];
    const consoleErrors = [];
    const tab = await ctx.newPage();
    tab.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    tab.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
    });
    tab.on('requestfailed', req => {
      // Ignore Google Fonts being unavailable in CI-ish environments
      if (/fonts\.google|gstatic/.test(req.url())) return;
      errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`);
    });

    let ok = true;
    try {
      const resp = await tab.goto(BASE + page.url, { waitUntil: 'networkidle', timeout: 20000 });
      if (!resp || !resp.ok()) { errors.push(`HTTP ${resp ? resp.status() : 'no-response'}`); ok = false; }
      // wait briefly for any deferred JS
      await tab.waitForTimeout(900);

      for (const sel of page.required) {
        const found = await tab.$(sel);
        if (!found) { errors.push(`missing required element: ${sel}`); ok = false; }
      }

      // Look for "Loading" text that didn't get replaced — a sign of init failure
      const stuckLoading = await tab.evaluate(() => {
        const overlay = document.getElementById('overlayBody');
        return overlay ? overlay.textContent.trim() === 'Loading…' : false;
      });
      if (stuckLoading) { errors.push('overlayBody still says "Loading…" after init'); ok = false; }

    } catch (e) {
      errors.push(`navigation/eval error: ${e.message}`);
      ok = false;
    }

    if (consoleErrors.length) {
      errors.push(...consoleErrors);
      ok = false;
    }

    if (ok) {
      console.log(`✅ ${page.url}`);
    } else {
      failures++;
      console.log(`❌ ${page.url}`);
      for (const e of errors) console.log('   - ' + e);
    }
    await tab.close();
  }

  await browser.close();
  if (failures) {
    console.log(`\n${failures} page(s) failed.`);
    process.exit(1);
  } else {
    console.log('\nAll pages OK.');
  }
})();
