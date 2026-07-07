// Shared test harness: boots the real backend as a child process against an
// isolated cache dir + test port, and exposes thin socket.io-client helpers.
// Tests drive the actual authoritative game logic over real websockets.
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const { io } = require('socket.io-client');

const PORT = Number(process.env.TEST_PORT || 3997);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let serverProc = null;
let tmpDir = null;

function httpOk() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL + '/', (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
  });
}

async function startServer({ seedState, env } = {}) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatably-test-'));
  if (seedState) {
    // Pre-populate state.json so the server boots with restored rooms,
    // simulating zombies that survived a restart.
    fs.writeFileSync(path.join(tmpDir, 'state.json'), JSON.stringify(seedState));
  }
  serverProc = spawn(process.execPath, ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      BEATABLY_CACHE_DIR: tmpDir,
      ADMIN_PASSWORD: 'test-admin-pw',
      ...(env || {}),
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await httpOk()) return;
    await delay(200);
  }
  throw new Error('Test server did not become ready in time');
}

async function stopServer() {
  if (serverProc) {
    serverProc.kill('SIGKILL');
    serverProc = null;
  }
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    tmpDir = null;
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connect() {
  return io(BASE_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

// Emit an event whose handler invokes an ack callback; resolve with the ack.
function emitAck(socket, event, payload, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), timeout);
    socket.emit(event, payload, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

// Resolve with the next payload for `event`.
function waitFor(socket, event, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

// Generate a short unique-ish room code per test to avoid collisions.
let codeCounter = 0;
function newCode() {
  codeCounter += 1;
  return `T${String(codeCounter).padStart(3, '0')}`;
}

// A deterministic deck with distinct years so exactly one placement index is
// correct for any single-card timeline.
function makeDeck() {
  return [
    { id: 'd1', title: 'Song1', artist: 'A1', year: 1971, uri: 'spotify:track:d1' },
    { id: 'd2', title: 'Song2', artist: 'A2', year: 1983, uri: 'spotify:track:d2' },
    { id: 'd3', title: 'Song3', artist: 'A3', year: 1995, uri: 'spotify:track:d3' },
    { id: 'd4', title: 'Song4', artist: 'A4', year: 2003, uri: 'spotify:track:d4' },
    { id: 'd5', title: 'Song5', artist: 'A5', year: 2011, uri: 'spotify:track:d5' },
    { id: 'd6', title: 'Song6', artist: 'A6', year: 2019, uri: 'spotify:track:d6' },
  ];
}

function getTmpDir() {
  return tmpDir;
}

module.exports = {
  BASE_URL,
  startServer,
  stopServer,
  connect,
  emitAck,
  waitFor,
  delay,
  newCode,
  makeDeck,
  getTmpDir,
};
