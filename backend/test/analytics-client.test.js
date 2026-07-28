// Tests that each game session records which client every participating player
// used (ios vs web), taken from the socket handshake.
process.env.TEST_PORT = process.env.TEST_PORT_ANALYTICS || '3995';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  BASE_URL, startServer, stopServer, connect, emitAck, waitFor, newCode, makeDeck,
} = require('./helpers');

function httpGetJson(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(BASE_URL + pathname, { headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, json: null }); }
      });
    });
    req.on('error', reject);
  });
}

function adminGet(pathname) {
  return httpGetJson(pathname, { 'x-admin-secret': 'test-admin-pw' });
}

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

test('session records per-player client and a mixed client mix', async (t) => {
  const code = newCode();
  const host = connect({ client: 'ios' });
  const guest = connect({ client: 'web' });
  t.after(() => { host.close(); guest.close(); });

  await emitAck(host, 'create_lobby', { name: 'IosHost', code, settings: { winCondition: 10 } });
  await emitAck(guest, 'join_lobby', { name: 'WebGuest', code });

  const started = waitFor(host, 'game_started');
  host.emit('start_game', { code, realSongs: makeDeck() });
  await started;

  const { json } = await adminGet('/api/admin/game-sessions?limit=10');
  const session = (json.items || []).find((s) => s.roomCode === code);
  assert.ok(session, 'session was recorded for the room');
  assert.deepEqual(session.playerNames, ['IosHost', 'WebGuest']);
  assert.deepEqual(session.playerClients, ['ios', 'web']);
  assert.equal(session.clientMix, 'mixed');
  assert.equal(session.gameMode, 'multiplayer');
});

test('single-client game reports that client as the mix, and stats aggregate it', async (t) => {
  const code = newCode();
  const host = connect({ client: 'web' });
  const guest = connect({ client: 'web' });
  t.after(() => { host.close(); guest.close(); });

  await emitAck(host, 'create_lobby', { name: 'WebHost', code, settings: { winCondition: 10 } });
  await emitAck(guest, 'join_lobby', { name: 'WebGuest2', code });

  const started = waitFor(host, 'game_started');
  host.emit('start_game', { code, realSongs: makeDeck() });
  await started;

  const { json } = await adminGet('/api/admin/game-sessions?limit=10');
  const session = (json.items || []).find((s) => s.roomCode === code);
  assert.ok(session, 'session was recorded for the room');
  assert.deepEqual(session.playerClients, ['web', 'web']);
  assert.equal(session.clientMix, 'web');

  const stats = await adminGet('/api/admin/usage-stats');
  const dist = stats.json.distributions || {};
  assert.equal(dist.clientMix.web, 1, 'one web-only game');
  assert.equal(dist.clientMix.mixed, 1, 'one mixed game (previous test)');
  assert.equal(dist.playerClient.web, 3, 'three web players across both games');
  assert.equal(dist.playerClient.ios, 1, 'one ios player');
});
