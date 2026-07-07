// Tests for stale-room expiry, zombie-code eviction in create_lobby, state
// persistence, and the health endpoints. Boots the backend with a pre-seeded
// state.json (simulating rooms that survived a restart) and fast sweep TTLs.
process.env.TEST_PORT = process.env.TEST_PORT_HEALTH || '3996';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const {
  BASE_URL, startServer, stopServer, connect, emitAck, delay, getTmpDir,
} = require('./helpers');

const ZOMBIE_LOBBY_CODE = '4242';
const ZOMBIE_GAME_CODE = '4243';
const SWEEP_LOBBY_CODE = '4244';

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

before(async () => {
  await startServer({
    seedState: {
      savedAt: new Date().toISOString(),
      lobbies: {
        [ZOMBIE_LOBBY_CODE]: {
          players: [{ id: 'dead-socket', name: 'Ghost', isCreator: true, isReady: true }],
          settings: { difficulty: 'normal' },
          status: 'waiting',
        },
        [SWEEP_LOBBY_CODE]: {
          players: [{ id: 'dead-socket-2', name: 'Ghost2', isCreator: true, isReady: true }],
          settings: { difficulty: 'normal' },
          status: 'waiting',
        },
      },
      games: {
        [ZOMBIE_GAME_CODE]: {
          phase: 'player-turn',
          players: [{ id: 'dead-socket-3', name: 'Ghost3' }],
          sharedDeck: [],
          timelines: {},
        },
      },
      playerSessions: {},
    },
    env: {
      // Fast expiry so the sweeper is observable in-test. The zombie-eviction
      // tests run first, before these TTLs have elapsed.
      LOBBY_TTL_MS: '5000',
      GAME_TTL_MS: '5000',
      ROOM_SWEEP_INTERVAL_MS: '500',
    },
  });
});
after(async () => { await stopServer(); });

test('create_lobby evicts a zombie lobby squatting on the code', async (t) => {
  const host = connect();
  t.after(() => host.close());
  const ack = await emitAck(host, 'create_lobby', {
    name: 'Fresh', code: ZOMBIE_LOBBY_CODE, settings: {},
  });
  assert.strictEqual(ack.error, undefined, 'no error for zombie code');
  assert.ok(ack.lobby, 'lobby created over evicted zombie');
  assert.strictEqual(ack.lobby.players[0].name, 'Fresh');
});

test('create_lobby evicts a zombie mid-game room with no reconnectable session', async (t) => {
  const host = connect();
  t.after(() => host.close());
  const ack = await emitAck(host, 'create_lobby', {
    name: 'Fresh2', code: ZOMBIE_GAME_CODE, settings: {},
  });
  assert.strictEqual(ack.error, undefined, 'no error for zombie game code');
  assert.ok(ack.lobby, 'lobby created over evicted zombie game');
});

test('create_lobby still rejects a code held by a live lobby', async (t) => {
  const host = connect();
  const rival = connect();
  t.after(() => { host.close(); rival.close(); });
  const code = '4250';
  const first = await emitAck(host, 'create_lobby', { name: 'Host', code, settings: {} });
  assert.ok(first.lobby, 'first create succeeds');
  const second = await emitAck(rival, 'create_lobby', { name: 'Rival', code, settings: {} });
  assert.strictEqual(second.error, 'Lobby already exists');
});

test('sweeper removes stale lobbies but keeps connected ones', async (t) => {
  const host = connect();
  t.after(() => host.close());
  const liveCode = '4251';
  const liveAck = await emitAck(host, 'create_lobby', { name: 'Alive', code: liveCode, settings: {} });
  assert.ok(liveAck.lobby);

  // Wait past LOBBY_TTL_MS + sweep interval: the seeded (never-connected)
  // lobby must be gone, the connected one must survive.
  await delay(7000);

  const probe = connect();
  t.after(() => probe.close());
  const sweptJoin = await emitAck(probe, 'join_lobby', { name: 'Probe', code: SWEEP_LOBBY_CODE });
  assert.strictEqual(sweptJoin.error, 'No lobby found or game already started', 'stale lobby was swept');

  const liveJoin = await emitAck(probe, 'join_lobby', { name: 'Probe', code: liveCode });
  assert.ok(liveJoin.lobby, 'connected lobby survived the sweep');
});

test('state.json is persisted and contains created lobbies', async (t) => {
  const host = connect();
  t.after(() => host.close());
  const code = '4252';
  await emitAck(host, 'create_lobby', { name: 'Saver', code, settings: {} });
  await delay(600); // debounced persist is 250ms
  const raw = fs.readFileSync(path.join(getTmpDir(), 'state.json'), 'utf8');
  const state = JSON.parse(raw);
  assert.ok(state.lobbies[code], 'created lobby present in persisted state');
  assert.strictEqual(state.lobbies[code].players[0].name, 'Saver');
});

test('GET /healthz responds ok without auth', async () => {
  const { status, json } = await httpGetJson('/healthz');
  assert.strictEqual(status, 200);
  assert.strictEqual(json.ok, true);
  assert.ok(typeof json.uptime === 'number');
});

test('GET /api/admin/server-health requires auth and reports live counts', async () => {
  const unauthorized = await httpGetJson('/api/admin/server-health');
  assert.strictEqual(unauthorized.status, 401);

  const { status, json } = await httpGetJson('/api/admin/server-health', {
    'x-admin-secret': 'test-admin-pw',
  });
  assert.strictEqual(status, 200);
  assert.strictEqual(json.ok, true);
  assert.ok(typeof json.uptimeSeconds === 'number');
  assert.ok(json.memory && typeof json.memory.rss === 'number');
  assert.ok(json.lobbies && typeof json.lobbies.total === 'number');
  assert.ok(json.games && typeof json.games.total === 'number');
  assert.ok(typeof json.connectedSockets === 'number');
});
