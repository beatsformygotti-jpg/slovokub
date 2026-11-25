(function () {
  'use strict';

  const E = window.CubeEngine;
  const campaigns = window.CubeCampaigns;
  const previousLevels = window.CubeLevels;
  const legacyLevels = window.CubeLegacyLevels || [];
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
  const glyph = { play: '▶', levels: '▦', sound: '♫', back: '‹', more: '⋯', close: '×', hint: '✦', undo: '↶', retry: '↻', help: '?', palettes: '◈', star: '★', lock: '▣', up: '↑', down: '↓' };
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
  let pointer = null;
  let ignoreClickUntil = 0;
  let pendingLevel = null;
  let audio = null;

  function read() {
    const initial = { scores: {}, active: null, sound: true, palette: 'violet', sparks: 0, collected: {}, bonus: null };
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()));
      if (!raw || typeof raw !== 'object') return initial;
      const scores = {};
      for (const level of levels) {
        const item = raw.scores?.[level.id];
        if (item && Number.isInteger(item.stars) && item.stars >= 1 && item.stars <= 3 && Number.isInteger(item.moves) && item.moves >= 1) scores[level.id] = item;
      }
      const active = raw.active && Number.isInteger(raw.active.id) && levels[raw.active.id - 1] && Array.isArray(raw.active.moves) ? raw.active : null;
      return { ...initial, scores, active, sound: raw.sound !== false,
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
  function unlocked(id) { return preview || id <= frontier() || Boolean(profile.scores[id]); }
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
      '<div class="secondary-menu"><button class="button secondary" data-action="continue" ' + (resumable ? '' : 'disabled') + '>' + icon('retry') + '<span>' + L('Продолжить','Continue') + (resumable ? '<small>' + L('Уровень ','Level ') + (active ?? frontier()) + '</small>' : '') + '</span></button>' +
      '<button class="button secondary" data-action="map">' + icon('levels') + '<span>' + L('Выбрать уровень','Choose level') + '</span></button></div></section>' +
      (preview ? '<p class="preview-label">' + L('Демо. Все уровни открыты.','Demo. All levels unlocked.') + '</p>' : '');
  }

  function renderMap() {
    const current = chapterIndex(profile.active?.id ?? frontier());
    const navigation = '<nav class="chapter-tabs" aria-label="' + L('Перейти к главе','Jump to chapter') + '">' + chapters.map((chapter,i) => {
      const range = (i*10+1) + '–' + ((i+1)*10);
      return '<button type="button" data-action="chapter" data-index="' + i + '" class="tone-' + chapter.color +
        (i === current ? ' playing-chapter' : '') + '" aria-label="' + L('Глава ','Chapter ') + (i+1) + '. ' + localized(chapter.name) + L(', уровни ',', levels ') + range + '">' +
        '<b>' + (i+1) + '</b><small>' + range + '</small></button>';
    }).join('') + '</nav>';
    const sections = chapters.map((chapter,i) => renderChapter(chapter,i)).join('');
    const mode = preview ?
      '<aside class="map-mode"><span>' + L('В демо открыты все уровни.','All levels are open in the demo.') + '</span><a href="?map=1' + L('','&amp;lang=en') + '">' + L('К кампании','Back to campaign') + '</a></aside>' :
      '<aside class="map-mode"><span>' + L('В кампании уровни открываются по порядку.','Levels unlock in order in the campaign.') + '</span><a href="?preview=1&amp;map=1' + L('','&amp;lang=en') + '">' + L('Сыграть в любой уровень','Play any level') + '</a></aside>';
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
      const open = unlocked(level.id);
      const active = profile.active?.id === level.id;
      return '<button class="level-card' + (level.id === frontier() || active ? ' current' : '') + '" data-action="level" data-index="' + level.id + '"' +
        (open ? '' : ' disabled') + ' aria-label="' + L('Уровень ','Level ') + level.id + (score ? L(', звёзд ',', stars ') + score.stars : open ? '' : L(', закрыт',', locked')) + '">' +
        '<strong>' + level.id + '</strong>' + (open ? medal(score?.stars ?? 0) : icon('lock')) + '</button>';
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
    heading.focus({ preventScroll: true });
    heading.closest('.map-chapter').scrollIntoView({ block:'start', behavior:reducedMotion.matches ? 'instant' : 'smooth' });
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

  function buildGame(id, resume, layout) {
    const revision = layout ?? resume?.layout ?? (resume ? 1 : 3);
    const earlier = revision === 1 ? legacyLevels : revision === 2 ? previousLevels : [];
    const level = (language === 'ru' && earlier[id-1]) || levels[id-1];
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
    return { level, engine, history, moves, hints: Math.max(0, Number(resume?.hints) || 0), layer, bonus, solved: false, result: null, trace: null };
  }

  function saveGame() {
    if (game && !game.solved) profile.active = {
      id:game.level.id, layout:game.level.revision || 1, moves:game.moves, layer:game.layer, hints:game.hints, bonus:game.bonus
    };
    save();
  }

  function openLevel(id, force = false, layout) {
    if (!unlocked(id)) return;
    const current = profile.active;
    if (!force && current?.id !== id && current?.moves.length) {
      pendingLevel = id;
      modal(L('Открыть уровень ' + id + '?','Open level ' + id + '?'),
        '<p>' + L('Ходы на уровне ' + current.id + ' будут сброшены. Звёзды сохранятся.','Moves on level ' + current.id + ' will reset. Your stars are saved.') + '</p>',
        buttonHTML('confirm-level',L('Открыть уровень','Open level')) + buttonHTML('close',L('Отмена','Cancel'),'secondary'));
      return;
    }
    const resume = current?.id === id && (force ? layout ? { bonus:current.bonus } : null : current.moves.length || current.layout === 3 ? current : null);
    game = buildGame(id, resume, layout);
    if (!game.bonus && !layout && profile.bonus && game.level.revision === 3 && id >= 30 &&
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
    pointer = null;
    ignoreClickUntil = 0;
    saveGame();
    go('game');
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
  function buttonHTML(action,label,variant = 'primary') {
    return '<button type="button" class="button ' + variant + '" data-action="' + action + '">' + label + '</button>';
  }
  function symbolFor(value) {
    if (value === '%') return L('Хрупкая стенка','Cracked wall');
    if (value === '#') return L('Камень','Wall');
    if (!value) return L('Пустая клетка','Empty cell');
    return E.letter(value) + (E.isPinned(value) ? L(', закреплена',', pinned') : '') + (E.isSpark(value) ? L(', искра',', spark') : '');
  }

  function lesson() {
    const { level:l } = game;
    if (l.intro && (language === 'ru' || l.revision === 3)) return l.intro;
    const tip = ruleTip(l.mechanic);
    if (tip) return '<b>' + tip[0] + '</b> ' + tip[1];
    if (l.id === 3) return L('Собери оба слова. Освободившиеся клетки помогут со следующим ходом.','Complete both words. The empty cells give you room for your next move.');
    if (l.id === 11) return L('Выбери кубик, затем «Выше» или «Ниже», чтобы сдвинуть его на соседний этаж.','Select a cube, then tap Up or Down to move it to an empty cell on the next floor.');
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
    const selectedHere = selected !== null && engine.xyz(selected)[2] === layer;
    const canShift = to => selected !== null && engine.legal(board,selected,to);
    const firstCue = l.id <= 2 && !game.moves.length && !message ? l.solution[0] : null;
    const cue = hintMove || firstCue;
    const feature = l.mechanic && !game.history.some(state => l.mechanic === 'fragile' ? state.broken?.length :
      l.mechanic === 'lift' ? state.port : l.mechanic === 'spark' ? state.spark :
      l.mechanic === 'pinned' ? !state.board.some(E.isPinned) : false);
    const currentLesson = !game.moves.length || (feature && ['lift','spark'].includes(l.mechanic)) ? lesson() : '';
    const guide = message || currentLesson || (selectedHere ? L('Выбери соседнюю пустую клетку.','Choose an adjacent empty cell.') :
      L('Сдвинь букву в соседнюю пустую клетку.','Slide a letter into an adjacent empty cell.'));
    const size = l.w + '×' + l.h + (l.d > 1 ? '×' + l.d : '');
    const levelName = L('Уровень ','Level ') + l.id;
    const gameTop = '<header class="topbar game-top">' + iconButton('home',L('Главное меню','Main menu'),'back') +
      '<div class="top-title"><strong>' + levelName + '</strong><small>' + size + '</small></div>' +
      '<div class="game-right"><span class="move-count">' + game.moves.length + ' ' + moveWord(game.moves.length) + '</span>' +
      iconButton('pause',L('Пауза','Pause'),'more') + '</div></header>';
    const compact = l.words.length <= 3 ? '<span class="quick-words">' + l.words.map(word =>
      '<span class="' + (found.includes(word) ? 'found' : '') + '">' + word + '</span>').join(' ') + '</span>' : '';
    const goals = '<section class="game-goals"><button type="button" class="goal-toggle" data-action="words">' +
      '<b>' + L('Слова','Words') + ' <span>' + found.length + '/' + l.words.length + '</span></b>' + compact +
      '<span class="word-chevron" aria-hidden="true">⌄</span></button>' +
      ((l.id >= 29 && l.revision === 3) ? sparkMeter() : '') + '</section>';
    const layers = l.d > 1 ? '<div class="layer-tabs many-layers" role="group" aria-label="' + L('Этажи куба','Cube floors') + '">' +
      Array.from({ length:l.d }, (_,i) => {
        const start = i * engine.plane;
        const content = board.slice(start,start+engine.plane);
        const featureHere = feature && content.some(value => (l.mechanic === 'spark' && E.isSpark(value)) ||
          (l.mechanic === 'pinned' && E.isPinned(value)) || (l.mechanic === 'fragile' && value === '%'));
        const highlight = cue?.some(cell => engine.xyz(cell)[2] === i) || featureHere ? ' layer-hint' : '';
        const hasLift = [...engine.lift.keys()].some(cell => engine.xyz(cell)[2] === i);
        return '<button class="layer-tab' + highlight + '" data-action="layer" data-index="' + i + '" aria-pressed="' + (layer === i) +
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
          id === selected ? 'selected' : '', canShift(id) ? 'candidate' : '', cue?.[0] === id ? 'hint-from' : '', cue?.[1] === id ? 'hint-to' : '',
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
    const below = layer > 0 && selectedHere ? selected - engine.plane : -1;
    const above = layer + 1 < l.d && selectedHere ? selected + engine.plane : -1;
    const transfer = l.d > 1 ? '<div class="depth-controls" aria-label="' + L('Сдвиг между этажами','Move between floors') + '">' +
      '<button class="depth" data-action="transfer" data-index="' + below + '"' + (canShift(below) ? '' : ' disabled') + '>' + icon('down') + ' ' + L('Ниже','Down') + '</button>' +
      '<span>' + L('Этаж ','Floor ') + (layer+1) + ' / ' + l.d + '</span><button class="depth" data-action="transfer" data-index="' + above + '"' +
      (canShift(above) ? '' : ' disabled') + '>' + icon('up') + ' ' + L('Выше','Up') + '</button></div>' : '';
    app.innerHTML = gameTop + '<div class="game-content compact-game' + (l.d > 1 ? ' multi-floor' : '') +
      '" data-level="' + l.id + '">' + goals + '<section class="board-area">' + layers + boardHtml + transfer + '</section>' +
      '<p class="guide" id="guide">' + guide + '</p><nav class="game-tools" aria-label="' + L('Помощь','Game tools') + '">' +
      '<button data-action="undo" ' + (game.moves.length ? '' : 'disabled') + '>' + icon('undo') + '<span>' + L('Отмена','Undo') + '</span></button>' +
      '<button class="hint-button" data-action="hint">' + icon('hint') + '<span>' + L('Подсказка','Hint') + '</span></button>' +
      (bonusAvailable() ? '<button data-action="boost" aria-pressed="' + bonusMode + '">✦ <span>' + bonusName(game.bonus) + '</span></button>' :
        '<button data-action="restart">' + icon('retry') + '<span>' + L('Заново','Restart') + '</span></button>') + '</nav></div>';
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
    if (busy || game.solved) return;
    const { board } = currentState();
    const { engine, layer } = game;
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
      if (selected !== null && engine.legal(board, selected, id)) {
        playMove(selected, id, byKeyboard);
        return;
      }
      const options = engine.neighbors[id].filter(i => engine.canMove(board[i]) && engine.xyz(i)[2] === layer);
      if (options.length === 1) playMove(options[0], id, byKeyboard);
      else if (options.length) updateGuide(L('Коснись буквы, которую хочешь сдвинуть сюда.','Tap the letter you want to slide here.'));
      return;
    }
    if (!engine.canMove(board[id])) return;
    const options = engine.neighbors[id].filter(i => board[i] === '');
    const flat = options.filter(i => engine.xyz(i)[2] === layer);
    if (flat.length === 1 && options.length === 1) {
      playMove(id, flat[0], byKeyboard);
      return;
    }
    selected = id;
    if (!options.length) message = L('У этого кубика нет соседней пустой клетки.','There is no empty cell next to this cube.');
    else if (!flat.length) message = L('Пустая клетка на другом этаже. Выбери «Выше» или «Ниже».','The gap is on another floor. Tap Up or Down.');
    else if (flat.length !== options.length) message = L('Выбери пустую клетку или сдвинь кубик на соседний этаж.','Choose an empty cell or move to the next floor.');
    else message = L('Выбери пустую клетку, куда сдвинуть кубик.','Choose an empty cell for the cube.');
    renderGame();
    if (byKeyboard) focusCell(id);
  }

  function updateGuide(text) {
    message = text;
    document.querySelector('#guide').textContent = text;
    tell(text);
  }

  function focusCell(id) { app.querySelector('[data-cell="' + id + '"]')?.focus({ preventScroll: true }); }

  function playMove(from, to, byKeyboard = false, kind) {
    if (busy || game.solved) return;
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
    message = names ? L('Сгорело — ','Cleared: ') + names :
      next.port ? L('Лифт доставил букву на этаж ','Lift delivered the letter to floor ') + (game.layer+1) : '';
    if (message) tell(message);
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
    if (!win) return;
    busy = true;
    const finished = game;
    setTimeout(() => {
      if (game !== finished) return;
      busy = false;
      if (screen === 'game') showWin();
    }, reducedMotion.matches ? 0 : 380);
  }

  function recordWin() {
    const { level, moves, hints } = game;
    const before = stars();
    const tier = moves.length <= level.gold && (!hints || level.id <= 3) ? 3 : moves.length <= level.silver ? 2 : 1;
    const prior = profile.scores[level.id];
    const improved = !prior || tier > prior.stars || (tier === prior.stars && moves.length < prior.moves);
    if (improved) profile.scores[level.id] = { stars: tier, moves: moves.length };
    const spark = !profile.collected[level.id] && game.history.some(state => state.spark);
    if (spark) {
      profile.collected[level.id] = true;
      profile.sparks++;
    }
    const after = stars();
    const rewards = palettes.filter(p => p.stars > before && p.stars <= after);
    game.solved = true;
    game.result = { tier, prior, rewards, spark, combo:combo, newChapter: !prior && level.id % 10 === 0 && level.id < 50 && unlocked(level.id+1), full: cleared() === 50 };
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
  function showWin() {
    const { level, moves, result } = game;
    const chapter = chapters[chapterIndex(level.id+1)];
    const z = result.newChapter ? '<p class="reward">' + L('Открылась глава «','Chapter unlocked · ') + localized(chapter.name) + L('»','') + '</p>' : '';
    const rewards = result.rewards.map(p => '<p class="reward tone-' + p.color + '">' +
      L('Новая палитра «','New palette · ') + localized(p.name) + L('»','') + '</p>').join('');
    const best = result.prior && result.prior.stars > result.tier ? '<p>' + L('Лучший результат — ','Personal best: ') + result.prior.stars + ' ★</p>' : '';
    const next = level.id < 50 && unlocked(level.id+1);
    const spark = result.spark ? '<p class="reward">✦ ' + L('Искра получена','Spark earned') + '</p>' : '';
    const streak = result.combo > 1 ? '<p class="reward">' + L('КОМБО','COMBO') + ' ×' + result.combo + '</p>' : '';
    const boost = canPickBonus() && level.id < 50 ? bonusChoices() : profile.bonus ? '<p class="reward">' +
      L('Бонус готов — ','Boost ready: ') + bonusName(profile.bonus) + '</p>' : '';
    modal(result.full ? L('Все уровни пройдены!','All levels complete!') : L('Уровень пройден!','Level complete!'),
      '<div class="win-stars">' + medal(result.tier) + '</div><p>' + level.words.length + ' / ' + level.words.length +
      L(' слов · ',' words · ') + moves.length + ' ' + moveWord(moves.length) + '</p>' + best + z + rewards + streak + spark + boost,
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
    if (busy || game.solved) return;
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
    selected = move[0];
    game.layer = game.engine.xyz(move[0])[2];
    const [x,y,z] = game.engine.xyz(move[0]);
    const [a,b,c] = game.engine.xyz(move[1]);
    const direction = z !== c ? (c > z ? L('Нажми «Выше».','Tap Up.') : L('Нажми «Ниже».','Tap Down.')) :
      L('Сдвинь её ','Slide it ') + (a > x ? L('вправо','right') : a < x ? L('влево','left') : b > y ? L('вниз','down') : L('вверх','up')) + '.';
    message = L('Буква «','Letter ') + E.letter(board[move[0]]) + L('» подсвечена. ',' is highlighted. ') + direction;
    game.hints++;
    saveGame();
    renderGame();
    tell(message);
  }

  function switchLayer(layer) {
    if (busy || game.solved || game.layer === layer) return;
    game.layer = layer;
    selected = null;
    message = '';
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
      [L('Сдвигай кубики','Slide the cubes'),L('Коснись буквы рядом с пустой клеткой или смахни её туда.','Tap a letter next to a gap or swipe it into the gap.')],
      [L('Собирай слова','Make words'),L('Слова читаются слева направо или сверху вниз на одном этаже. Готовое слово освобождает клетки.','Read left to right or top to bottom on one floor. Completed words clear their cells.')],
      [L('Перемещай буквы между этажами','Move between floors'),L('Выбери букву, затем «Выше» или «Ниже». На соседнем этаже нужна пустая клетка в той же позиции.','Select a letter, then tap Up or Down. The same cell on the next floor needs to be empty.')],
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
    const rating = playing ? L('3 звезды — до ' + game.level.gold + ' ходов' + (game.level.id > 3 ? ' без подсказок' : '') +
      '. 2 звезды — до ' + game.level.silver + ' ходов.', '3 stars: up to ' + game.level.gold + ' moves' +
      (game.level.id > 3 ? ' without hints' : '') + '. 2 stars: up to ' + game.level.silver + ' moves.') : storage;
    modal(playing ? L('Пауза','Pause') : L('Настройки','Settings'),
      '<div class="setting-row"><b>' + sound + '</b><button class="switch" role="switch" aria-checked="' + profile.sound +
      '" aria-label="' + sound + '" data-action="sound"><i></i></button></div><p>' + rating + '</p>',
      buttonHTML('close',playing ? L('Продолжить','Continue') : L('Готово','Done')) +
      buttonHTML('help',L('Как играть','How to play'),'secondary') +
      (playing ? buttonHTML('restart',L('Заново','Restart'),'secondary') + buttonHTML('map',L('К уровням','Levels'),'secondary') : ''));
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
      case 'continue': openLevel(profile.active?.id ?? frontier()); break;
      case 'level': openLevel(Number(index)); break;
      case 'confirm-level': if (pendingLevel) openLevel(pendingLevel, true); pendingLevel = null; break;
      case 'next': openLevel(game.level.id+1); break;
      case 'layer': switchLayer(Number(index)); break;
      case 'transfer': if (selected !== null) playMove(selected, Number(index)); break;
      case 'undo': undo(); break;
      case 'hint': hint(); break;
      case 'restart':
        if (busy || game.solved) break;
        if (!game.moves.length && !game.hints) { updateGuide(L('Уровень уже в начальной позиции.','The board is at its starting position.')); break; }
        modal(L('Начать уровень заново?','Restart this level?'),
          '<p>' + L('Все кубики вернутся на свои места.','All cubes will return to their starting positions.') + '</p>',
          buttonHTML('confirm-restart',L('Начать заново','Restart')) + buttonHTML('close',L('Отмена','Cancel'),'secondary'));
        break;
      case 'confirm-restart': openLevel(game.level.id, true, game.level.revision || 1); break;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.action) action(button);
    else if (screen === 'game' && button.dataset.cell !== undefined && (event.detail === 0 || performance.now() > ignoreClickUntil)) chooseCell(Number(button.dataset.cell), event.detail === 0);
  });
  dialog.addEventListener('cancel', event => { if (dialog.dataset.dismissible === 'false') event.preventDefault(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && dialog.dataset.dismissible !== 'false') dialog.close();
  });
  app.addEventListener('pointerdown', event => {
    const cell = event.target.closest('[data-cell]');
    if (screen !== 'game' || busy || !cell || !event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, cell: Number(cell.dataset.cell), x: event.clientX, y: event.clientY };
  });
  app.addEventListener('pointercancel', () => { pointer = null; });
  app.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const { cell, x, y } = pointer;
    pointer = null;
    const dx = event.clientX-x, dy = event.clientY-y;
    if (Math.max(Math.abs(dx),Math.abs(dy)) < 16) return;
    ignoreClickUntil = performance.now() + 270;
    slide(cell, Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : 0);
  });

  function slide(cell, dx, dy, keyboard = false) {
    if (!game || busy || game.solved || bonusMode) return;
    const { engine, level } = game;
    const [x,y,z] = engine.xyz(cell);
    const a = x+dx, b = y+dy;
    if (a >= 0 && b >= 0 && a < level.w && b < level.h && engine.legal(currentState().board, cell, engine.index(a,b,z))) {
      playMove(cell, engine.index(a,b,z), keyboard);
    } else {
      updateGuide(L('Сдвинуть кубик можно только в соседнюю пустую клетку.','Slide a cube into an adjacent empty cell.'));
    }
  }

  app.addEventListener('keydown', event => {
    if (screen !== 'game' || !event.target.matches('[data-cell]')) return;
    const directions = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    slide(Number(event.target.dataset.cell), ...direction, true);
  });
  render();
})();
