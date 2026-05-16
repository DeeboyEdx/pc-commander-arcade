/* ============================================================
   PC Commander Arcade — shared utilities
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'pcca:v1';

  // ---------- Persistent storage ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      console.warn('PCCA: storage load failed', e);
      return defaultState();
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('PCCA: storage save failed', e);
    }
  }

  function defaultState() {
    return {
      highScores: {
        pushDefender:    0,
        voiceCommander:  0,
        echoSynth:       0
      },
      achievements: {},  // id -> ISO timestamp unlocked
      stats: {
        pushesBlocked:   0,
        pushesDelivered: 0,
        voiceRoundsWon:  0,
        constellationsCreated: 0,
        languagesUsed:   []
      },
      settings: {
        sfxOn:   true,
        musicOn: true
      }
    };
  }

  let state = loadState();

  function getState()              { return state; }
  function patchState(patch)       { Object.assign(state, patch); saveState(state); }
  function setHighScore(game, val) {
    if (!state.highScores[game] || val > state.highScores[game]) {
      state.highScores[game] = val;
      saveState(state);
      return true; // new high score
    }
    return false;
  }
  function bumpStat(key, by) {
    by = by || 1;
    state.stats[key] = (state.stats[key] || 0) + by;
    saveState(state);
  }
  function addLanguageUsed(lang) {
    if (!state.stats.languagesUsed.includes(lang)) {
      state.stats.languagesUsed.push(lang);
      saveState(state);
    }
  }

  // ---------- Achievements ----------
  const ACHIEVEMENTS = [
    { id: 'first_push',      title: 'First Push',         desc: 'You pushed your very first command.', check: s => s.stats.pushesDelivered >= 1 },
    { id: 'spam_slayer_25',  title: 'Spam Slayer',        desc: 'Blocked 25 spam pushes in Push Defender.', check: s => s.stats.pushesBlocked >= 25 },
    { id: 'spam_slayer_100', title: 'Pop-up Hunter',      desc: 'Blocked 100 spam pushes in Push Defender.', check: s => s.stats.pushesBlocked >= 100 },
    { id: 'spam_slayer_500', title: 'Inbox Zero',         desc: 'Blocked 500 spam pushes. Your PC thanks you.', check: s => s.stats.pushesBlocked >= 500 },
    { id: 'pd_score_2k',     title: 'High Voltage',       desc: 'Score 2,000 in Push Defender.', check: s => s.highScores.pushDefender >= 2000 },
    { id: 'pd_score_10k',    title: 'Arcade Legend',      desc: 'Score 10,000 in Push Defender.', check: s => s.highScores.pushDefender >= 10000 },
    { id: 'voice_round',     title: 'Anything Else?',     desc: 'Win a round of Voice Commander.', check: s => s.stats.voiceRoundsWon >= 1 },
    { id: 'voice_streak_5',  title: 'Chain Invocation',   desc: 'Win 5 Voice Commander rounds.', check: s => s.stats.voiceRoundsWon >= 5 },
    { id: 'polyglot_3',      title: 'Polyglot',           desc: 'Use 3 different languages in Voice Commander.', check: s => (s.stats.languagesUsed || []).length >= 3 },
    { id: 'polyglot_all',    title: 'World Tour',         desc: 'Use all 6 supported languages.', check: s => (s.stats.languagesUsed || []).length >= 6 },
    { id: 'echo_first',      title: 'Stargazer',          desc: 'Create your first constellation in Echo Synth.', check: s => s.stats.constellationsCreated >= 1 },
    { id: 'echo_10',         title: 'Astronomer',         desc: 'Create 10 constellations.', check: s => s.stats.constellationsCreated >= 10 },
    { id: 'konami',          title: 'Secret Knock',       desc: 'Type the legendary code on the arcade home page.', check: s => !!s.achievements.konami }
  ];

  function checkAchievements() {
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (!state.achievements[a.id] && a.check(state)) {
        state.achievements[a.id] = new Date().toISOString();
        unlocked.push(a);
      }
    }
    if (unlocked.length) saveState(state);
    return unlocked;
  }

  // ---------- Toast ----------
  function ensureToastHost() {
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(headLine, bodyLine, opts) {
    opts = opts || {};
    const ms = opts.duration || 4200;
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = 'toast';
    const head = document.createElement('div');
    head.className = 'head';
    head.textContent = '✦ ' + headLine;
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = bodyLine || '';
    el.appendChild(head); el.appendChild(body);
    host.appendChild(el);
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, ms);
  }

  function announceAchievements(unlocked) {
    for (const a of unlocked) toast('Achievement: ' + a.title, a.desc, { duration: 5000 });
  }

  // ---------- Shared nav HTML ----------
  function buildNav(activePage) {
    // Pages that live at the repo root vs. inside /games/
    const rootPages = { home: true, about: true };
    const isAtRoot = !!rootPages[activePage];
    const root = isAtRoot ? '' : '../';
    return (
      '<div class="nav">' +
      '  <a class="brand" href="' + root + 'index.html">PC&nbsp;Commander&nbsp;Arcade</a>' +
      '  <div class="links">' +
      '    <a href="' + root + 'index.html">Home</a>' +
      '    <a href="' + root + 'games/push-defender.html">Push Defender</a>' +
      '    <a href="' + root + 'games/voice-commander.html">Voice Commander</a>' +
      '    <a href="' + root + 'games/echo-synth.html">Echo Synth</a>' +
      '    <a href="' + root + 'about.html">About</a>' +
      '  </div>' +
      '</div>'
    );
  }

  function injectNav(activePage) {
    const target = document.getElementById('navHost');
    if (target) target.innerHTML = buildNav(activePage);
  }

  // ---------- Number formatting ----------
  function fmtNum(n) {
    return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ---------- Public API ----------
  window.PCCA = {
    state: getState,
    patch: patchState,
    setHighScore,
    bumpStat,
    addLanguageUsed,
    checkAchievements,
    announceAchievements,
    toast,
    injectNav,
    fmtNum,
    ACHIEVEMENTS
  };
})();
