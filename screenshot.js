// Take screenshots of every page for visual review.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = 'http://127.0.0.1:8765';
const OUT = path.join(__dirname, '_screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const PAGES = [
  { url: '/index.html',                  name: '01-home' },
  { url: '/games/push-defender.html',    name: '02-push-defender-menu' },
  { url: '/games/push-defender.html',    name: '03-push-defender-playing',
    after: async (p) => { await p.click('#btnStart'); await p.waitForTimeout(4800); } },
  { url: '/games/voice-commander.html',  name: '04-voice-commander' },
  { url: '/games/echo-synth.html',       name: '05-echo-synth',
    after: async (p) => { await p.fill('#phrase', 'open my computer please'); await p.click('#btnAdd'); await p.waitForTimeout(700); } },
  { url: '/about.html',                  name: '06-about' }
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  for (const p of PAGES) {
    const tab = await ctx.newPage();
    await tab.goto(BASE + p.url, { waitUntil: 'networkidle' });
    if (p.after) await p.after(tab);
    await tab.waitForTimeout(400);
    const file = path.join(OUT, p.name + '.png');
    await tab.screenshot({ path: file, fullPage: true });
    console.log('saved ' + file);
    await tab.close();
  }
  await browser.close();
})();
