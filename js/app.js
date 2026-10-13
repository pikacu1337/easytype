(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------- Настройки ----------
  const STORE_SETTINGS = 'easytype:settings';
  const STORE_BEST = 'easytype:best';

  const defaults = {
    theme: 'graphite',
    sound: 'mech',
    volume: 0.5,
    errorSound: true,
    mode: 'time',
    time: 30,
    count: 25,
    lang: 'ru',
    punctuation: false,
    numbers: false,
    keyboard: true,
    font: 'jetbrains',
    size: 1,
  };
  // Изменение этих настроек меняет сам тест, поэтому он перезапускается
  const RESET_KEYS = new Set(['mode', 'time', 'count', 'lang', 'punctuation', 'numbers']);

  const MONO_FALLBACK = '"Cascadia Mono", Consolas, "Courier New", monospace';
  const FONTS = {
    jetbrains: `"JetBrains Mono", ${MONO_FALLBACK}`,
    fira: `"Fira Code", ${MONO_FALLBACK}`,
    roboto: `"Roboto Mono", ${MONO_FALLBACK}`,
    plex: `"IBM Plex Mono", ${MONO_FALLBACK}`,
    source: `"Source Code Pro", ${MONO_FALLBACK}`,
    ubuntu: `"Ubuntu Mono", ${MONO_FALLBACK}`,
    ptmono: `"PT Mono", ${MONO_FALLBACK}`,
    system: MONO_FALLBACK,
    inter: 'Inter, "Segoe UI", Arial, sans-serif',
    ptserif: '"PT Serif", Georgia, "Times New Roman", serif',
  };
  const SIZE_MIN = 0.7, SIZE_MAX = 1.8, SIZE_STEP = 0.1;

  function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
  }

  const settings = { ...defaults };
  const stored = loadJSON(STORE_SETTINGS);
  for (const k in defaults) {
    if (typeof stored[k] === typeof defaults[k]) settings[k] = stored[k];
  }
  if (!FONTS[settings.font]) settings.font = defaults.font;
  if (!Sound.has(settings.sound)) settings.sound = defaults.sound;
  settings.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, settings.size));

  // ---------- Элементы ----------
  const wordsEl = $('#words');
  const caretEl = $('#caret');
  const counterEl = $('#counter');
  const liveWpmEl = $('#liveWpm');
  const hintEl = $('#hint');
  const testEl = $('#test');
  const resultEl = $('#result');
  const keyboardEl = $('#keyboard');
  const volumeEl = $('#volume');

  // ---------- Состояние теста ----------
  let words = [], typed = [], wordEls = [];
  let wordIdx = 0;
  let nextWord = null;
  let started = false, finished = false;
  let startTime = 0, timerId = null, lastSec = 0;
  let keysOk = 0, keysBad = 0, secErrors = 0;
  let history = [];

  // ---------- Генерация текста ----------
  function makeGenerator() {
    const list = WORDS[settings.lang];
    const cap = w => w[0].toUpperCase() + w.slice(1);
    let last = '';
    let capNext = settings.punctuation;
    return () => {
      let w;
      if (settings.numbers && Math.random() < 0.12) {
        const digits = 1 + (Math.random() * 4 | 0);
        w = String(Math.floor(Math.random() * 10 ** digits));
      } else {
        do { w = list[Math.random() * list.length | 0]; } while (w === last);
        last = w;
      }
      if (settings.punctuation) {
        if (capNext) { w = cap(w); capNext = false; }
        const r = Math.random();
        if (r < 0.08) { w += '.'; capNext = true; }
        else if (r < 0.10) { w += '?'; capNext = true; }
        else if (r < 0.12) { w += '!'; capNext = true; }
        else if (r < 0.22) w += ',';
        else if (r < 0.235) w += ';';
        else if (r < 0.25) w += ':';
        else if (r < 0.27) w = `"${w}"`;
      }
      return w;
    };
  }

  function addWords(n, closeSentence = false) {
    const batch = Array.from({ length: n }, nextWord);
    if (closeSentence && settings.punctuation) {
      batch[n - 1] = batch[n - 1].replace(/[.?!,;:]$/, '') + '.';
    }
    const frag = document.createDocumentFragment();
    for (const w of batch) {
      const el = document.createElement('div');
      el.className = 'word';
      for (const ch of w) {
        const s = document.createElement('span');
        s.textContent = ch;
        el.appendChild(s);
      }
      frag.appendChild(el);
      words.push(w);
      wordEls.push(el);
    }
    wordsEl.appendChild(frag);
  }

  // ---------- Отрисовка ----------
  function renderWord(i) {
    const el = wordEls[i], w = words[i], t = typed[i] || '';
    while (el.children.length > w.length) el.lastChild.remove();
    for (let j = 0; j < w.length; j++) {
      el.children[j].className = j < t.length ? (t[j] === w[j] ? 'correct' : 'incorrect') : '';
    }
    for (let j = w.length; j < t.length; j++) {
      const s = document.createElement('span');
      s.className = 'extra';
      s.textContent = t[j];
      el.appendChild(s);
    }
    el.classList.toggle('error', i < wordIdx && t !== w);
  }

  function placeCaret(instant = false) {
    const el = wordEls[wordIdx];
    if (!el) return;
    const t = typed[wordIdx] || '';
    const lineH = el.getBoundingClientRect().height;

    // Текущее слово всегда держим на второй строке из трёх
    const shift = Math.max(0, el.offsetTop - lineH);
    wordsEl.style.transform = `translateY(${-shift}px)`;

    const letter = el.children[Math.max(0, t.length - 1)];
    const x = letter.offsetLeft + (t.length ? letter.offsetWidth : 0);
    const y = el.offsetTop + (lineH - caretEl.offsetHeight) / 2;
    caretEl.classList.toggle('jump', instant);
    caretEl.style.transform = `translate(${x}px, ${y}px)`;
  }

  function updateCounter(elapsed = 0) {
    counterEl.textContent = settings.mode === 'time'
      ? Math.max(0, Math.ceil(settings.time - elapsed))
      : `${Math.min(wordIdx, words.length)}/${words.length}`;
  }

  // ---------- Подсчёт ----------
  function computeStats(elapsed) {
    let correct = 0, incorrect = 0, extra = 0, missed = 0;
    let wpmChars = 0, rawChars = 0;
    const lastIdx = Math.min(wordIdx, words.length - 1);

    for (let i = 0; i <= lastIdx; i++) {
      const w = words[i], t = typed[i] || '';
      const completed = i < wordIdx;
      for (let j = 0; j < Math.max(w.length, t.length); j++) {
        if (j >= w.length) extra++;
        else if (j >= t.length) { if (completed) missed++; }
        else if (t[j] === w[j]) correct++;
        else incorrect++;
      }
      // Пробел после слова считается символом, кроме самого последнего слова
      const space = completed && i < words.length - 1 ? 1 : 0;
      rawChars += t.length + space;
      // В WPM идут только символы безошибочно набранных слов
      if (completed ? t === w : w.startsWith(t)) wpmChars += t.length + space;
    }

    const minutes = Math.max(elapsed, 0.001) / 60;
    return {
      wpm: wpmChars / 5 / minutes,
      raw: rawChars / 5 / minutes,
      correct, incorrect, extra, missed,
    };
  }

  // ---------- Ход теста ----------
  function reset() {
    clearInterval(timerId);
    started = finished = false;
    words = []; typed = ['']; wordEls = [];
    wordIdx = 0; lastSec = 0;
    keysOk = keysBad = secErrors = 0;
    history = [];

    wordsEl.textContent = '';
    wordsEl.appendChild(caretEl);
    wordsEl.style.transform = '';
    nextWord = makeGenerator();
    if (settings.mode === 'words') addWords(settings.count, true);
    else addWords(80);

    document.body.classList.remove('typing', 'focus', 'done');
    resultEl.hidden = true;
    testEl.hidden = false;
    liveWpmEl.textContent = '';
    hintEl.textContent = '';
    updateCounter();
    placeCaret(true);
  }

  function start() {
    started = true;
    startTime = performance.now();
    document.body.classList.add('typing');
    timerId = setInterval(tick, 100);
  }

  function tick() {
    const elapsed = (performance.now() - startTime) / 1000;
    const sec = Math.floor(elapsed);
    if (sec > lastSec) {
      lastSec = sec;
      const s = computeStats(sec);
      history.push({ t: sec, wpm: s.wpm, raw: s.raw, err: secErrors });
      secErrors = 0;
      liveWpmEl.textContent = `${Math.round(s.wpm)} WPM`;
    }
    updateCounter(elapsed);
    if (settings.mode === 'time' && elapsed >= settings.time) finish(settings.time);
  }

  function typeChar(ch) {
    if (!started) start();
    const w = words[wordIdx], t = typed[wordIdx];
    if (t.length >= w.length + 10) return null;

    const ok = t.length < w.length && ch === w[t.length];
    typed[wordIdx] = t + ch;
    if (ok) keysOk++; else { keysBad++; secErrors++; }
    renderWord(wordIdx);
    placeCaret();

    // В режиме «слова» тест заканчивается на последней верной букве
    if (settings.mode === 'words' && wordIdx === words.length - 1 && typed[wordIdx] === w) finish();
    return ok ? 'ok' : 'bad';
  }

  function typeSpace() {
    if (!started || !typed[wordIdx].length) return null;
    const ok = typed[wordIdx] === words[wordIdx];
    if (ok) keysOk++; else { keysBad++; secErrors++; }

    wordIdx++;
    typed[wordIdx] = '';
    renderWord(wordIdx - 1);

    if (wordIdx >= words.length) {
      finish();
    } else {
      if (settings.mode === 'words') updateCounter();
      else if (words.length - wordIdx < 40) addWords(40);
      placeCaret();
    }
    return ok ? 'ok' : 'bad';
  }

  // Возвращает true, если что-то действительно стёрлось
  function backspace(wholeWord) {
    if (!started) return false;
    const t = typed[wordIdx];
    if (t.length) {
      typed[wordIdx] = wholeWord ? '' : t.slice(0, -1);
    } else if (wordIdx > 0 && typed[wordIdx - 1] !== words[wordIdx - 1]) {
      // Вернуться можно только в слово с ошибкой
      wordIdx--;
      if (wholeWord) typed[wordIdx] = '';
      updateCounter();
    } else {
      return false;
    }
    renderWord(wordIdx);
    placeCaret();
    return true;
  }

  function finish(exactElapsed) {
    clearInterval(timerId);
    finished = true;
    const elapsed = exactElapsed ?? (performance.now() - startTime) / 1000;
    const stats = computeStats(elapsed);
    if (elapsed - lastSec > 0.4) {
      history.push({ t: elapsed, wpm: stats.wpm, raw: stats.raw, err: secErrors });
    }
    showResult(stats, elapsed);
  }

  // ---------- Результаты ----------
  function showResult(stats, elapsed) {
    const wpm = Math.round(stats.wpm);
    const keys = keysOk + keysBad;
    const acc = keys ? keysOk / keys * 100 : 0;

    $('#rWpm').textContent = wpm;
    $('#rAcc').textContent = `${Math.floor(acc)}%`;
    $('#rAcc').title = `${acc.toFixed(2)}%`;
    $('#rRaw').textContent = Math.round(stats.raw);
    $('#rChars').textContent = `${stats.correct}/${stats.incorrect}/${stats.extra}/${stats.missed}`;
    $('#rTime').textContent = `${Math.round(elapsed)} с`;

    const amount = settings.mode === 'time' ? `Время ${settings.time} с` : `Слова ${settings.count}`;
    const parts = [amount, settings.lang === 'ru' ? 'Русский' : 'English'];
    if (settings.punctuation) parts.push('Знаки');
    if (settings.numbers) parts.push('Цифры');
    $('#rMode').textContent = parts.join(' · ');

    // Рекорд хранится отдельно для каждой комбинации настроек
    const best = loadJSON(STORE_BEST);
    const key = [settings.mode, settings.mode === 'time' ? settings.time : settings.count,
      settings.lang, +settings.punctuation, +settings.numbers].join(':');
    const prev = best[key] || 0;
    const isRecord = wpm > prev;
    if (isRecord) { best[key] = wpm; saveJSON(STORE_BEST, best); }
    const bestEl = $('#rBest');
    bestEl.textContent = isRecord ? `${wpm} — новый!` : prev;
    bestEl.classList.toggle('new', isRecord);

    document.body.classList.remove('typing', 'focus');
    document.body.classList.add('done');
    testEl.hidden = true;
    resultEl.hidden = false;
    renderChart();
  }

  function renderChart() {
    const box = $('#chart');
    const data = history;
    box.textContent = '';
    $('#chartBlock').hidden = data.length < 2;
    if (data.length < 2) return;

    const W = Math.max(320, box.clientWidth), H = 190;
    const m = { l: 34, r: 40, t: 12, b: 24 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const tMin = data[0].t, tMax = data[data.length - 1].t;

    const peak = Math.max(10, ...data.map(d => Math.max(d.wpm, d.raw)));
    const yStep = [5, 10, 20, 25, 50, 100].find(s => peak / s <= 4) || 200;
    const yMax = Math.ceil(peak / yStep) * yStep;
    const xStep = [1, 2, 5, 10, 15, 20, 30].find(s => (tMax - tMin) / s <= 8) || 60;

    const x = t => m.l + (t - tMin) / (tMax - tMin) * pw;
    const y = v => m.t + ph - v / yMax * ph;
    const path = key => data.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');

    let grid = '';
    for (let v = 0; v <= yMax; v += yStep) {
      grid += `<line class="grid" x1="${m.l}" x2="${m.l + pw}" y1="${y(v)}" y2="${y(v)}"/>` +
        `<text x="${m.l - 8}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
    }
    for (let t = Math.ceil(tMin / xStep) * xStep; t <= tMax; t += xStep) {
      grid += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle">${t}</text>`;
    }

    const errs = data.filter(d => d.err > 0)
      .map(d => `<circle class="err" cx="${x(d.t)}" cy="${m.t + ph - 7}" r="4"/>`).join('');

    // Подписи у концов линий; если линии сошлись — разводим, чтобы не слиплись
    const end = data[data.length - 1];
    const yWpm = y(end.wpm);
    let yRaw = y(end.raw);
    if (Math.abs(yRaw - yWpm) < 12) yRaw = yWpm + (end.raw >= end.wpm ? -12 : 12);
    const labels =
      `<text class="end-label" x="${m.l + pw + 8}" y="${yWpm + 3}">WPM</text>` +
      `<text x="${m.l + pw + 8}" y="${yRaw + 3}">Raw</text>`;

    box.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Скорость печати по секундам">` +
      grid +
      `<path class="line line-raw" d="${path('raw')}"/>` +
      `<path class="line line-wpm" d="${path('wpm')}"/>` +
      errs + labels +
      `<g class="hover" visibility="hidden">` +
      `<line class="cross" y1="${m.t}" y2="${m.t + ph}"/>` +
      `<circle class="dot dot-raw" r="4"/><circle class="dot dot-wpm" r="4"/></g>` +
      `</svg><div class="tooltip" hidden></div>`;

    const svg = $('svg', box), hover = $('.hover', box), tip = $('.tooltip', box);
    const [cross, dotRaw, dotWpm] = hover.children;

    svg.addEventListener('pointermove', e => {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      const px = (e.clientX - rect.left) / scale;
      let d = data[0];
      for (const p of data) if (Math.abs(x(p.t) - px) < Math.abs(x(d.t) - px)) d = p;

      const cx = x(d.t);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
      dotRaw.setAttribute('cx', cx); dotRaw.setAttribute('cy', y(d.raw));
      dotWpm.setAttribute('cx', cx); dotWpm.setAttribute('cy', y(d.wpm));
      hover.setAttribute('visibility', 'visible');

      tip.innerHTML = `<b>${Math.round(d.t)} с</b><br>WPM ${Math.round(d.wpm)}<br>Raw ${Math.round(d.raw)}` +
        (d.err ? `<br>Ошибок ${d.err}` : '');
      tip.hidden = false;
      const flip = cx * scale + tip.offsetWidth + 16 > rect.width;
      tip.style.transform = `translate(${cx * scale + (flip ? -tip.offsetWidth - 12 : 12)}px, ${m.t * scale}px)`;
    });
    svg.addEventListener('pointerleave', () => {
      hover.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    });
  }

  // ---------- Экранная клавиатура ----------
  const KEY_ROWS = [
    { codes: ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'],
      after: [['Backspace', '⌫', 2]] },
    { codes: ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'],
      before: [['Tab', 'Tab', 1.5]], after: [['Backslash', '\\', 1.5]] },
    { codes: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'],
      before: [['CapsLock', 'Caps', 1.75]], after: [['Enter', 'Enter', 2.25]] },
    { codes: ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
      before: [['ShiftLeft', 'Shift', 2.25]], after: [['ShiftRight', 'Shift', 2.75]] },
    { codes: [], before: [['Space', '', 6.5]] },
  ];
  const KEY_LABELS = {
    en: ['`1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'],
    ru: ['ё1234567890-=', 'йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю.'],
  };
  let keyEls = {};

  function buildKeyboard() {
    keyEls = {};
    keyboardEl.textContent = '';
    const labels = KEY_LABELS[settings.lang];

    const makeKey = (code, label, width) => {
      const key = document.createElement('div');
      key.className = 'key';
      if (width) key.style.setProperty('--w', width);
      if (code === 'KeyF' || code === 'KeyJ') key.classList.add('home');
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = label;
      key.appendChild(cap);
      keyEls[code] = key;
      return key;
    };

    KEY_ROWS.forEach((row, r) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'krow';
      for (const k of row.before || []) rowEl.appendChild(makeKey(...k));
      row.codes.forEach((code, i) => rowEl.appendChild(makeKey(code, labels[r][i])));
      for (const k of row.after || []) rowEl.appendChild(makeKey(...k));
      keyboardEl.appendChild(rowEl);
    });
  }

  function pressKey(code, verdict) {
    const el = keyEls[code];
    if (!el) return;
    // Сброс класса и принудительный reflow перезапускают анимацию кольца
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('pressed', 'hit');
    el.classList.toggle('bad', verdict === 'bad');
  }

  function releaseKey(code) {
    keyEls[code]?.classList.remove('pressed');
  }

  // ---------- Ввод ----------
  function updateHint(e) {
    const ch = e.key.length === 1 ? e.key : '';
    if (settings.lang === 'ru' && /[a-z]/i.test(ch)) hintEl.textContent = 'Переключите раскладку на русскую';
    else if (settings.lang === 'en' && /[а-яё]/i.test(ch)) hintEl.textContent = 'Переключите раскладку на английскую';
    else if (e.getModifierState?.('CapsLock')) hintEl.textContent = 'Включён Caps Lock';
    else hintEl.textContent = '';
  }

  document.addEventListener('keydown', e => {
    // Выпадающий список листается своими клавишами, а буквы уходят в тест
    if (e.target instanceof HTMLSelectElement) {
      if (e.key.length !== 1 || e.key === ' ') return;
      e.target.blur();
    }

    if (e.key === 'Tab' || e.key === 'Escape') {
      e.preventDefault();
      pressKey(e.code);
      reset();
      return;
    }
    if (finished) {
      if (e.key === 'Enter') { e.preventDefault(); reset(); }
      return;
    }
    const wordDelete = e.key === 'Backspace' && e.ctrlKey;
    if ((e.ctrlKey || e.metaKey || e.altKey) && !wordDelete) return;

    let verdict = null;
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (backspace(e.ctrlKey)) Sound.play('back');
    } else if (e.key.length === 1) {
      e.preventDefault();
      // Удержание клавиши не считается набором
      if (!e.repeat) {
        verdict = e.key === ' ' ? typeSpace() : typeChar(e.key);
        // Звук только у нажатий, которые что-то изменили: лишний пробел молчит
        if (verdict === 'bad' && settings.errorSound) Sound.play('error');
        else if (verdict) Sound.play(e.key === ' ' ? 'space' : 'key');
        if (!finished) {
          document.body.classList.add('focus');
          updateHint(e);
        }
      }
    }
    pressKey(e.code, verdict);
  });

  document.addEventListener('keyup', e => releaseKey(e.code));
  window.addEventListener('blur', () => Object.keys(keyEls).forEach(releaseKey));

  // Движение мыши возвращает панели настроек
  document.addEventListener('mousemove', e => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) document.body.classList.remove('focus');
  });

  // ---------- Панели настроек ----------
  function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.style.setProperty('--font', FONTS[settings.font]);
    root.style.setProperty('--scale', settings.size);
    Sound.set(settings.sound, settings.volume);
    for (const s of $$('select[data-select]')) s.value = settings[s.dataset.select];
    $('#sizeLabel').textContent = `${Math.round(settings.size * 100)}%`;
    for (const b of $$('[data-set]')) {
      b.classList.toggle('active', String(settings[b.dataset.set]) === b.dataset.value);
    }
    for (const b of $$('[data-toggle]')) {
      b.classList.toggle('active', settings[b.dataset.toggle]);
    }
    $('#timeOpts').hidden = settings.mode !== 'time';
    $('#countOpts').hidden = settings.mode !== 'words';
    keyboardEl.hidden = !settings.keyboard;
    volumeEl.value = Math.round(settings.volume * 100);
    saveJSON(STORE_SETTINGS, settings);
  }

  function onChange(key) {
    applySettings();
    if (key === 'lang') buildKeyboard();
    if (RESET_KEYS.has(key)) reset();
    // Шрифт и размер меняют ширину букв — каретку нужно переставить
    if ((key === 'font' || key === 'size') && !finished) placeCaret(true);
    if (key === 'sound') Sound.play('key');
    if (key === 'errorSound' && settings.errorSound) Sound.play('error');
  }

  document.addEventListener('change', e => {
    const sel = e.target.closest('select[data-select]');
    if (!sel) return;
    settings[sel.dataset.select] = sel.value;
    sel.blur();
    onChange(sel.dataset.select);
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-set], [data-toggle], [data-step], #again');
    if (!btn) return;
    // Иначе пробел при наборе «нажимал» бы последнюю кнопку
    btn.blur();
    if (btn.id === 'again') return reset();

    if (btn.dataset.step) {
      const next = Math.round((settings.size + btn.dataset.step * SIZE_STEP) * 10) / 10;
      settings.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, next));
      onChange('size');
    } else if (btn.dataset.set) {
      const key = btn.dataset.set;
      const value = typeof defaults[key] === 'number' ? Number(btn.dataset.value) : btn.dataset.value;
      if (settings[key] === value) return;
      settings[key] = value;
      onChange(key);
    } else {
      const key = btn.dataset.toggle;
      settings[key] = !settings[key];
      onChange(key);
    }
  });

  volumeEl.addEventListener('input', () => {
    settings.volume = volumeEl.value / 100;
    Sound.set(settings.sound, settings.volume);
  });
  volumeEl.addEventListener('change', () => {
    saveJSON(STORE_SETTINGS, settings);
    Sound.play('key');
    volumeEl.blur();
  });

  window.addEventListener('resize', () => {
    if (finished) renderChart();
    else placeCaret(true);
  });

  // ---------- Запуск ----------
  applySettings();
  buildKeyboard();
  reset();
  // Когда догрузится шрифт, ширина букв изменится — каретку нужно переставить
  document.fonts?.addEventListener('loadingdone', () => { if (!finished) placeCaret(true); });
  document.fonts?.ready.then(() => { if (!finished) placeCaret(true); });
})();
