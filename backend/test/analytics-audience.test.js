// Tests the visitor-level analytics: country detection, new-vs-returning,
// game-session filtering, and the health/bug aggregation.
process.env.TEST_PORT = process.env.TEST_PORT_AUDIENCE || '3993';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {
  BASE_URL, startServer, stopServer, connect, emitAck, waitFor, newCode, makeDeck,
} = require('./helpers');

function request(method, pathname, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(BASE_URL + pathname, {
      method,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null }); }
        catch (e) { resolve({ status: res.statusCode, json: null }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const adminGet = (p) => request('GET', p, { headers: { 'x-admin-secret': 'test-admin-pw' } });
const track = (body) => request('POST', '/api/track', { body });

before(async () => { await startServer(); });
after(async () => { await stopServer(); });

test('a pageview resolves a country from the timezone and creates a visitor profile', async () => {
  await track({ site: 'landing', path: '/', visitorId: 'v-se', timezone: 'Europe/Stockholm' });
  await track({ site: 'landing', path: '/', visitorId: 'v-us', timezone: 'America/New_York' });
  // Same visitor twice: the second hit must not count as new.
  await track({ site: 'game', path: '/', visitorId: 'v-se', timezone: 'Europe/Stockholm' });

  const { json } = await adminGet('/api/admin/visitor-stats');
  assert.equal(json.ok, true);
  assert.equal(json.overview.totalVisitors, 2);
  const countries = Object.fromEntries(json.byCountry);
  assert.equal(countries.SE, 1);
  assert.equal(countries.US, 1);

  const web = await adminGet('/api/admin/website-stats');
  assert.equal(web.json.overview.uniqueVisitors, 2);
  assert.equal(web.json.overview.newVisitors, 2, 'two first-ever visits');
  assert.equal(web.json.overview.returningVisitors, 1, 'the repeat hit from v-se');
});

test('an edge country header beats the reported timezone', async () => {
  await request('POST', '/api/track', {
    body: { site: 'landing', path: '/', visitorId: 'v-edge', timezone: 'Europe/Stockholm' },
    headers: { 'cf-ipcountry': 'DE' },
  });
  const { json } = await adminGet('/api/admin/visitor-stats');
  const countries = Object.fromEntries(json.byCountry);
  assert.equal(countries.DE, 1);
});

test('a game links back to the visitor who played it', async (t) => {
  const code = newCode();
  const host = connect({ client: 'web', vid: 'v-player' });
  t.after(() => { host.close(); });

  await track({ site: 'game', path: '/', visitorId: 'v-player', timezone: 'Europe/Oslo' });
  await emitAck(host, 'create_lobby', { name: 'Solo', code, settings: { winCondition: 10 } });
  const started = waitFor(host, 'game_started');
  host.emit('start_game', { code, realSongs: makeDeck() });
  await started;

  const sessions = await adminGet('/api/admin/game-sessions?limit=20');
  const session = sessions.json.items.find((s) => s.roomCode === code);
  assert.ok(session, 'session recorded');
  assert.deepEqual(session.playerVisitorIds, ['v-player']);
  assert.deepEqual(session.countries, ['NO']);
  assert.equal(session.status, 'in_progress');

  const visitors = await adminGet('/api/admin/visitor-stats');
  assert.equal(visitors.json.overview.players, 1, 'the visitor now counts as a player');
});

test('game sessions can be filtered by mode, platform and free text', async (t) => {
  const soloCode = newCode();
  const solo = connect({ client: 'ios' });
  t.after(() => { solo.close(); });

  await emitAck(solo, 'create_lobby', {
    name: 'SoloRunner', code: soloCode, settings: { winCondition: 10, gameMode: 'solo' },
  });
  const started = waitFor(solo, 'game_started');
  solo.emit('start_game', { code: soloCode, realSongs: makeDeck() });
  await started;

  const soloOnly = await adminGet('/api/admin/game-sessions?gameMode=solo&limit=50');
  assert.ok(soloOnly.json.total >= 1);
  assert.ok(soloOnly.json.items.every((s) => s.gameMode === 'solo'), 'only solo games returned');

  const iosOnly = await adminGet('/api/admin/game-sessions?clientMix=ios&limit=50');
  assert.ok(iosOnly.json.items.every((s) => s.clientMix === 'ios'), 'only ios games returned');

  const byName = await adminGet('/api/admin/game-sessions?search=SoloRunner&limit=50');
  assert.equal(byName.json.total, 1);
  assert.equal(byName.json.items[0].roomCode, soloCode);

  const stats = await adminGet('/api/admin/usage-stats?gameMode=solo');
  assert.equal(stats.json.overview.multiplayerGames, 0, 'filter applies to the aggregates too');
  assert.ok(stats.json.overview.soloGames >= 1);
});

test('client crashes and audio failures show up in the health view', async () => {
  await request('POST', '/api/client-error', {
    body: { errorType: 'client_js', message: 'Cannot read properties of undefined (reading 42)', path: '/' },
  });
  await request('POST', '/api/client-error', {
    body: { errorType: 'client_js', message: 'Cannot read properties of undefined (reading 99)', path: '/' },
  });
  await track({ event: 'audio_failure', target: 'NotAllowedError', site: 'game', visitorId: 'v-se' });

  const { json } = await adminGet('/api/admin/health-stats');
  assert.equal(json.ok, true);
  assert.equal(json.overview.clientCrashes, 2);
  assert.equal(json.overview.audioFailures, 1);
  assert.deepEqual(json.audioFailureReasons, [['NotAllowedError', 1]]);

  // Both crashes differ only by a number, so they group into one issue.
  const grouped = json.topIssues.find((i) => i.errorType === 'client_js');
  assert.ok(grouped, 'client crashes are grouped');
  assert.equal(grouped.count, 2);
  assert.match(grouped.message, /reading <n>/);
});

test('an iOS player is counted even though the app sends no pageview', async (t) => {
  const code = newCode();
  const app = connect({ client: 'ios', vid: 'v-ios-only' });
  t.after(() => { app.close(); });

  await emitAck(app, 'create_lobby', { name: 'AppPlayer', code, settings: { winCondition: 10 } });
  const started = waitFor(app, 'game_started');
  app.emit('start_game', { code, realSongs: makeDeck() });
  await started;

  const { json } = await adminGet('/api/admin/visitor-stats');
  const devices = Object.fromEntries(json.byDevice);
  assert.ok(devices.mobile >= 1, 'the app install shows up as a mobile visitor');
  const profile = json.topVisitors.find((v) => v.vid === 'v-ios-only');
  assert.ok(profile, 'a profile was created from the game alone');
  assert.equal(profile.games, 1);
});

test('a game is tagged with the country from the socket timezone, with no pageview', async (t) => {
  const code = newCode();
  const host = connect({ client: 'web', vid: 'v-tz-handshake', tz: 'Europe/Stockholm' });
  t.after(() => { host.close(); });

  await emitAck(host, 'create_lobby', { name: 'TzHost', code, settings: { winCondition: 10 } });
  const started = waitFor(host, 'game_started');
  host.emit('start_game', { code, realSongs: makeDeck() });
  await started;

  const { json } = await adminGet('/api/admin/game-sessions?limit=20');
  const session = json.items.find((s) => s.roomCode === code);
  assert.deepEqual(session.countries, ['SE'], 'country comes straight off the handshake');

  const byCountry = await adminGet('/api/admin/game-sessions?country=SE&limit=20');
  assert.ok(byCountry.json.items.some((s) => s.roomCode === code), 'the country filter finds it');
});

test('opting in after the socket connected still tags the game', async (t) => {
  // The real path: the socket comes up while the consent banner is still open,
  // so it carries no id. The client sends one via set_visitor once the player
  // agrees, and games started after that must be attributed.
  const code = newCode();
  const host = connect({ client: 'web' }); // no vid, no tz — consent not given yet
  t.after(() => { host.close(); });

  await emitAck(host, 'create_lobby', { name: 'LateConsent', code, settings: { winCondition: 10 } });
  host.emit('set_visitor', { vid: 'v-late-consent', tz: 'Asia/Tokyo' });
  await new Promise((r) => setTimeout(r, 150));

  const started = waitFor(host, 'game_started');
  host.emit('start_game', { code, realSongs: makeDeck() });
  await started;

  const { json } = await adminGet('/api/admin/game-sessions?limit=20');
  const session = json.items.find((s) => s.roomCode === code);
  assert.deepEqual(session.playerVisitorIds, ['v-late-consent']);
  assert.deepEqual(session.countries, ['JP']);
});

test('a player who never opts in is recorded with no id and no country', async (t) => {
  const code = newCode();
  const host = connect({ client: 'web' }); // declined: nothing is ever sent
  t.after(() => { host.close(); });

  await emitAck(host, 'create_lobby', { name: 'NoConsent', code, settings: { winCondition: 10 } });
  const started = waitFor(host, 'game_started');
  host.emit('start_game', { code, realSongs: makeDeck() });
  await started;

  const { json } = await adminGet('/api/admin/game-sessions?limit=20');
  const session = json.items.find((s) => s.roomCode === code);
  assert.deepEqual(session.playerVisitorIds, [null]);
  assert.deepEqual(session.countries, ['unknown']);
});
