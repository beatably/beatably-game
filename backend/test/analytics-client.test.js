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

function httpPostJson(pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(BASE_URL + pathname, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.end(payload);
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

test('session attributes a game start to the host campaign', async (t) => {
  const code = newCode();
  const host = connect({
    client: 'web',
    utmSource: 'producthunt',
    utmMedium: 'launch',
    utmCampaign: 'organic_launch_2026',
    utmContent: 'maker_launch_v1',
  });
  t.after(() => { host.close(); });

  await emitAck(host, 'create_lobby', { name: 'CampaignHost', code, settings: { winCondition: 10 } });

  const started = waitFor(host, 'game_started');
  host.emit('start_game', { code, realSongs: makeDeck() });
  await started;

  const { json } = await adminGet('/api/admin/game-sessions?limit=10');
  const session = (json.items || []).find((s) => s.roomCode === code);
  assert.ok(session, 'session was recorded for the room');
  assert.deepEqual(session.campaign, {
    source: 'producthunt',
    medium: 'launch',
    campaign: 'organic_launch_2026',
    content: 'maker_launch_v1',
  });

  const stats = await adminGet('/api/admin/usage-stats');
  assert.equal(stats.json.distributions?.campaignSource?.producthunt, 1);
});

test('website stats separate pageviews from campaign CTA clicks', async () => {
  const campaign = {
    utmSource: 'instagram',
    utmMedium: 'social_video',
    utmCampaign: 'organic_launch_2026',
    utmContent: 'guess_the_year_v1',
  };

  assert.equal((await httpPostJson('/api/track', {
    site: 'landing', path: '/', visitorId: 'visitor-cta-test', ...campaign,
  })).status, 204);
  assert.equal((await httpPostJson('/api/track', {
    event: 'cta_click', target: 'app_store_hero', site: 'landing', path: '/',
    visitorId: 'visitor-cta-test', ...campaign,
  })).status, 204);
  assert.equal((await httpPostJson('/api/track', {
    event: 'cta_click', target: 'play_browser_hero', site: 'landing', path: '/',
    visitorId: 'visitor-cta-test', ...campaign,
  })).status, 204);

  const stats = await adminGet('/api/admin/website-stats');
  assert.equal(stats.status, 200);
  assert.equal(stats.json.overview.totalViews, 1, 'CTA events do not inflate pageviews');
  assert.equal(stats.json.overview.uniqueVisitors, 1);
  assert.equal(stats.json.overview.appStoreClicks, 1);
  assert.equal(stats.json.overview.browserPlayClicks, 1);
  assert.deepEqual(stats.json.ctaSources, [['instagram', 2]]);
  assert.deepEqual(stats.json.ctaBreakdown, [
    ['instagram → app_store_hero', 1],
    ['instagram → play_browser_hero', 1],
  ]);
});
