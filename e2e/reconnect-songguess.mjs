// E2E: reconnect during song-guess.
//
// Two persistent browser contexts = two independent players (A=creator,
// B=joiner). Because the host plays last, B is the active player first — the
// exact scenario from the live bug. We drive game *progression* via the
// dev-only window.__beatably.socket hook (deterministic) but do create / join /
// start / rejoin through the real UI (those set React state), and verify with
// real rendered UI + screenshots.
//
// Requires a local backend (127.0.0.1:3001) and frontend (127.0.0.1:5173).
// run.sh starts both; or start them yourself and run `node reconnect-songguess.mjs`.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const HEADLESS = process.env.E2E_HEADED !== '1';
const LOGS = path.join(__dirname, 'logs');
const SHOTS = path.join(__dirname, 'screenshots');
const PROFILES = path.join(__dirname, '.profiles');

for (const d of [LOGS, SHOTS]) fs.mkdirSync(d, { recursive: true });
fs.rmSync(PROFILES, { recursive: true, force: true });

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
function log(msg) { console.log(`· ${msg}`); }

function pageLogger(page, label) {
  const f = path.join(LOGS, `${label}.log`);
  fs.writeFileSync(f, '');
  page.on('console', (m) => fs.appendFileSync(f, `${m.type()}: ${m.text()}\n`));
  page.on('pageerror', (e) => fs.appendFileSync(f, `PAGEERROR: ${e.message}\n`));
}

async function openPlayer(name) {
  const ctx = await chromium.launchPersistentContext(path.join(PROFILES, name), {
    headless: HEADLESS,
    viewport: { width: 430, height: 900 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page };
}

async function main() {
  // --- Player A creates a game ---
  const A = await openPlayer('A');
  pageLogger(A.page, 'playerA');
  await A.page.goto(BASE);
  await A.page.getByPlaceholder('Enter your name...').fill('Alice');
  await A.page.getByRole('button', { name: 'Create new game' }).click();
  await A.page.waitForFunction(() => window.__beatably && window.__beatably.roomCode, null, { timeout: 20000 });
  const code = await A.page.evaluate(() => window.__beatably.roomCode);
  check('A created a lobby', !!code, `room ${code}`);

  // --- Player B joins ---
  const B = await openPlayer('B');
  pageLogger(B.page, 'playerB');
  await B.page.goto(BASE);
  await B.page.getByPlaceholder('Enter your name...').fill('Bob');
  await B.page.getByRole('button', { name: 'Join game with code' }).click();
  for (let i = 0; i < code.length; i++) {
    await B.page.locator(`#code-${i}`).fill(code[i]);
  }
  await B.page.getByRole('button', { name: 'Join Game' }).click();
  await A.page.waitForFunction(() => (window.__beatably?.socket) && true, null, { timeout: 10000 });
  log('B joined');

  // --- A starts the game ---
  await A.page.getByRole('button', { name: 'Start Game' }).click();
  // phase defaults to 'player-turn', so wait for the game to actually start:
  // view flips to 'game' and game_started populates the timeline.
  await B.page.waitForFunction(
    () => window.__beatably?.view === 'game' && window.__beatably?.phase === 'player-turn'
      && (window.__beatably?.timeline?.length > 0),
    null, { timeout: 30000 },
  );

  // --- B places a card (via the dev socket hook) -> song-guess ---
  // This only succeeds if B is the active player (host plays last), so the
  // transition to song-guess doubles as proof that B owns the turn.
  await B.page.evaluate((c) => window.__beatably.socket.emit('place_card', { code: c, index: 0 }), code);
  await B.page.waitForFunction(() => window.__beatably?.phase === 'song-guess', null, { timeout: 10000 });
  check('B (active player) placed a card -> song-guess', true);
  const beforeUI = await B.page.getByText('Do you want to guess the song').isVisible().catch(() => false);
  check('song-guess UI visible BEFORE reconnect', beforeUI);
  await B.page.screenshot({ path: path.join(SHOTS, '1-B-songguess-before.png'), fullPage: true });

  // --- Simulate "kill Safari and restart": close B's page, reopen in the same
  //     persistent context (localStorage survives) -> session restore prompt ---
  await B.page.close();
  await new Promise((r) => setTimeout(r, 600));
  const bPage2 = await B.ctx.newPage();
  pageLogger(bPage2, 'playerB-after-reconnect');
  await bPage2.goto(BASE);
  await bPage2.screenshot({ path: path.join(SHOTS, '2-B-restore-prompt.png'), fullPage: true });
  const rejoin = bPage2.getByRole('button', { name: 'Rejoin Game' });
  const promptShown = await rejoin.isVisible({ timeout: 15000 }).catch(() => false);
  check('session-restore prompt shown after restart', promptShown);
  if (promptShown) await rejoin.click();

  await bPage2.waitForFunction(() => window.__beatably?.phase === 'song-guess', null, { timeout: 20000 }).catch(() => {});

  // --- Verify the bug is fixed ---
  const state = await bPage2.evaluate(() => ({
    phase: window.__beatably?.phase,
    currentPlayerId: window.__beatably?.currentPlayerId,
    hasPreviewCard: (window.__beatably?.timeline || []).some((c) => c && c.preview),
    lastPlaced: window.lastGameUpdate?.lastPlaced || null,
  }));
  log(`B state after reconnect: ${JSON.stringify(state)}`);

  const afterUI = await bPage2.getByText('Do you want to guess the song').isVisible().catch(() => false);
  check('SYMPTOM 2 — song-guess UI (Skip) renders after reconnect', afterUI);
  check('SYMPTOM 1 — tentative placement present in timeline after reconnect', state.hasPreviewCard,
    `lastPlaced=${JSON.stringify(state.lastPlaced)}`);
  await bPage2.screenshot({ path: path.join(SHOTS, '3-B-songguess-after-reconnect.png'), fullPage: true });

  // --- Confirm Skip actually works end-to-end ---
  const skip = bPage2.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    const advanced = await bPage2.waitForFunction(
      () => window.__beatably?.phase === 'challenge-window',
      null, { timeout: 8000 },
    ).then(() => true).catch(() => false);
    check('Skip advances phase to challenge-window', advanced);
    await bPage2.screenshot({ path: path.join(SHOTS, '4-B-after-skip.png'), fullPage: true });
  } else {
    check('Skip advances phase to challenge-window', false, 'skip button not found');
  }

  await A.ctx.close();
  await B.ctx.close();
}

main()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((e) => {
    console.error('Harness error:', e);
    process.exit(2);
  });
