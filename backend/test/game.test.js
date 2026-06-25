// Integration tests for the authoritative game logic, driven over real
// websockets against a booted backend. Covers lobby lifecycle, game start,
// turn-based placement correctness, turn enforcement, and token accounting.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const {
  startServer, stopServer, connect, emitAck, waitFor, delay, newCode, makeDeck,
} = require('./helpers');

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

// Track sockets opened by a test so we can close them deterministically.
function tracker() {
  const sockets = [];
  return {
    open() { const s = connect(); sockets.push(s); return s; },
    closeAll() { sockets.forEach((s) => { try { s.close(); } catch (e) {} }); },
  };
}

// Create a 2-player started game. Host plays last, so the guest is always the
// first active player. Returns sockets, persistent ids, and the guest's
// game_started payload (the active player's view).
async function startedGame(t) {
  const { open, closeAll } = tracker();
  t.after(closeAll);
  const code = newCode();
  const host = open();
  const guest = open();

  const hostAck = await emitAck(host, 'create_lobby', {
    name: 'Host', code, settings: { winCondition: 10, difficulty: 'normal' },
  });
  const guestAck = await emitAck(guest, 'join_lobby', { name: 'Guest', code });

  const hostStarted = waitFor(host, 'game_started');
  const guestStarted = waitFor(guest, 'game_started');
  host.emit('start_game', { code, realSongs: makeDeck() });
  const [, gs] = await Promise.all([hostStarted, guestStarted]);

  return {
    code, host, guest,
    hostPid: hostAck.player.persistentId,
    guestPid: guestAck.player.persistentId,
    guestStarted: gs,
  };
}

// For a single-card timeline with distinct years, exactly one index is correct.
function correctIndex(timeline, card) {
  return card.year < timeline[0].year ? 0 : 1;
}

test('create_lobby returns a lobby with the creator and a sessionId', async (t) => {
  const host = connect();
  t.after(() => host.close());
  const code = newCode();
  const ack = await emitAck(host, 'create_lobby', { name: 'Host', code, settings: {} });
  assert.ok(ack.lobby, 'ack has lobby');
  assert.equal(ack.lobby.players.length, 1);
  assert.equal(ack.lobby.players[0].name, 'Host');
  assert.equal(ack.lobby.players[0].isCreator, true);
  assert.ok(ack.player.persistentId, 'player has a persistent id');
});

test('join_lobby adds a second player and broadcasts lobby_update', async (t) => {
  const code = newCode();
  const host = connect();
  const guest = connect();
  t.after(() => { host.close(); guest.close(); });

  await emitAck(host, 'create_lobby', { name: 'Host', code, settings: {} });

  // create_lobby itself broadcasts a 1-player lobby_update, so wait for the
  // one that reflects the guest having joined rather than the next event.
  const updatePromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for 2-player lobby_update')), 4000);
    host.on('lobby_update', function handler(u) {
      if (u.players.length === 2) {
        clearTimeout(timer);
        host.off('lobby_update', handler);
        resolve(u);
      }
    });
  });
  const ack = await emitAck(guest, 'join_lobby', { name: 'Guest', code });
  assert.equal(ack.lobby.players.length, 2);

  const update = await updatePromise;
  assert.deepEqual(update.players.map((p) => p.name).sort(), ['Guest', 'Host']);
});

test('join_lobby with an unknown code returns an error', async (t) => {
  const c = connect();
  t.after(() => c.close());
  const ack = await emitAck(c, 'join_lobby', { name: 'Nobody', code: 'ZZZZ' });
  assert.ok(ack.error, 'expected an error for unknown lobby');
});

test('lobby rejects a 5th player', async (t) => {
  const code = newCode();
  const sockets = [];
  t.after(() => sockets.forEach((s) => s.close()));

  const host = connect(); sockets.push(host);
  await emitAck(host, 'create_lobby', { name: 'Host', code, settings: {} });
  for (let i = 0; i < 3; i++) {
    const g = connect(); sockets.push(g);
    const ack = await emitAck(g, 'join_lobby', { name: `G${i}`, code });
    assert.ok(!ack.error, `player ${i + 2} should join (got ${ack.error})`);
  }
  const fifth = connect(); sockets.push(fifth);
  const ack = await emitAck(fifth, 'join_lobby', { name: 'Fifth', code });
  assert.ok(ack.error, 'expected full-lobby error for 5th player');
});

