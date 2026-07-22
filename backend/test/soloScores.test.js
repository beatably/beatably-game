// Unit tests for the solo high-score board module. Isolates state via
// BEATABLY_CACHE_DIR (set before requiring the module) so nothing touches the
// dev cache.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let tmpDir;
let soloScores;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beatably-solo-'));
  process.env.BEATABLY_CACHE_DIR = tmpDir;
  soloScores = require('../soloScores');
  soloScores.clear();
});

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
});

test('records scores sorted highest-first', (t) => {
  soloScores.clear();
  soloScores.recordScore({ name: 'A', score: 5 });
  soloScores.recordScore({ name: 'B', score: 12 });
  const last = soloScores.recordScore({ name: 'C', score: 8 });
  assert.deepEqual(last.top10.map((e) => e.score), [12, 8, 5]);
  assert.equal(last.rank, 2, 'C with 8 ranks 2nd (behind 12)');
});

test('ties break by earlier date (first to reach a score outranks later ties)', async (t) => {
  soloScores.clear();
  soloScores.recordScore({ name: 'First', score: 10 });
  await new Promise((r) => setTimeout(r, 5)); // ensure a later ISO timestamp
  const second = soloScores.recordScore({ name: 'Second', score: 10 });
  assert.equal(second.top10[0].name, 'First');
  assert.equal(second.rank, 2, 'the later 10 ranks below the earlier 10');
});

test('trims to 100 entries but still ranks a score that falls off', (t) => {
  soloScores.clear();
  // 100 high scores, then one low score that should not make the board.
  for (let i = 0; i < 100; i++) soloScores.recordScore({ name: `H${i}`, score: 1000 + i });
  const low = soloScores.recordScore({ name: 'Low', score: 1 });
  assert.equal(soloScores.getAll().length, 100, 'trimmed to MAX_SCORES');
  assert.equal(low.rank, 101, 'the off-board score still gets a rank');
  assert.equal(low.top10.length, 10);
  assert.ok(soloScores.getAll().every((e) => e.name !== 'Low'), 'Low is not stored');
});

test('top10 entries only expose name/score/date', (t) => {
  soloScores.clear();
  const { top10 } = soloScores.recordScore({ name: 'X', score: 3, roomCode: 'SECRET' });
  assert.deepEqual(Object.keys(top10[0]).sort(), ['date', 'name', 'score']);
});

test('scores round-trip to disk', (t) => {
  soloScores.clear();
  soloScores.recordScore({ name: 'Persisted', score: 42 });
  const file = path.join(tmpDir, 'solo-highscores.json');
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(onDisk));
  assert.equal(onDisk[0].name, 'Persisted');
  assert.equal(onDisk[0].score, 42);
});
