(function () {
  'use strict';

  const E = window.CubeEngine;
  const campaigns = window.CubeCampaigns;
  const app = document.querySelector('#app');
  const dialog = document.querySelector('#dialog');
  const deviceScreen = dialog.parentElement;
  const announce = document.querySelector('#announce');
  const params = new URLSearchParams(location.search);
  const preview = params.get('preview') === '1';
  const storedLanguage = (() => {
    try { return localStorage.getItem('slovokub-language'); } catch { return null; }
  })();
  let language = (params.get('lang') || storedLanguage) === 'en' ? 'en' : 'ru';
  let levels = campaigns[language];
  const L = (ru,en) => language === 'ru' ? ru : en;
  function storageKey() {
    const base = preview ? 'slovokub-preview-v1' : 'slovokub-v1';
    return language === 'ru' ? base : base + '-en';
  }
  const chapters = [
    { name: ['Первый свет','First Light'], detail: ['Один этаж','One floor'], color: 'violet', mark: '✦' },
    { name: ['Второй этаж','Second Floor'], detail: ['Два этажа','Two floors'], color: 'mint', mark: '⬢' },
    { name: ['Внутри куба','Inside the Cube'], detail: ['Три этажа','Three floors'], color: 'peach', mark: '✳' },
    { name: ['Кристальный зал','Crystal Hall'], detail: ['Куб 4×4×4','4×4×4 cube'], color: 'blue', mark: '◆' },
    { name: ['Созвездие слов','Word Constellation'], detail: ['От 5×5×4 до 5×5×5','5×5×4 to 5×5×5'], color: 'pink', mark: '✷' },
  ];
  const palettes = [
    { name: ['Лунный','Moonlight'], color: 'violet', stars: 0 },
    { name: ['Мята','Mint'], color: 'mint', stars: 12 },
    { name: ['Персик','Peach'], color: 'peach', stars: 28 },
    { name: ['Иней','Frost'], color: 'blue', stars: 47 },
    { name: ['Рассвет','Sunrise'], color: 'pink', stars: 67 },
    { name: ['Золото','Gold'], color: 'gold', stars: 100 },
  ];
  const localized = pair => L(...pair);
  const glyph = { play: '▶', levels: '▦', sound: '♫', back: '‹', more: '⋯', close: '×', hint: '✦', undo: '↶', retry: '↻', help: '?', palettes: '◈', star: '★', up: '↑', down: '↓' };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let persist = true;
  let profile = read();
  let screen = params.get('map') === '1' ? 'map' : 'home';
  let game = null;
  let selected = null;
  let combo = 0;
  let bonusMode = false;
  let hintMove = null;
  let message = '';
  let busy = false;
  let pendingLevel = null;
  let audio = null;

  function read() {
    const initial = { scores: {}, active: null, last:null, sound: true, palette: 'violet', sparks: 0, collected: {}, bonus: null };
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()));
      if (!raw || typeof raw !== 'object') return initial;
      const scores = {};
      for (const level of levels) {
        const item = raw.scores?.[level.id];
        if (item && Number.isInteger(item.stars) && item.stars >= 1 && item.stars <= 3 && Number.isInteger(item.moves) && item.moves >= 1) scores[level.id] = item;
      }
      let active = raw.active && Number.isInteger(raw.active.id) && levels[raw.active.id-1] && Array.isArray(raw.active.moves) ? raw.active : null;
      if (active && active.layout !== levels[active.id-1].revision) {
        active = { id:active.id, layout:levels[active.id-1].revision, moves:[], bonus:active.bonus };
      }
      return { ...initial, scores, active, last:Number.isInteger(raw.last) && levels[raw.last-1] ? raw.last : null, sound: raw.sound !== false,
        palette: palettes.some(p => p.color === raw.palette) ? raw.palette : 'violet',
        sparks: Number.isInteger(raw.sparks) && raw.sparks >= 0 ? raw.sparks : 0,
        collected: raw.collected && typeof raw.collected === 'object' ? raw.collected : {},
        bonus: validBonus(raw.bonus) ? raw.bonus : null };

    } catch {
      return initial;
    }
  }

  function save() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(profile));
    } catch {
      persist = false;
    }
  }

  function validBonus(value) { return value === 'swap' || value === 'break'; }
  function tell(text) { announce.textContent = text; }
  function stars() { return Object.values(profile.scores).reduce((sum, score) => sum + score.stars, 0); }
  function cleared() { return Object.keys(profile.scores).length; }
  function frontier() { return levels.find(l => !profile.scores[l.id])?.id ?? 50; }
  function chapterIndex(id) { return Math.floor((id - 1) / 10); }
  function continueId() {
    if (profile.active) return profile.active.id;
    const next = profile.last && levels[profile.last];
    return next && !profile.scores[next.id] ? next.id : frontier();
  }
  function icon(name) { return '<span aria-hidden="true" class="icon icon-' + name + '">' + glyph[name] + '</span>'; }
  function medal(count) {
    return '<span class="medal" aria-label="' + count + L(' из 3 звёзд',' of 3 stars') + '">' +
      [1,2,3].map(i => '<span aria-hidden="true" class="' + (i <= count ? 'earned' : '') + '">★</span>').join('') + '</span>';
  }
  function iconButton(action, label, symbol, extra = '') {
    return '<button type="button" class="icon-button ' + extra + '" data-action="' + action + '" aria-label="' + label + '" title="' + label + '">' + icon(symbol) + '</button>';
  }
  function metric() {
    return '<button type="button" class="star-bank" data-action="palettes" aria-label="' + L('Палитры. Звёзд: ','Palettes. Stars: ') + stars() + '">' + icon('star') + '<b>' + stars() + '</b></button>';
  }
  function header(label, detail, back = 'home', action = '') {
    return '<header class="topbar subbar">' + iconButton(back, back === 'home' ? L('Главное меню','Main menu') : L('Назад','Back'), 'back') +
      '<div class="top-title"><strong>' + label + '</strong>' + (detail ? '<small>' + detail + '</small>' : '') + '</div>' +
      (action || '<span class="top-spacer"></span>') + '</header>';
  }

  function render() {
    document.documentElement.lang = language;
    document.title = L('Словокуб','Word Cube');
    app.setAttribute('aria-label',document.title);
    for (const btn of document.querySelectorAll('[data-language]')) btn.setAttribute('aria-pressed',String(btn.dataset.language === language));
    app.dataset.screen = screen;
    app.dataset.palette = profile.palette;
    if (screen === 'home') renderHome();
    if (screen === 'map') renderMap();
    if (screen === 'palettes') renderPalettes();
    if (screen === 'game') renderGame();
  }

  function go(next) {
    if (dialog.open) dialog.close();
    screen = next;
    render();
    app.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function renderHome() {
    const logoTiles = [...L('СЛОВО.КУБ','WORD.CUBE')];
    const active = profile.active?.id;
    const resumable = active || cleared();
    app.innerHTML =
      '<div class="home-landscape" aria-hidden="true"></div><header class="topbar home-top"><div class="brand-mark">' +
      '<span class="brand-symbol" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>' + L('Головоломка<br>из слов','Word<br>puzzle') + '</span></div>' +
      '<div class="top-actions">' + metric() + iconButton('settings', L('Настройки','Settings'), 'more') + '</div></header>' +
      '<section class="home-hero"><div class="hero-title"><h1>' + document.title + '</h1><p>' + L('Сдвигай кубики. Собирай слова.','Slide cubes. Make words.') + '</p></div>' +
      '<div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>' +
      '<i class="glint g1">✦</i><i class="glint g2">✧</i><i class="glint g3">✦</i><i class="glint g4">·</i>' +
      '<div class="hero-grid">' + logoTiles.map((letter,i) => '<span class="hero-tile hero-' + i + (letter === '.' ? ' hero-hole' : '') + '">' + (letter === '.' ? '✧' : letter) + '</span>').join('') + '</div>' +
      '</div></section>' +
      '<section class="home-play" aria-label="' + L('Играть','Play') + '">' +
      '<button class="button primary start" data-action="start">' + icon('play') + '<b>' + L('Начать','Start') + '</b></button>' +
      '<div class="secondary-menu"><button class="button secondary" data-action="continue" ' + (resumable ? '' : 'disabled') + '>' + icon('retry') + '<span>' + L('Продолжить','Continue') + (resumable ? '<small>' + L('Уровень ','Level ') + continueId() + '</small>' : '') + '</span></button>' +
      '<button class="button secondary" data-action="map">' + icon('levels') + '<span>' + L('Выбрать уровень','Choose level') + '</span></button></div></section>' +
      (preview ? '<p class="preview-label">' + L('Демо. Все уровни открыты.','Demo. All levels unlocked.') + '</p>' : '');
  }

  function renderMap() {
    const current = chapterIndex(continueId());
    const navigation = '<nav class="chapter-tabs" aria-label="' + L('Перейти к главе','Jump to chapter') + '">' + chapters.map((chapter,i) => {
      const range = (i*10+1) + '–' + ((i+1)*10);
      return '<button type="button" data-action="chapter" data-index="' + i + '" class="tone-' + chapter.color +
        (i === current ? ' playing-chapter' : '') + '" aria-label="' + L('Глава ','Chapter ') + (i+1) + '. ' + localized(chapter.name) + L(', уровни ',', levels ') + range + '">' +
        '<b>' + (i+1) + '</b><small>' + range + '</small></button>';
    }).join('') + '</nav>';
    const sections = chapters.map((chapter,i) => renderChapter(chapter,i)).join('');
    const mode = preview ?
      '<aside class="map-mode"><a href="?map=1' + L('','&amp;lang=en') + '">' + L('К кампании','Back to campaign') + '</a></aside>' : '';
    app.innerHTML = header(L('Выбрать уровень','Choose level'), cleared() + L(' из 50 пройдено',' of 50 complete'), 'home', metric()) +
      '<div class="map-content" aria-label="' + L('Все 50 уровней','All 50 levels') + '">' + navigation + mode + sections + '</div>';
  }

  function renderChapter(chapter, index) {
    const entries = levels.slice(index*10, (index+1)*10);
    const count = entries.filter(level => profile.scores[level.id]).length;
    const heading = 'chapter-' + index;
    const first = entries[0].id;
    const last = entries.at(-1).id;
    const cards = entries.map(level => {
      const score = profile.scores[level.id];
      const active = profile.active?.id === level.id;
      return '<button class="level-card' + (level.id === continueId() || active ? ' current' : '') + '" data-action="level" data-index="' + level.id + '"' +
        ' aria-label="' + L('Уровень ','Level ') + level.id + (score ? L(', звёзд ',', stars ') + score.stars : '') + '">' +
        '<strong>' + level.id + '</strong>' + medal(score?.stars ?? 0) + '</button>';
    }).join('');
    return '<section class="map-chapter" aria-labelledby="' + heading + '"><div class="chapter-banner tone-' + chapter.color + '">' +
      '<div><p>' + L('Уровни ','Levels ') + first + '–' + last + '</p><h2 id="' + heading + '" tabindex="-1">' + localized(chapter.name) + '</h2><span>' + localized(chapter.detail) + '</span></div>' +
      '<span class="chapter-mark" aria-hidden="true">' + chapter.mark + '</span></div>' +
      '<div class="map-progress"><span>' + L('Пройдено в главе','Chapter progress') + '</span><b>' + count + ' / 10</b><progress value="' + count + '" max="10" aria-label="' + L('Пройдено в главе','Chapter progress') + '"></progress></div>' +
      '<div class="level-grid">' + cards + '</div></section>';
  }

  function jumpChapter(index) {
    const heading = app.querySelector('#chapter-' + index);
    if (!heading) return;
    const scroller = app.querySelector('.map-content');
    const tabs = scroller.querySelector('.chapter-tabs');
    const section = heading.closest('.map-chapter');
    const y = scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - tabs.offsetHeight - 8;
    heading.focus({ preventScroll:true });
    scroller.scrollTo({ top:y, left:0, behavior:reducedMotion.matches ? 'instant' : 'smooth' });
  }

  function renderPalettes() {
    const total = stars();
    app.innerHTML = header(L('Палитры','Palettes'), total + L(' из 150 звёзд',' of 150 stars'), 'return') +
      '<section class="palette-content"><h1>' + L('Цвет кубиков','Cube colors') + '</h1><p>' + L('Получай звёзды за уровни, чтобы открывать палитры.','Earn stars to unlock new palettes.') + '</p><div class="palette-grid">' + palettes.map(p => {
        const active = p.color === profile.palette;
        return '<button class="palette-card tone-' + p.color + '" data-action="palette" data-color="' + p.color + '" aria-pressed="' + active + '"' +
          (total < p.stars ? ' disabled' : '') + '><span class="swatch"><i>' + L('А','A') + '</i><i>' + L('Б','B') + '</i><i>' + L('В','C') + '</i></span><b>' + localized(p.name) +
          '</b><small>' + (active ? L('Выбрано','Selected') : total < p.stars ? '★ ' + p.stars : L('Открыто','Unlocked')) + '</small></button>';
      }).join('') + '</div></section>';
  }

  function buildGame(id,resume) {
    const level = levels[id-1];
    const engine = E.compile(level);
    const history = [{ board: level.board, found: [] }];
    const moves = [];
    const bonus = validBonus(resume?.bonus) ? resume.bonus : null;
    let spent = false;
    for (const pair of resume?.moves || []) {
      if (!Array.isArray(pair) || ![2,3].includes(pair.length) || !pair.slice(0,2).every(Number.isInteger)) break;
      if (pair.length === 3 && (spent || !bonus || pair[2] !== bonus)) break;
      const previous = history.at(-1);
      if (previous.found.length === level.words.length) break;
      const next = engine.play(previous.board, previous.found, ...pair);
      if (!next) break;
      spent ||= pair.length === 3;
      next.streak = next.hits.length ? (previous.streak || 0) + 1 : 0;
      history.push(next);
      moves.push(pair);
    }
    const savedLayer = resume?.layer;
    const layer = Number.isInteger(savedLayer) && savedLayer >= 0 && savedLayer < level.d ? savedLayer : engine.xyz(level.board.indexOf(''))[2];
    return { level, engine, budget:E.movesBudget(level), history, moves, hints: Math.max(0, Number(resume?.hints) || 0), layer, bonus, solved: false, result: null, trace: null };
  }

  function saveGame() {
    if (game && !game.solved) profile.active = {
      id:game.level.id, layout:game.level.revision || 1, moves:game.moves, layer:game.layer, hints:game.hints, bonus:game.bonus
    };
    save();
  }

  function openLevel(id, force = false, restart = false) {
    if (!levels[id-1]) return;
    const current = profile.active;
    if (!force && current?.id !== id && current?.moves.length) {
      pendingLevel = id;
      modal(L('Открыть уровень ' + id + '?','Open level ' + id + '?'),
        '<p>' + L('Ходы на уровне ' + current.id + ' будут сброшены. Звёзды сохранятся.','Moves on level ' + current.id + ' will reset. Your stars are saved.') + '</p>',
        buttonHTML('confirm-level',L('Открыть уровень','Open level')) + buttonHTML('close',L('Отмена','Cancel'),'secondary'));
      return;
    }
    const resume = current?.id === id ? (restart ? { bonus:current.bonus } : force ? null : current) : null;
    game = buildGame(id,resume);
    if (!game.bonus && !restart && profile.bonus && id >= 30 &&
        (profile.bonus !== 'break' || game.level.board.some(E.isWall))) {
      game.bonus = profile.bonus;
      profile.bonus = null;
    }
    selected = null;
    hintMove = null;
    message = '';
    combo = 0;
    bonusMode = false;
    busy = false;
    saveGame();
    go('game');
    if (exhausted()) showExhausted();
  }

  function switchLanguage(next) {
    if (!campaigns[next] || next === language) return;
    const nextScreen = screen === 'map' ? 'map' : 'home';
    language = next;
    levels = campaigns[language];
    try { localStorage.setItem('slovokub-language',language); } catch { /* Session still switches language. */ }
    if (params.has('lang') && location.protocol !== 'file:') {
      const url = new URL(location.href);
      url.searchParams.set('lang',language);
      history.replaceState(null,'',url);
    }
    profile = read();
    game = null;
    bonusMode = false;
    selected = null;
    hintMove = null;
    busy = false;
    go(nextScreen);
  }

  function currentState() { return game.history.at(-1); }
  function movesLeft() { return Math.max(0,game.budget.limit-game.moves.length); }
  function exhausted() { return !game.solved && movesLeft() === 0; }
  const ruleTips = {
    combo: ['Комбо','Собери по слову двумя ходами подряд.','Combo','Complete a word on two moves in a row.'],
    pinned: ['Закреплённая буква','Собери слово вокруг буквы с замком. Она сгорит вместе со словом.','Pinned letter','Build a word around the locked letter. It clears with the word.'],
    fragile: ['Хрупкая стенка','Собери слово вплотную к треснувшему камню. Он рассыплется.','Cracked wall','Complete a word against a cracked wall to break it.'],
    lift: ['Лифт','Сдвинь букву на отмеченную клетку. Лифт перенесёт её, если выход свободен.','Lift','Slide a letter onto a lift. It travels if the other end is empty.'],
    spark: ['Искра','Собери слово с отмеченной буквой. Пять искр дают бонус на следующий уровень.','Spark','Clear the marked letter. Five sparks earn a boost for the next level.'],
  };
  function ruleTip(rule) {
    const tip = ruleTips[rule];
    return tip ? [L(tip[0],tip[2]), L(tip[1],tip[3])] : null;
  }
  function buttonHTML(action,label,variant = 'primary',disabled = false) {
    return '<button type="button" class="button ' + variant + '" data-action="' + action + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
  }
  function symbolFor(value) {
    if (value === '%') return L('Хрупкая стенка','Cracked wall');
    if (value === '#') return L('Камень','Wall');
    if (!value) return L('Пустая клетка','Empty cell');
    return E.letter(value) + (E.isPinned(value) ? L(', закреплена',', pinned') : '') + (E.isSpark(value) ? L(', искра',', spark') : '');
  }

  function lesson() {
    const { level:l } = game;
    if (l.id <= 2) {
      const letter = E.letter(l.board[l.solution[0][0]]);
      return L('Нажми на «' + letter + '», затем на пустую клетку. Получится «' + l.words[0] + '».',
        'Tap ' + letter + ', then the empty cell to make ' + l.words[0] + '.');
    }
    if (l.id === 11) return L('Выбери букву, открой соседний этаж и нажми на подсвеченную клетку.',
      'Select a letter, open the next floor, then tap the highlighted cell.');
    if (l.intro) return l.intro;
    const tip = ruleTip(l.mechanic);
    if (tip) return '<b>' + tip[0] + '</b> ' + tip[1];
    if (l.id === 3) return L('Собери оба слова. Освободившиеся клетки помогут со следующим ходом.','Complete both words. The empty cells give you room for your next move.');
    return '';
  }

  function wordList() {
    const { found } = currentState();
    return '<ul class="word-list">' + game.level.words.map(word =>
      '<li class="' + (found.includes(word) ? 'found' : '') + '">' + word + '</li>').join('') + '</ul>';
  }
  function showWords() {
    modal(L('Слова уровня','Target words'),wordList(),buttonHTML('close',L('Готово','Done')));
  }
  function bonusName(kind) { return kind === 'swap' ? L('Обмен','Swap') : L('Разбить камень','Break a wall'); }
  function bonusAvailable() { return game.bonus && !game.moves.some(pair => pair.length === 3); }
  function sparkMeter() {
    const earned = !profile.collected[game.level.id] && !game.solved && game.history.some(state => state.spark) ? 1 : 0;
    const total = Math.min(5,profile.sparks + earned);
    const name = L('Искры','Sparks');
    return '<button type="button" class="spark-meter" data-action="spark-tip" aria-label="' + name + ' ' + total + ' / 5">' +
      Array.from({ length:5 }, (_,i) => '<i class="' + (i < total ? 'lit' : '') + '">✦</i>').join('') + '</button>';
  }

  function renderGame() {
    const { level:l, layer, engine } = game;
    const { board, found } = currentState();
    const offset = layer * engine.plane;
    const cells = board.slice(offset, offset + engine.plane);
    const canShift = to => selected !== null && engine.legal(board,selected,to);
    const firstCue = l.id <= 2 && !game.moves.length ? l.solution[0] : null;
    const cue = hintMove || firstCue;
    const feature = l.mechanic && !game.history.some(state => l.mechanic === 'fragile' ? state.broken?.length :
      l.mechanic === 'lift' ? state.port : l.mechanic === 'spark' ? state.spark :
      l.mechanic === 'pinned' ? !state.board.some(E.isPinned) : false);
    const currentLesson = !game.moves.length || (feature && ['lift','spark'].includes(l.mechanic)) ? lesson() : '';
    const guide = message || currentLesson;
    const size = l.w + '×' + l.h + (l.d > 1 ? '×' + l.d : '');
    const levelName = L('Уровень ','Level ') + l.id;
    const gameTop = '<header class="topbar game-top">' + iconButton('home',L('Главное меню','Main menu'),'back') +
      '<div class="top-title"><strong>' + levelName + '</strong><small>' + size + '</small></div>' +
      '<div class="game-right"><span class="move-count" aria-label="' + L('Осталось ходов ','Moves left ') + movesLeft() + '">' +
      '<small>' + L('Осталось','Moves left') + '</small><b>' + movesLeft() + '</b></span>' +
      iconButton('pause',L('Пауза','Pause'),'more') + '</div></header>';
    const sparks = l.id >= 29 ? '<div class="arena-sparks">' + sparkMeter() + '</div>' : '';
    const layers = l.d > 1 ? '<div class="layer-tabs many-layers" role="group" aria-label="' + L('Этажи куба','Cube floors') + '">' +
      Array.from({ length:l.d }, (_,i) => {
        const start = i * engine.plane;
        const content = board.slice(start,start+engine.plane);
        const featureHere = feature && content.some(value => (l.mechanic === 'spark' && E.isSpark(value)) ||
          (l.mechanic === 'pinned' && E.isPinned(value)) || (l.mechanic === 'fragile' && value === '%'));
        const highlight = cue?.some(cell => engine.xyz(cell)[2] === i) || featureHere ? ' layer-hint' : '';
        const available = selected !== null && engine.neighbors[selected].some(cell => engine.xyz(cell)[2] === i && canShift(cell));
        const hasLift = [...engine.lift.keys()].some(cell => engine.xyz(cell)[2] === i);
        return '<button class="layer-tab' + highlight + (available && i !== layer ? ' layer-candidate' : '') + '" data-action="layer" data-index="' + i + '" aria-pressed="' + (layer === i) +
          '" aria-label="' + L('Этаж ','Floor ') + (i+1) + '"><span class="mini-grid" aria-hidden="true" style="--mini-w:' + l.w + '">' +
          content.map(c => '<i class="' + (E.isWall(c) ? 'mini-stone' : c ? 'mini-filled' : '') + '"></i>').join('') +
          '</span><b>' + (i+1) + '</b>' + (hasLift ? '<span class="layer-lift" aria-hidden="true">↕</span>' : '') + '</button>';
      }).join('') + '</div>' : '';
    const boardHtml = '<div class="board-chassis"><div class="board-grid" data-board aria-label="' + L('Игровое поле','Puzzle board') +
      '" style="--cols:' + l.w + ';--rows:' + l.h + '">' + cells.map((value,i) => {
        const id = i + offset;
        const tile = engine.isTile(value);
        const letter = tile ? E.letter(value) : '';
        const liftEnd = engine.lift.get(id);
        const port = liftEnd !== undefined;
        const wall = E.isWall(value);
        const demoMarker = feature && ((l.mechanic === 'pinned' && E.isPinned(value)) || (l.mechanic === 'fragile' && value === '%') ||
          (l.mechanic === 'lift' && port) || (l.mechanic === 'spark' && E.isSpark(value)));
        const classes = ['cell',tile ? 'tile tile-' + letterColor(letter) : wall ? 'stone' : 'vacant',
          engine.canMove(value) && engine.neighbors[id].some(n => board[n] === '') ? 'movable' : '',
          id === selected ? 'selected' : '', canShift(id) ? 'candidate' : '', cue?.[0] === id && selected !== id ? 'hint-from' : '', cue?.[1] === id && selected === cue[0] ? 'hint-to' : '',
          E.isPinned(value) ? 'pinned' : '', value === '%' ? 'fragile' : '', E.isSpark(value) ? 'spark-tile' : '',
          port ? 'lift-port' : '', demoMarker ? 'learn-item' : '',
          bonusMode && (game.bonus === 'break' ? wall : selected !== null && engine.canSwap(board, selected, id)) ? 'bonus-target' : '',
        ].filter(Boolean).join(' ');
        const [x,y] = engine.xyz(id);
        const destination = port ? engine.xyz(liftEnd)[2]+1 : 0;
        const label = symbolFor(value) + (port ? L(', лифт на этаж ', ', lift to floor ') + destination : '') +
          L(', ряд ', ', row ') + (y+1) + L(', столбец ', ', column ') + (x+1);
        const badge = E.isPinned(value) ? '▣' : E.isSpark(value) ? '✦' : value === '%' ? 'ϟ' : '';
        return '<button class="' + classes + '" type="button" data-cell="' + id + '" aria-label="' + label + '"' +
          (selected === id ? ' aria-pressed="true"' : '') + '><span aria-hidden="true">' + (tile ? letter : wall ? '' : '·') + '</span>' +
          (badge ? '<i class="tile-mark" aria-hidden="true">' + badge + '</i>' : '') +
          (port ? '<i class="lift-mark" aria-hidden="true">↕' + destination + '</i>' : '') + '</button>';
      }).join('') + '<div class="effects" aria-hidden="true"></div></div>' +
      (combo > 1 ? '<div class="combo-pop" aria-live="polite">' + L('КОМБО','COMBO') + ' ×' + combo + '</div>' : '') + '</div>';
    app.innerHTML = gameTop + '<div class="game-content" data-level="' + l.id + '">' +
      (layers ? '<div class="arena-floors">' + layers + '</div>' : '') +
      '<section class="board-area" style="--board-ratio:' + (l.w/l.h) + '" aria-label="' + L('Игровая зона','Play area') +
      '">' + sparks + boardHtml + '<p class="arena-message" id="guide">' + guide + '</p></section></div>';
  }

  function letterColor(letter) {
    if ('АЕЁИОУЫЭЮЯAEIOUY'.includes(letter)) return 'vowel';
    if ('ЖЗЙХЦЧШЩЪЬФJQXZ'.includes(letter)) return 'rare';
    return 'consonant';
  }

  function moveWord(n) {
    if (language === 'en') return n === 1 ? 'move' : 'moves';
    if (n % 100 >= 11 && n % 100 <= 14) return 'ходов';
    if (n % 10 === 1) return 'ход';
    if (n % 10 >= 2 && n % 10 <= 4) return 'хода';
    return 'ходов';
  }

  function chooseCell(id, byKeyboard = false) {
    if (busy || game.solved || exhausted()) return;
    const { board } = currentState();
    const { engine } = game;
    if (bonusMode && bonusAvailable()) {
      if (game.bonus === 'break' && E.isWall(board[id])) {
        playMove(id,id,byKeyboard,'break');
      } else if (game.bonus === 'swap' && engine.canMove(board[id])) {
        if (selected !== null && engine.canSwap(board,selected,id)) playMove(selected,id,byKeyboard,'swap');
        else {
          selected = id;
          message = L('Выбери соседнюю букву для обмена.','Choose an adjacent letter to swap.');
          renderGame();
          if (byKeyboard) focusCell(id);
        }
      } else {
        updateGuide(L('Выбери подсвеченную клетку или нажми бонус ещё раз.','Choose a highlighted cell or tap the boost again.'));
      }
      return;
    }
    if (E.isPinned(board[id])) { updateGuide(ruleTip('pinned')[1]); return; }
    if (board[id] === '%') { updateGuide(ruleTip('fragile')[1]); return; }
    if (board[id] === '') {
      if (selected !== null && engine.legal(board,selected,id)) playMove(selected,id,byKeyboard);
      else updateGuide(selected === null ? L('Сначала нажми на букву.','Tap a letter first.') :
        L('Выбери подсвеченную клетку рядом с буквой.','Choose a highlighted cell next to the letter.'));
      return;
    }
    if (!engine.canMove(board[id])) return;
    selected = selected === id ? null : id;
    if (hintMove && selected !== hintMove[0]) hintMove = null;
    message = selectionGuide();
    renderGame();
    if (byKeyboard) focusCell(id);
    if (message) tell(message);
  }

  function selectionGuide() {
    if (selected === null) return '';
    const { engine,layer } = game;
    const { board } = currentState();
    const available = engine.neighbors[selected].filter(cell => engine.legal(board,selected,cell));
    if (!available.length) return L('Рядом с этой буквой нет пустой клетки.','There is no empty cell next to this letter.');
    if (available.some(cell => engine.xyz(cell)[2] === layer)) {
      return game.level.id <= 2 && !game.moves.length ?
        L('Теперь нажми на подсвеченную пустую клетку.','Now tap the highlighted empty cell.') : '';
    }
    return L('Открой подсвеченный этаж и нажми на пустую клетку.','Open a highlighted floor and tap the empty cell.');
  }

  function updateGuide(text) {
    message = text;
    document.querySelector('#guide').textContent = text;
    tell(text);
  }

  function focusCell(id) { app.querySelector('[data-cell="' + id + '"]')?.focus({ preventScroll: true }); }

  function playMove(from, to, byKeyboard = false, kind) {
    if (busy || game.solved || exhausted()) return;
    const { board, found } = currentState();
    const { engine, level } = game;
    const next = engine.play(board, found, from, to, kind);
    if (!next) return;
    const moved = engine.isTile(board[from]) ? E.letter(board[from]) : '';
    const oldLayer = game.layer;
    const streak = next.hits.length ? (currentState().streak || 0) + 1 : 0;
    next.streak = streak;
    combo = level.id >= 6 ? streak : 0;
    game.history.push(next);
    game.moves.push(kind ? [from,to,kind] : [from,to]);
    game.layer = engine.xyz(next.landed)[2];
    selected = null;
    hintMove = null;
    bonusMode = false;
    const names = next.hits.map(hit => hit.word).join(', ');
    message = '';
    if (names) tell(L('Сгорело — ','Cleared: ') + names);
    else if (next.port) tell(L('Лифт доставил букву на этаж ','Lift delivered the letter to floor ') + (game.layer+1));
    const win = next.found.length === level.words.length;
    if (win) recordWin();
    else saveGame();
    renderGame();
    if (byKeyboard) focusCell(next.landed);
    playSound(next.hits.length ? 'burn' : 'slide');
    animateMove(from, next.landed, moved, oldLayer, next.hits, next.broken, kind);
    if (combo > 1) {
      const pop = app.querySelector('.combo-pop');
      setTimeout(() => pop?.remove(),1050);
      combo = 0;
    }
    if (!win && !exhausted()) return;
    busy = true;
    const finished = game;
    setTimeout(() => {
      if (game !== finished) return;
      busy = false;
      if (screen === 'game') win ? showWin() : showExhausted();
    }, reducedMotion.matches ? 0 : 380);
  }

  function recordWin() {
    const { level,moves,budget } = game;
    const before = stars();
    const { percent,tier } = E.rateMoves(moves.length,budget);
    const prior = profile.scores[level.id];
    const improved = !prior || tier > prior.stars || (tier === prior.stars && moves.length < prior.moves);
    if (improved) profile.scores[level.id] = { stars:tier, moves:moves.length, percent };
    const spark = !profile.collected[level.id] && game.history.some(state => state.spark);
    if (spark) {
      profile.collected[level.id] = true;
      profile.sparks++;
    }
    const after = stars();
    const rewards = palettes.filter(p => p.stars > before && p.stars <= after);
    game.solved = true;
    game.result = { tier, percent, prior, rewards, spark, combo, full:cleared() === 50 };
    profile.last = level.id;
    profile.active = null;
    save();
  }

  function canPickBonus() { return profile.sparks >= 5 && !profile.bonus; }
  function bonusChoices() {
    return '<div class="reward-choices"><p>' + L('Выбери бонус на следующий уровень.','Choose a boost for your next level.') + '</p>' +
      '<button class="button secondary" data-action="pick-bonus" data-kind="swap">' + bonusName('swap') + '</button>' +
      '<button class="button secondary" data-action="pick-bonus" data-kind="break">' + bonusName('break') + '</button></div>';
  }
  function showSparkHelp() {
    const tip = ruleTip('spark');
    modal(tip[0],'<p>' + tip[1] + '</p>' + (canPickBonus() ? bonusChoices() : ''),buttonHTML('close',L('Готово','Done')));
  }
  function ratingBar(percent) {
    const name = L('Эффективность ходов','Move efficiency');
    return '<div class="rating"><div class="rating-label"><span>' + name + '</span><strong>' + percent +
      '%</strong></div><div class="rating-track" role="progressbar" aria-label="' + name +
      '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><span style="width:' + percent +
      '%"></span></div><div class="rating-ends" aria-hidden="true"><span>0%</span><span>100%</span></div></div>';
  }
  function showExhausted() {
    modal(L('Ходы закончились','No moves left'),
      ratingBar(0) + '<p>' + L('Отмени последний ход или начни уровень заново.','Undo the last move or restart the level.') + '</p>',
      buttonHTML('undo-limit',L('Отменить ход','Undo last move')) + buttonHTML('confirm-restart',L('Заново','Restart'),'secondary') +
      buttonHTML('map',L('К уровням','Levels'),'secondary'),'win-dialog',false);
  }

  function showWin() {
    const { level, moves, result } = game;
    const rewards = result.rewards.map(p => '<p class="reward tone-' + p.color + '">' +
      L('Новая палитра «','New palette · ') + localized(p.name) + L('»','') + '</p>').join('');
    const best = result.prior && result.prior.stars > result.tier ? '<p>' + L('Лучший результат — ','Personal best: ') + result.prior.stars + ' ★</p>' : '';
    const next = level.id < 50;
    const spark = result.spark ? '<p class="reward">✦ ' + L('Искра получена','Spark earned') + '</p>' : '';
    const streak = result.combo > 1 ? '<p class="reward">' + L('КОМБО','COMBO') + ' ×' + result.combo + '</p>' : '';
    const boost = canPickBonus() && level.id < 50 ? bonusChoices() : profile.bonus ? '<p class="reward">' +
      L('Бонус готов — ','Boost ready: ') + bonusName(profile.bonus) + '</p>' : '';
    modal(result.full ? L('Все уровни пройдены!','All levels complete!') : L('Уровень пройден!','Level complete!'),
      '<div class="win-stars">' + medal(result.tier) + '</div>' + ratingBar(result.percent) + '<p>' + level.words.length + ' / ' + level.words.length +
      L(' слов · ',' words · ') + moves.length + ' / ' + game.budget.limit + ' ' + moveWord(game.budget.limit) + '</p>' + best + rewards + streak + spark + boost,
      buttonHTML(next ? 'next' : 'map',next ? L('Следующий уровень','Next level') : L('К уровням','Levels')) +
      buttonHTML(next ? 'map' : 'home',next ? L('К уровням','Levels') : L('Главное меню','Main menu'),'secondary'), 'win-dialog', false);
  }

  function animateMove(from, to, letter, oldLayer, hits, broken, kind) {
    if (reducedMotion.matches) return;
    const host = app.querySelector('.effects');
    const box = host.getBoundingClientRect();
    function clone(id, label, type) {
      const tile = app.querySelector('[data-cell="' + id + '"]');
      if (!tile) return null;
      const rect = tile.getBoundingClientRect();
      const item = document.createElement('i');
      item.className = 'fx ' + type;
      item.textContent = label;
      Object.assign(item.style, { left: (rect.left-box.left) + 'px', top: (rect.top-box.top) + 'px', width: rect.width + 'px', height: rect.height + 'px' });
      host.append(item);
      item.addEventListener('animationend', () => item.remove(), { once: true });
      return item;
    }
    for (const id of broken) clone(id,'ϟ','burn-fx crumble-fx');
    if (hits.length) {
      for (const hit of hits) hit.ids.forEach((id,i) => {
        const effect = clone(id, hit.word[i], 'burn-fx');
        if (effect) effect.style.animationDelay = (i*24) + 'ms';
      });
      return;
    }
    if (kind || oldLayer !== game.layer) return;
    const moving = clone(to, letter, 'slide-fx tile-' + letterColor(letter));
    if (!moving) return;
    app.querySelector('[data-cell="' + to + '"]').classList.add('slide-target');
    const source = app.querySelector('[data-cell="' + from + '"]').getBoundingClientRect();
    const dest = moving.getBoundingClientRect();
    moving.style.setProperty('--dx', (source.left-dest.left) + 'px');
    moving.style.setProperty('--dy', (source.top-dest.top) + 'px');
  }

  function undo() {
    if (busy || game.solved || !game.moves.length) return;
    const [from] = game.moves.pop();
    game.history.pop();
    combo = 0;
    bonusMode = false;
    game.layer = game.engine.xyz(from)[2];
    selected = null;
    hintMove = null;
    message = L('Ход отменён.','Move undone.');
    saveGame();
    renderGame();
    tell(message);
  }

  function hint() {
    if (busy || game.solved || exhausted()) return;
    bonusMode = false;
    const { board, found } = currentState();
    game.trace ??= E.trace(game.level, game.engine).hints;
    const known = game.trace.get(E.key(board, found));
    const move = known ?? E.search(game.engine, board, found)?.[0];
    if (!move) {
      const blocked = game.engine.moves(board).next().done;
      updateGuide(blocked ? L('Доступных ходов нет. Отмени последний ход или начни уровень заново.','No moves available. Undo your last move or restart.') : L('Подсказка не нашла короткий путь. Отмени несколько ходов, чтобы вернуться к начальной раскладке.','No short route found. Undo a few moves to return to an earlier position.'));
      return;
    }
    hintMove = move;
    selected = null;
    game.layer = game.engine.xyz(move[0])[2];
    message = L('Сначала нажми на «' + E.letter(board[move[0]]) + '», затем выбери клетку.',
      'Tap ' + E.letter(board[move[0]]) + ' first, then choose the empty cell.');
    game.hints++;
    saveGame();
    renderGame();
    tell(message);
  }

  function switchLayer(layer) {
    if (busy || game.solved || game.layer === layer || layer < 0 || layer >= game.level.d) return;
    game.layer = layer;
    if (bonusMode) selected = null;
    message = selectionGuide();
    saveGame();
    renderGame();
    tell(L('Этаж ','Floor ') + (layer+1));
  }

  function playSound(kind) {
    if (!profile.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      audio ??= new Audio();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const pitches = kind === 'burn' ? [523.25,659.25,783.99] : [260];
      pitches.forEach((pitch,i) => {
        const time = audio.currentTime + i * .065;
        const oscillator = audio.createOscillator();
        const volume = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(pitch,time);
        volume.gain.setValueAtTime(.001,time);
        volume.gain.exponentialRampToValueAtTime(.11,time+.015);
        volume.gain.exponentialRampToValueAtTime(.001,time+.14);
        oscillator.connect(volume).connect(audio.destination);
        oscillator.start(time);
        oscillator.stop(time+.15);
      });
    } catch { /* Sound is optional on browsers without Web Audio. */ }
  }

  function positionDialog() {
    const { left, top, width, height } = deviceScreen.getBoundingClientRect();
    dialog.style.setProperty('--screen-x',(left + width/2) + 'px');
    dialog.style.setProperty('--screen-y',(top + height/2) + 'px');
    dialog.style.setProperty('--screen-w',width + 'px');
    dialog.style.setProperty('--screen-h',height + 'px');
  }

  function repositionOpenDialog() {
    if (dialog.open) positionDialog();
  }
  new ResizeObserver(repositionOpenDialog).observe(deviceScreen);
  window.addEventListener('resize',repositionOpenDialog);
  window.addEventListener('scroll',repositionOpenDialog,{ passive:true });

  function modal(title, body, actions, style = '', dismissible = true) {
    dialog.className = style;
    dialog.dataset.dismissible = String(dismissible);
    dialog.innerHTML = '<div class="dialog-inner">' + (dismissible ? iconButton('close', L('Закрыть','Close'), 'close', 'dialog-close') : '') +
      '<h2 id="dialog-title">' + title + '</h2><div class="dialog-copy">' + body + '</div><div class="dialog-actions">' + actions + '</div></div>';
    positionDialog();
    if (!dialog.open) dialog.showModal();
    else dialog.querySelector('button:not(.dialog-close)')?.focus();
  }

  function showHelp() {
    const rules = [
      [L('Сдвигай кубики','Slide the cubes'),L('Сначала нажми на букву. Затем нажми на соседнюю пустую клетку.','Tap a letter first. Then tap an adjacent empty cell.')],
      [L('Собирай слова','Make words'),L('Слова читаются слева направо или сверху вниз на одном этаже. Готовое слово освобождает клетки.','Read left to right or top to bottom on one floor. Completed words clear their cells.')],
      [L('Перемещай буквы между этажами','Move between floors'),L('Выбери букву, открой соседний этаж и нажми на подсвеченную пустую клетку.','Select a letter, open an adjacent floor, then tap the highlighted empty cell.')],
    ];
    if (game) {
      const id = game.level.id;
      for (const [rule, first] of Object.entries({ combo:6, pinned:7, fragile:12, lift:22, spark:29 })) {
        if (id >= first) rules.push(ruleTip(rule));
      }
    }
    modal(L('Как играть','How to play'),'<ol class="how-list">' + rules.map(([title,detail]) =>
      '<li><b>' + title + '</b><p>' + detail + '</p></li>').join('') + '</ol>',buttonHTML('close',L('Понятно','Got it')));
  }

  function showSettings() {
    const storage = persist ? L('Прогресс хранится в этом браузере.','Progress is saved in this browser.') :
      L('Браузер не даёт сохранить прогресс после закрытия страницы.','This browser could not save your progress.');
    const playing = screen === 'game';
    const sound = L('Звук','Sound');
    const rating = playing ? L('Лимит — ' + game.budget.limit + ' ходов. План — ' + game.budget.reference +
      '. Три звезды от 85%, две от 50%.', 'Limit: ' + game.budget.limit + ' moves. Target: ' + game.budget.reference +
      '. Three stars at 85% and up, two at 50% and up.') : storage;
    const tools = playing ? '<div class="pause-tools">' +
      buttonHTML('undo',L('Отмена','Undo'),'secondary',!game.moves.length) +
      buttonHTML('hint',L('Подсказка','Hint'),'secondary') +
      buttonHTML('restart',L('Заново','Restart'),'secondary') +
      buttonHTML('words',L('Слова уровня','Target words'),'secondary') +
      (bonusAvailable() ? buttonHTML('boost',bonusName(game.bonus),'secondary') : '') +
      buttonHTML('map',L('К уровням','Levels'),'secondary') + '</div>' : '';
    modal(playing ? L('Пауза','Pause') : L('Настройки','Settings'),
      '<div class="setting-row"><b>' + sound + '</b><button class="switch" role="switch" aria-checked="' + profile.sound +
      '" aria-label="' + sound + '" data-action="sound"><i></i></button></div><p>' + rating + '</p>',
      buttonHTML('close',playing ? L('Продолжить','Continue') : L('Готово','Done')) + tools +
      buttonHTML('help',L('Как играть','How to play'),'secondary'));
  }

  let paletteReturn = 'home';
  function action(button) {
    const { action: name, index, color } = button.dataset;
    switch (name) {
      case 'language': switchLanguage(button.dataset.language); break;
      case 'words': showWords(); break;
      case 'spark-tip': showSparkHelp(); break;
      case 'boost':
        if (!bonusAvailable()) break;
        if (dialog.open) dialog.close();
        bonusMode = !bonusMode;
        selected = null;
        message = bonusMode ? (game.bonus === 'break' ? L('Выбери камень, чтобы разбить его.','Choose a wall to break.') :
          L('Выбери две соседние буквы.','Choose two adjacent letters.')) : '';
        renderGame();
        break;
      case 'pick-bonus':
        if (!canPickBonus() || !validBonus(button.dataset.kind)) break;
        profile.bonus = button.dataset.kind;
        profile.sparks -= 5;
        save();
        if (game.solved) showWin();
        else { showSparkHelp(); renderGame(); }
        break;
      case 'home': go('home'); break;
      case 'map': go('map'); break;
      case 'chapter': jumpChapter(Number(index)); break;
      case 'settings':
      case 'pause': if (!busy) showSettings(); break;
      case 'close': dialog.close(); break;
      case 'help': showHelp(); break;
      case 'sound':
        profile.sound = !profile.sound;
        save();
        button.setAttribute('aria-checked', String(profile.sound));
        if (profile.sound) playSound('slide');
        break;
      case 'palettes': paletteReturn = screen; go('palettes'); break;
      case 'return':
        if (paletteReturn === 'map') { screen = 'map'; render(); window.scrollTo(0,0); }
        else go('home');
        break;
      case 'palette':
        profile.palette = color;
        save();
        renderPalettes();
        app.querySelector('[data-color="' + color + '"]')?.focus();
        break;
      case 'start': openLevel(1); break;
      case 'continue': openLevel(continueId()); break;
      case 'level': openLevel(Number(index)); break;
      case 'confirm-level': if (pendingLevel) openLevel(pendingLevel, true); pendingLevel = null; break;
      case 'next': openLevel(game.level.id+1); break;
      case 'layer': switchLayer(Number(index)); break;
      case 'undo': if (dialog.open) dialog.close(); undo(); break;
      case 'undo-limit': dialog.close(); undo(); break;
      case 'hint': if (dialog.open) dialog.close(); hint(); break;
      case 'restart':
        if (busy || game.solved) break;
        if (!game.moves.length && !game.hints) { updateGuide(L('Уровень уже в начальной позиции.','The board is at its starting position.')); break; }
        modal(L('Начать уровень заново?','Restart this level?'),
          '<p>' + L('Все кубики вернутся на свои места.','All cubes will return to their starting positions.') + '</p>',
          buttonHTML('confirm-restart',L('Начать заново','Restart')) + buttonHTML('close',L('Отмена','Cancel'),'secondary'));
        break;
      case 'confirm-restart': openLevel(game.level.id,true,true); break;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.action) action(button);
    else if (screen === 'game' && button.dataset.cell !== undefined) chooseCell(Number(button.dataset.cell), event.detail === 0);
  });
  dialog.addEventListener('cancel', event => { if (dialog.dataset.dismissible === 'false') event.preventDefault(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && dialog.dataset.dismissible !== 'false') dialog.close();
  });
  app.addEventListener('keydown', event => {
    if (screen !== 'game' || !event.target.matches('[data-cell]')) return;
    const directions = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const { engine, level } = game;
    const [x,y,z] = engine.xyz(Number(event.target.dataset.cell));
    const a = x+direction[0], b = y+direction[1];
    if (a >= 0 && b >= 0 && a < level.w && b < level.h) focusCell(engine.index(a,b,z));
  });
  render();
})();