test('start_game emits game_started in player-turn with a non-host active player', async (t) => {
  const { guestStarted, guestPid, hostPid } = await startedGame(t);
  assert.equal(guestStarted.phase, 'player-turn');
  assert.equal(guestStarted.currentPlayerId, guestPid, 'host plays last, so guest is active first');
  assert.notEqual(guestStarted.currentPlayerId, hostPid);
  assert.equal(guestStarted.timeline.length, 1, 'each timeline starts with one card');
  assert.equal(guestStarted.deck.length, 1, 'one shared current card');
  assert.ok(Number.isFinite(guestStarted.deck[0].year));
});

test('placing the current card at the correct index scores it correct', async (t) => {
  const { code, guest, guestStarted } = await startedGame(t);
  const card = guestStarted.deck[0];
  const idx = correctIndex(guestStarted.timeline, card);

  const update = waitFor(guest, 'game_update');
  guest.emit('place_card', { code, index: idx });
  const u = await update;
  assert.equal(u.phase, 'song-guess');
  assert.equal(u.lastPlaced.correct, true);
});

test('placing the current card at the wrong index scores it incorrect', async (t) => {
  const { code, guest, guestStarted } = await startedGame(t);
  const card = guestStarted.deck[0];
  const wrongIdx = 1 - correctIndex(guestStarted.timeline, card);

  const update = waitFor(guest, 'game_update');
  guest.emit('place_card', { code, index: wrongIdx });
  const u = await update;
  assert.equal(u.phase, 'song-guess');
  assert.equal(u.lastPlaced.correct, false);
});

test('a non-active player cannot place a card', async (t) => {
  const { code, host } = await startedGame(t);
  // host is NOT the active player (guest is)
  const errPromise = waitFor(host, 'place_card_error');
  host.emit('place_card', { code, index: 0 });
  const err = await errPromise;
  assert.equal(err.reason, 'not_your_turn');
});

test('use_token skip_song deducts exactly one credit', async (t) => {
  const { code, guest, guestPid } = await startedGame(t);
  const spent = waitFor(guest, 'credit_spent_for_new_song');
  guest.emit('use_token', { code, action: 'skip_song' });
  const ev = await spent;
  assert.equal(ev.spenderPersistentId, guestPid);
  assert.equal(ev.cost, 1);
  assert.equal(ev.remainingTokens, 2, 'players start with 3 tokens, so one spend leaves 2');
});

// Identity contract the frontend relies on (D3): currentPlayerId is always the
// persistent id, and a player keeps their turn across a reconnection because
// identity is keyed on persistent id, not socket id.
test('currentPlayerId is the persistent id and survives a reconnect mid-turn', async (t) => {
  const { code, guest, guestPid, guestStarted } = await startedGame(t);
  // The backend reports the active player by persistent id.
  assert.equal(guestStarted.currentPlayerId, guestPid);

  const card = guestStarted.deck[0];
  const idx = card.year < guestStarted.timeline[0].year ? 0 : 1;

  // Drop the active player's socket and reconnect a fresh one as the same
  // person (the backend allows rejoin-by-name when there's an active game).
  guest.close();
  await delay(300);
  const guest2 = connect();
  t.after(() => guest2.close());
  await emitAck(guest2, 'reconnect_session', {
    sessionId: 'sess-guest-reconnect', roomCode: code, playerName: 'Guest',
  });

  // The reconnected player should still own the turn: placing the card is
  // accepted (not rejected as not_your_turn), and the active id is unchanged.
  const update = waitFor(guest2, 'game_update');
  guest2.emit('place_card', { code, index: idx });
  const u = await update;
  assert.equal(u.phase, 'song-guess', 'placement was accepted after reconnect');
  assert.equal(u.lastPlaced.correct, true);
  assert.equal(u.currentPlayerId, guestPid, 'turn identity preserved by persistent id');
});
