# 🕹️ PC Commander Arcade

A retro neon arcade inspired by the **PC Commander** Alexa skill — the one
that lets you tell your computer what to do with your voice. This site is
a playful tribute, not a control panel: there's no Pushbullet integration,
no accounts, no analytics, and no PII.

🎮 **Play it live**: <https://deeboyedx.github.io/pc-commander-arcade/>

## The games

| Game | What it is |
| ---- | ---------- |
| 🛡️ **Push Defender** | A vertical shoot-em-up. Spam push notifications pour down from the cloud — blast the bad ones, let the real commands reach your PC. Wave-based with bosses, power-ups (Lite / Plus / Courtesy / Brief), and combo scoring. |
| 🎤 **Voice Commander** | Alexa-style "Simon Says" in six languages (English, Spanish, French, German, Italian, Japanese). The browser speaks a command; you repeat it via mic *or* keyboard. Fuzzy matching gives partial credit. |
| ✨ **Echo Synth** | Speak or type a phrase. Each word becomes a star, sized by syllable count and coloured by its letters. Phrases form connected constellations that drift across a synthwave sky. Save your sky as a PNG. |
| 🏆 **Hall of Pushes** | Your local high scores and a 13-achievement system, all stored only in your browser. |

## Tech notes

- **Pure HTML / CSS / vanilla JS** — no build step, no frameworks, no
  bundlers, no trackers.
- **Web Audio API** for live-synthesised chiptune SFX and a tiny
  synthwave background loop. No MP3 samples.
- **HTML5 Canvas** for all game rendering.
- **Web Speech API** (`SpeechRecognition` + `SpeechSynthesis`) for
  Voice Commander and Echo Synth's microphone input. Falls back to
  keyboard input where speech isn't supported.
- **`localStorage`** for high scores, achievements, and settings.
- One CDN dependency: Google Fonts (Press Start 2P, VT323, Orbitron).
  Everything else is self-contained in this repo.

## Layout

```
.
├── index.html              # Arcade entrance / game selection
├── about.html              # Hall of Pushes (scores + achievements)
├── games/
│   ├── push-defender.html
│   ├── voice-commander.html
│   └── echo-synth.html
└── assets/
    ├── css/arcade.css      # Shared neon styling, CRT scanlines, etc.
    └── js/
        ├── arcade.js       # State, achievements, toasts, shared utils
        ├── sfx.js          # Chiptune SFX + background music synth
        ├── voice.js        # Web Speech API helpers, fuzzy match
        ├── push-defender.js
        ├── voice-commander.js
        └── echo-synth.js
```

## Running locally

No build, nothing to install. Any static server works:

```sh
python -m http.server 8765
# then open http://127.0.0.1:8765/
```

## Tests

Smoke / functional tests use Playwright (local, not committed):

```sh
npm install
npx playwright install chromium
node smoke-test.js       # loads each page, asserts no JS errors
node functional-test.js  # drives each game and verifies key behaviour
```

## Browser support

- **Chrome / Edge**: full experience including microphone in Voice
  Commander and Echo Synth.
- **Firefox / Safari**: everything except `SpeechRecognition` (which
  is Chromium-only). The voice games auto-detect and offer a keyboard
  fallback.
- **Mobile**: touch controls supported in Push Defender (drag to move,
  tap to fire).

## Easter eggs

There may or may not be a famous 10-key sequence that does something
fun on the home page. 👀

## Credits & disclaimer

Made in one night with neon, caffeine, and admiration for the original
PC Commander Alexa skill. This is an independent, non-commercial fan
project. No real push notifications are sent. No PII or production
data from PC Commander is used or referenced.

License: [MIT](LICENSE) — go build something fun.
