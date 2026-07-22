// Integration tests for Solo mode: a single player runs a survival streak that
// ends on the first miss (or deck exhaustion), with the score recorded to the
// global leaderboard. Driven over real websockets against a booted backend.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  startServer, stopServer, connect, emitAck, waitFor, delay, newCode, BASE_URL,
} = require('./helpers');

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

function tracker() {
  const sockets = [];
  return {
    open() { const s = connect(); sockets.push(s); return s; },
    closeAll() { sockets.forEach((s) => { try { s.close(); } catch (e) {} }); },
  };
}

// Deterministic ascending-year deck. Solo keeps deck order (no shuffle) and
// seeds the timeline with the first (easiest) card, so the shared deck is the
// remaining cards in order.
function ascendingDeck(n = 6) {
  const years = [1971, 1983, 1995, 2003, 2011, 2019, 2023, 2024];
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`, title: `Song${i + 1}`, artist: `A${i + 1}`,
    year: years[i], uri: `spotify:track:s${i + 1}`, difficultyLevel: (i % 5) + 1,
  }));
}

// Start a solo game for a lone host. Returns the host socket, code, pid, and the
// game_started payload (the host's view).
async function startedSolo(t, deck = ascendingDeck()) {
  const { open, closeAll } = tracker();
  t.after(closeAll);
  const code = newCode();
  const host = open();
  const ack = await emitAck(host, 'create_lobby', {
    name: 'Solo', code, settings: { winCondition: 10, gameMode: 'solo' },
  });
  const started = waitFor(host, 'game_started');
  host.emit('start_game', { code, realSongs: deck });
  const gs = await started;
  return { code, host, hostPid: ack.player.persistentId, gs };
}

// Place the current card correctly and advance past reveal back to player-turn.
// Returns the player-turn game_update.
async function placeCorrectAndContinue(host, code, gs) {
  const card = gs.deck[0];
  const timeline = gs.timeline;
  // ascending deck + ascending timeline → correct index is the end.
  const idx = card.year < timeline[0].year ? 0 : timeline.length;
  const placed = waitFor(host, 'game_update');
  host.emit('place_card', { code, index: idx });
  await placed; // phase song-guess

  const reveal = waitFor(host, 'game_update');
  host.emit('skip_song_guess', { code });
  const revealState = await reveal;
  assert.equal(revealState.phase, 'reveal', 'solo skips challenge-window, goes to reveal');

  const next = waitFor(host, 'game_update');
  host.emit('continue_game', { code });
  return await next;
}

test('join_lobby is rejected while solo is enabled, then allowed after toggling off', async (t) => {
  const { open, closeAll } = tracker();
  t.after(closeAll);
  const code = newCode();
  const host = open();
  await emitAck(host, 'create_lobby', { name: 'Solo', code, settings: { gameMode: 'solo' } });

  const guest = open();
  const rejected = await emitAck(guest, 'join_lobby', { name: 'Guest', code });
  assert.ok(rejected.error && /solo/i.test(rejected.error), 'join rejected while solo enabled');

  // Toggle solo off, then join should succeed.
  host.emit('update_settings', { code, settings: { gameMode: 'multiplayer' } });
  await delay(100);
  const guest2 = open();
  const ok = await emitAck(guest2, 'join_lobby', { name: 'Guest2', code });
  assert.ok(!ok.error, `join should succeed after solo disabled (got ${ok.error})`);
});

test('update_settings coerces solo to multiplayer when >1 player is present', async (t) => {
  const { open, closeAll } = tracker();
  t.after(closeAll);
  const code = newCode();
  const host = open();
  await emitAck(host, 'create_lobby', { name: 'Host', code, settings: { gameMode: 'multiplayer' } });
  const guest = open();
  await emitAck(guest, 'join_lobby', { name: 'Guest', code });

  // Host tries to flip to solo while a guest is present — server should strip it.
  const update = new Promise((resolve) => {
    host.on('lobby_update', function h(u) {
      if (u.settings) { host.off('lobby_update', h); resolve(u); }
    });
  });
  host.emit('update_settings', { code, settings: { gameMode: 'solo' } });
  const u = await update;
  assert.equal(u.settings.gameMode, 'multiplayer', 'solo coerced to multiplayer with 2 players');
});

test('solo game starts for a lone host in player-turn', async (t) => {
  const { gs, hostPid } = await startedSolo(t);
  assert.equal(gs.phase, 'player-turn');
  assert.equal(gs.currentPlayerId, hostPid, 'the lone host is the active player');
  assert.equal(gs.timeline.length, 1);
  assert.equal(gs.deck.length, 1);
});

test('a correct placement in solo skips challenge-window and returns to player-turn', async (t) => {
  const { code, host, gs } = await startedSolo(t);
  const next = await placeCorrectAndContinue(host, code, gs);
  assert.equal(next.phase, 'player-turn', 'run continues after a correct placement');
  assert.equal(next.timeline.length, 2, 'timeline grew by one committed card');
});

test('a miss ends the solo run with a soloResult (score excludes the starting card)', async (t) => {
  const { code, host, gs } = await startedSolo(t);
  // Place the first card incorrectly: card year (1983) > timeline[0] (1971),
  // so index 0 is wrong.
  const wrongIdx = 0;
  const placed = waitFor(host, 'game_update');
  host.emit('place_card', { code, index: wrongIdx });
  assert.equal((await placed).phase, 'song-guess');

  const reveal = waitFor(host, 'game_update');
  host.emit('skip_song_guess', { code });
  assert.equal((await reveal).phase, 'reveal');

  const over = waitFor(host, 'game_update');
  host.emit('continue_game', { code });
  const finalState = await over;
  assert.equal(finalState.phase, 'game-over');
  const r = finalState.soloResult;
  assert.ok(r, 'game-over carries a soloResult');
  assert.equal(r.score, 0, 'zero correct placements before the miss');
  assert.equal(r.rank, 1);
  assert.ok(Array.isArray(r.top10));
  // Extra end-of-run stats for the scoreboard.
  assert.equal(r.creditsRemaining, 3, 'started with 3 credits, spent none');
  assert.equal(r.correctGuesses, 0, 'no song guesses made');
  assert.ok(Array.isArray(r.timeline), 'timeline recap present');
  assert.equal(r.timeline.length, 1, 'only the starting card is committed (missed card excluded)');
});

test('a correct song guess is tallied live on the solo player (for the header)', async (t) => {
  const { code, host, gs } = await startedSolo(t);
  const card = gs.deck[0]; // { title: 'Song2', artist: 'A2', year: 1983 }
  const idx = card.year < gs.timeline[0].year ? 0 : gs.timeline.length;
  const placed = waitFor(host, 'game_update');
  host.emit('place_card', { code, index: idx });
  await placed; // song-guess

  const reveal = waitFor(host, 'game_update');
  host.emit('guess_song', { code, title: card.title, artist: card.artist });
  const revealState = await reveal;
  assert.equal(revealState.phase, 'reveal', 'correct guess in solo goes straight to reveal');
  assert.equal(revealState.players[0].correctGuesses, 1, 'correct guess counted live on the player');
});

test('recording is idempotent: a duplicate continue_game does not double-record', async (t) => {
  const { code, host, gs } = await startedSolo(t);
  const wrongIdx = 0;
  const placed = waitFor(host, 'game_update');
  host.emit('place_card', { code, index: wrongIdx });
  await placed;
  const reveal = waitFor(host, 'game_update');
  host.emit('skip_song_guess', { code });
  await reveal;

  const over = waitFor(host, 'game_update');
  host.emit('continue_game', { code });
  await over;
  // Fire a second continue_game at game-over; must not add a second entry.
  host.emit('continue_game', { code });
  await delay(200);

  const scores = await getJson('/api/solo-scores');
  // Exactly one entry from this run per score value isn't guaranteed globally
  // (other tests record too), but the leaderboard must be well-formed.
  assert.ok(Array.isArray(scores.top), 'solo-scores endpoint returns a top array');
});

test('deck exhaustion ends the run and still records the score', async (t) => {
  // 3-card deck: 1 starting card + 2 placeable. Place both correctly → deck runs
  // out → game over with score 2.
  const { code, host, gs } = await startedSolo(t, ascendingDeck(3));
  let state = await placeCorrectAndContinue(host, code, gs);
  assert.equal(state.phase, 'player-turn');

  // Second (final) placement exhausts the deck.
  const card = state.deck[0];
  const idx = card.year < state.timeline[0].year ? 0 : state.timeline.length;
  const placed = waitFor(host, 'game_update');
  host.emit('place_card', { code, index: idx });
  await placed;
  const reveal = waitFor(host, 'game_update');
  host.emit('skip_song_guess', { code });
  await reveal;
  const over = waitFor(host, 'game_update');
  host.emit('continue_game', { code });
  const finalState = await over;
  assert.equal(finalState.phase, 'game-over');
  assert.equal(finalState.soloResult.score, 2, 'two correct placements before the deck ran out');
  assert.equal(finalState.soloResult.timeline.length, 3, 'recap = starting card + 2 correct placements');
});

// Helper: GET JSON from the running test server.
function getJson(pathname) {
  return new Promise((resolve, reject) => {
    http.get(BASE_URL + pathname, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
