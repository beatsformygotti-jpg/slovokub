(function (root) {
  'use strict';

  const isWall = value => value === '#' || value === '%';
  const isTile = value => Boolean(value && !isWall(value));
  const letter = value => value[0].toUpperCase();
  const isPinned = value => isTile(value) && value[0] === value[0].toLowerCase();
  const isSpark = value => isTile(value) && value.endsWith('+');
  const canMove = value => isTile(value) && !isPinned(value);

  function compile(level) {
    const { w, h, words } = level;
    const size = w * h;
    const xy = i => [i % w, Math.floor(i / w)];
    const index = (x, y) => y * w + x;
    const neighbors = Array.from({ length: size }, (_, i) => {
      const [x, y] = xy(i);
      return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]
        .filter(([a,b]) => a >= 0 && a < w && b >= 0 && b < h)
        .map(([a,b]) => index(a,b));
    });
    const lengths = [...new Set(words.map(word => word.length))].sort((a,b) => b-a);
    const lines = [];
    for (const length of lengths) {
      for (let i = 0; i < size; i++) {
        const [x,y] = xy(i);
        if (x + length <= w) lines.push(Array.from({ length }, (_, j) => i+j));
        if (y + length <= h) lines.push(Array.from({ length }, (_, j) => i+j*w));
      }
    }
    const goal = new Set(words);
    const portals = new Map();
    for (const [a,b] of level.portals || []) {
      portals.set(a,b);
      portals.set(b,a);
    }
    const matches = (board, found) => {
      const hits = [];
      const occupied = new Set();
      const matched = new Set(found);
      for (const ids of lines) {
        const first = board[ids[0]];
        if (!isTile(first) || occupied.has(ids[0])) continue;
        let word = letter(first);
        for (let j = 1; j < ids.length; j++) {
          const next = board[ids[j]];
          if (!isTile(next) || occupied.has(ids[j])) break;
          word += letter(next);
        }
        if (word.length !== ids.length || !goal.has(word) || matched.has(word)) continue;
        hits.push({ word, ids });
        matched.add(word);
        ids.forEach(id => occupied.add(id));
      }
      return hits;
    };
    const legal = (board, from, to) => canMove(board[from]) && board[to] === '' && neighbors[from].includes(to);
    const canSwap = (board,a,b) => canMove(board[a]) && canMove(board[b]) && neighbors[a].includes(b);
    const play = (board, found, from, to, kind) => {
      const next = board.slice();
      let landed = to;
      if (kind === 'swap' && canSwap(board,from,to)) {
        [next[from],next[to]] = [next[to],next[from]];
      } else if (kind === 'break' && isWall(board[from])) {
        next[from] = '';
        landed = from;
      } else if (kind === undefined && legal(board,from,to)) {
        next[to] = next[from];
        next[from] = '';
        const exit = portals.get(to);
        if (exit !== undefined && exit !== from && next[exit] === '') {
          next[exit] = next[to];
          next[to] = '';
          landed = exit;
        }
      } else {
        return null;
      }

      const hits = matches(next, found);
      const broken = new Set();
      let spark = false;
      for (const { ids } of hits) {
        for (const id of ids) {
          spark ||= isSpark(next[id]);
          next[id] = '';
          for (const n of neighbors[id]) {
            if (next[n] === '%') broken.add(n);
          }
        }
      }
      for (const id of broken) next[id] = '';
      return { board: next, found: found.concat(hits.map(hit => hit.word)), hits, broken: [...broken], spark, landed, port: kind === undefined && landed !== to };
    };
    const moves = function* (board) {
      for (let to = 0; to < size; to++) {
        if (board[to] !== '') continue;
        for (const from of neighbors[to]) if (canMove(board[from])) yield [from, to];
      }
    };
    return { xy, index, neighbors, portals, matches, play, legal, canSwap, moves, canMove, isTile };
  }

  const key = (board, found) => board.join(',') + '|' + [...found].sort().join(',');

  function search(engine, board, found, { maxDepth = 5, maxStates = 8000, clearAll = 0 } = {}) {
    const visited = new Set([key(board, found)]);
    const queue = [{ board, found, path: [] }];
    for (let cursor = 0; cursor < queue.length && cursor < maxStates; cursor++) {
      const state = queue[cursor];
      if (state.path.length >= maxDepth) continue;
      for (const move of engine.moves(state.board)) {
        const next = engine.play(state.board, state.found, ...move);
        if (clearAll ? next.found.length === clearAll : next.hits.length > 0) return state.path.concat([move]);
        const signature = key(next.board, next.found);
        if (visited.has(signature) || queue.length >= maxStates) continue;
        visited.add(signature);
        queue.push({ ...next, path: state.path.concat([move]) });
      }
    }
    return null;
  }

  function trace(level, engine = compile(level)) {
    const hints = new Map();
    let state = { board: level.board, found: [] };
    for (const move of level.solution) {
      hints.set(key(state.board, state.found), move);
      state = engine.play(state.board, state.found, ...move);
      if (!state) throw new Error('Invalid solution on level ' + level.id);
    }
    return { state, hints };
  }

  function movesBudget(level) {
    const reference = level.solution.length;
    const chapter = Math.floor((level.id-1)/10);
    const reserve = Math.max(3,Math.ceil(reference * [.8,.55,.43,.34,.28][chapter]));
    return { reference, limit: reference + reserve };
  }

  function rateMoves(moves,budget) {
    const { reference,limit } = budget;
    const percent = Math.round(100 * Math.max(0,Math.min(1,(limit-moves)/(limit-reference))));
    return { percent, tier: percent >= 85 ? 3 : percent >= 50 ? 2 : 1 };
  }

  const api = { compile, key, search, trace, letter, isPinned, isSpark, isWall, movesBudget, rateMoves };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CubeEngine = api;
})(globalThis);
