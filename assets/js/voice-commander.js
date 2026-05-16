/* ============================================================
   PC Commander Arcade — VOICE COMMANDER
   Alexa-style Simon Says: she speaks a command, you repeat it.
   Multi-language. Web Speech API. Keyboard fallback.
   ============================================================ */

(function () {
  'use strict';

  // ---------- DOM ----------
  const elPrompt    = document.getElementById('prompt');
  const elPromptTr  = document.getElementById('promptTrans');
  const elInput     = document.getElementById('typeInput');
  const elScore     = document.getElementById('vScore');
  const elRound     = document.getElementById('vRound');
  const elLives     = document.getElementById('vLives');
  const elBest      = document.getElementById('vBest');
  const elLang      = document.getElementById('langPick');
  const elBtnStart  = document.getElementById('btnStart');
  const elBtnHear   = document.getElementById('btnHear');
  const elBtnMic    = document.getElementById('btnMic');
  const elBtnSubmit = document.getElementById('btnSubmit');
  const elBtnSkip   = document.getElementById('btnSkip');
  const elFeedback  = document.getElementById('feedback');
  const elStatus    = document.getElementById('voiceStatus');
  const elTranscript= document.getElementById('transcript');

  // ---------- Languages ----------
  // Lang prefix → display name, speech-synthesis preferred locale
  const LANGS = {
    en: { name: 'English',  loc: 'en-US' },
    es: { name: 'Spanish',  loc: 'es-ES' },
    fr: { name: 'French',   loc: 'fr-FR' },
    de: { name: 'German',   loc: 'de-DE' },
    it: { name: 'Italian',  loc: 'it-IT' },
    ja: { name: 'Japanese', loc: 'ja-JP' }
  };

  // Each command has 6 translations + the canonical English meaning (for the player UI).
  // These are conversational phrases inspired by PC Commander intents.
  const COMMANDS = [
    { en: 'open notepad',          es: 'abre el bloc de notas',     fr: 'ouvre le bloc-notes',         de: 'öffne den editor',            it: 'apri il blocco note',         ja: 'メモ帳を開いて' },
    { en: 'play music',            es: 'pon música',                fr: 'mets de la musique',           de: 'spiele musik',                it: 'metti la musica',             ja: '音楽をかけて' },
    { en: 'pause music',           es: 'pausa la música',           fr: 'mets en pause la musique',     de: 'pausiere die musik',          it: 'metti in pausa la musica',    ja: '音楽を止めて' },
    { en: 'next track',            es: 'siguiente canción',         fr: 'piste suivante',               de: 'nächster titel',              it: 'prossima traccia',            ja: '次の曲' },
    { en: 'turn off the lights',   es: 'apaga las luces',           fr: 'éteins les lumières',          de: 'mach das licht aus',          it: 'spegni le luci',              ja: '電気を消して' },
    { en: 'lock my screen',        es: 'bloquea mi pantalla',       fr: 'verrouille mon écran',         de: 'sperre meinen bildschirm',    it: 'blocca lo schermo',           ja: '画面をロックして' },
    { en: 'open the browser',      es: 'abre el navegador',         fr: 'ouvre le navigateur',          de: 'öffne den browser',           it: 'apri il browser',             ja: 'ブラウザを開いて' },
    { en: 'send a message',        es: 'envía un mensaje',          fr: 'envoie un message',            de: 'sende eine nachricht',        it: 'invia un messaggio',          ja: 'メッセージを送って' },
    { en: 'set a timer',           es: 'pon un temporizador',       fr: 'mets un minuteur',             de: 'stelle einen timer',          it: 'imposta un timer',            ja: 'タイマーをセットして' },
    { en: 'find my files',         es: 'busca mis archivos',        fr: 'cherche mes fichiers',         de: 'finde meine dateien',         it: 'trova i miei file',           ja: 'ファイルを探して' },
    { en: 'print this page',       es: 'imprime esta página',       fr: 'imprime cette page',           de: 'drucke diese seite',          it: 'stampa questa pagina',        ja: 'このページを印刷して' },
    { en: 'launch the calculator', es: 'inicia la calculadora',     fr: 'lance la calculatrice',        de: 'starte den taschenrechner',   it: 'avvia la calcolatrice',       ja: '電卓を起動して' },
    { en: 'press enter',           es: 'presiona enter',            fr: 'appuie sur entrée',            de: 'drücke die eingabetaste',     it: 'premi invio',                 ja: 'エンターを押して' },
    { en: 'turn on the monitor',   es: 'enciende el monitor',       fr: 'allume le moniteur',           de: 'schalte den monitor ein',     it: 'accendi il monitor',          ja: 'モニターをつけて' },
    { en: 'good night',            es: 'buenas noches',             fr: 'bonne nuit',                   de: 'gute nacht',                  it: 'buonanotte',                  ja: 'おやすみなさい' },
    { en: 'help me',               es: 'ayúdame',                   fr: 'aide-moi',                     de: 'hilf mir',                    it: 'aiutami',                     ja: '助けて' },
    { en: 'go back',               es: 'vuelve atrás',              fr: 'reviens en arrière',           de: 'geh zurück',                  it: 'torna indietro',              ja: '戻って' },
    { en: 'play the next song',    es: 'reproduce la siguiente canción', fr: 'joue la prochaine chanson', de: 'spiele das nächste lied',  it: 'riproduci la prossima canzone', ja: '次の歌を再生して' }
  ];

  // ---------- Game state ----------
  const game = {
    state: 'menu',    // menu, listening, awaiting, scoring, gameover
    score: 0,
    round: 0,
    lives: 3,
    current: null,    // { command, lang }
    started: 0
  };

  // ---------- Recognition ----------
  let recognizer = null;
  let micActive = false;
  let micBuffer = '';

  function ensureRecognizer(lang) {
    if (!PCVoice.isRecognitionSupported()) return null;
    if (!recognizer) {
      recognizer = PCVoice.createRecognizer({ lang, interim: true, continuous: false, maxAlternatives: 4 });
      recognizer.on('result', results => {
        let interim = '';
        for (const r of results) {
          if (r.isFinal) {
            const final = r.alternatives[0].transcript;
            micBuffer = final;
            handleFinal(r.alternatives);
          } else {
            interim += r.alternatives[0].transcript;
          }
        }
        elTranscript.textContent = (micBuffer + ' ' + interim).trim();
      });
      recognizer.on('error', e => {
        micActive = false;
        elStatus.textContent = 'Mic error: ' + (e.error || e.message || 'unknown');
        elBtnMic.textContent = '🎤 Listen';
      });
      recognizer.on('end', () => {
        micActive = false;
        elBtnMic.textContent = '🎤 Listen';
        if (game.state === 'awaiting' && !micBuffer) {
          elStatus.textContent = 'Tap "Listen" to try again, or type below.';
        }
      });
    } else {
      recognizer.setLang(lang);
    }
    return recognizer;
  }

  function startMic() {
    if (!game.current) return;
    const lang = LANGS[game.current.lang].loc;
    const r = ensureRecognizer(lang);
    if (!r) {
      elStatus.textContent = 'Speech recognition is not supported in this browser. Use the text box.';
      return;
    }
    micBuffer = '';
    elTranscript.textContent = '';
    elStatus.textContent = 'Listening… speak the command.';
    elBtnMic.textContent = '🛑 Stop';
    micActive = true;
    r.start();
  }

  function stopMic() {
    if (recognizer) recognizer.stop();
    micActive = false;
    elBtnMic.textContent = '🎤 Listen';
  }

  function handleFinal(alts) {
    if (!game.current) return;
    const expected = game.current.command[game.current.lang];
    const score = PCVoice.bestMatchScore(alts, expected);
    submitGuess(alts[0].transcript, score, 'voice');
  }

  // ---------- Speak prompt ----------
  function speakCurrent() {
    if (!game.current) return;
    const phrase = game.current.command[game.current.lang];
    const loc = LANGS[game.current.lang].loc;
    elStatus.textContent = '🔊 Alexa is speaking…';
    PCVoice.speak(phrase, { lang: loc, rate: 0.95 }).then(() => {
      if (game.state === 'awaiting') {
        elStatus.textContent = 'Your turn — repeat it!';
      }
    });
  }

  // ---------- Round lifecycle ----------
  function nextRound() {
    game.round++;
    micBuffer = '';
    elTranscript.textContent = '';
    elInput.value = '';
    elFeedback.textContent = '';
    elBtnSubmit.disabled = false;
    elBtnSkip.disabled   = false;
    elBtnHear.disabled   = false;
    elBtnMic.disabled    = !PCVoice.isRecognitionSupported();
    elInput.disabled     = false;

    // Choose language. Honour "any" or specific.
    const want = elLang.value;
    const langKey = (want === 'any')
      ? choice(Object.keys(LANGS))
      : want;
    const cmd = choice(COMMANDS);
    game.current = { command: cmd, lang: langKey };
    PCCA.addLanguageUsed(langKey);

    elPrompt.textContent   = cmd[langKey];
    elPromptTr.textContent = '(English: "' + cmd.en + '")';
    elPromptTr.style.display = (langKey === 'en') ? 'none' : 'block';

    game.state = 'awaiting';
    game.started = performance.now();
    updateHud();
    speakCurrent();
    setTimeout(() => elInput.focus(), 200);
  }

  function submitGuess(transcript, score, source) {
    if (game.state !== 'awaiting') return;
    if (score == null) {
      const expected = game.current.command[game.current.lang];
      score = PCVoice.similarity(transcript || '', expected);
    }
    game.state = 'scoring';
    stopMic();

    // Time bonus: faster = more
    const elapsed = (performance.now() - game.started) / 1000;
    const timeBonus = Math.max(0, Math.round(300 * Math.exp(-elapsed / 8)));

    const pct = Math.round(score * 100);
    let grade, color, points;
    if (score >= 0.85) {
      grade = 'PERFECT'; color = 'glow-green';
      points = 500 + timeBonus;
      PCCA.bumpStat('voiceRoundsWon');
      SFX.confirm();
    } else if (score >= 0.65) {
      grade = 'GOOD'; color = 'glow-cyan';
      points = 250 + Math.floor(timeBonus * 0.5);
      PCCA.bumpStat('voiceRoundsWon');
      SFX.pickup();
    } else if (score >= 0.40) {
      grade = 'CLOSE'; color = 'glow-yellow';
      points = 80;
      SFX.blip();
    } else {
      grade = 'MISS'; color = 'glow-pink';
      points = 0;
      game.lives--;
      SFX.error();
    }
    game.score += points;

    const heard = transcript ? '“' + transcript + '”' : '(no input)';
    elFeedback.innerHTML =
      '<span class="' + color + '" style="font-family:\'Press Start 2P\',monospace;">' + grade + '</span> · ' +
      'match ' + pct + '% · +' + points + ' pts<br>' +
      '<span class="muted">Heard from you (' + source + '): ' + heard + '</span><br>' +
      '<span class="muted">Expected: ' + game.current.command[game.current.lang] + '</span>';

    PCCA.announceAchievements(PCCA.checkAchievements());

    elBtnSubmit.disabled = true;
    elBtnSkip.disabled   = true;
    elBtnHear.disabled   = true;
    elBtnMic.disabled    = true;
    elInput.disabled     = true;

    updateHud();

    if (game.lives <= 0) {
      setTimeout(gameOver, 1700);
    } else {
      setTimeout(nextRound, 1900);
    }
  }

  // ---------- Game flow ----------
  function startGame() {
    game.score = 0;
    game.round = 0;
    game.lives = 3;
    game.state = 'awaiting';
    elBtnStart.textContent = 'Restart';
    nextRound();
  }

  function gameOver() {
    game.state = 'gameover';
    stopMic();
    const isNew = PCCA.setHighScore('voiceCommander', game.score);
    elPrompt.textContent = 'GAME OVER';
    elPromptTr.textContent = '';
    elFeedback.innerHTML =
      'Final score: <span class="glow-yellow">' + PCCA.fmtNum(game.score) + '</span> · Rounds: ' + game.round + '<br>' +
      (isNew ? '<span class="glow-pink flicker">★ NEW HIGH SCORE ★</span>' : '<span class="muted">High: ' + PCCA.fmtNum(PCCA.state().highScores.voiceCommander) + '</span>');
    PCCA.announceAchievements(PCCA.checkAchievements());
    updateHud();
    elBtnStart.textContent = 'Play Again';
    elBtnSubmit.disabled = true;
    elBtnSkip.disabled   = true;
    elBtnHear.disabled   = true;
    elBtnMic.disabled    = true;
    elInput.disabled     = true;
  }

  function updateHud() {
    elScore.textContent = PCCA.fmtNum(game.score);
    elRound.textContent = game.round || '–';
    elLives.textContent = '♥'.repeat(Math.max(0, game.lives));
    elBest.textContent  = PCCA.fmtNum(PCCA.state().highScores.voiceCommander || 0);
  }

  // ---------- Utils ----------
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---------- Wire up ----------
  // Populate language picker
  for (const k of Object.keys(LANGS)) {
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = LANGS[k].name;
    elLang.appendChild(opt);
  }
  // "Any" default option already present in HTML.

  elBtnStart.addEventListener('click', startGame);
  elBtnHear.addEventListener('click', () => { if (game.current) speakCurrent(); });
  elBtnMic.addEventListener('click', () => {
    if (game.state !== 'awaiting') return;
    if (micActive) stopMic(); else startMic();
  });
  elBtnSubmit.addEventListener('click', () => {
    if (game.state !== 'awaiting') return;
    const txt = (elInput.value || '').trim();
    if (!txt) return;
    submitGuess(txt, null, 'keyboard');
  });
  elBtnSkip.addEventListener('click', () => {
    if (game.state !== 'awaiting') return;
    submitGuess('', 0, 'skip');
  });
  elInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); elBtnSubmit.click(); }
  });

  // Status init
  if (!PCVoice.isSynthSupported()) {
    elStatus.textContent = 'Speech synthesis not supported — Alexa cannot speak in this browser.';
  } else {
    PCVoice.loadVoices();
    elStatus.textContent = 'Press START to begin.';
  }
  if (!PCVoice.isRecognitionSupported()) {
    elBtnMic.disabled = true;
    elBtnMic.title = 'Speech recognition not supported. Use the text box.';
  }
  elBtnSubmit.disabled = true;
  elBtnSkip.disabled   = true;
  elBtnHear.disabled   = true;
  elInput.disabled     = true;
  elBtnMic.disabled    = true;
  updateHud();
})();
