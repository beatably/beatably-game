// Records a scripted 9:16 promo playthrough of the real app for marketing use.
//
// Drives two real browser players against the local stack and records the
// host's page with Playwright's video capture. Every beat is timestamped into
// promo/markers.json so promo/edit.sh can cut to exact frames instead of
// hand-scrubbing. Placements are made through the real UI (taps on gap
// circles) so the spring placement animation and reveal states are genuine;
// only the *choice* of gap is scripted, read from the server's own state file.
//
//   e2e/dev-stack.sh            # in another shell
//   node e2e/promo-video.mjs
//
// Output: e2e/promo/raw/host.webm + e2e/promo/markers.json + step screenshots.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const PROMO = path.join(__dirname, 'promo');
const RAW = path.join(PROMO, 'raw');
const SHOTS = path.join(PROMO, 'shots');
const CACHE = path.join(__dirname, '.cache');

// 432x768 is exactly 9:16 and stays under Tailwind's `sm` breakpoint, so the app
// renders its real phone layout. Playwright's screencast captures CSS pixels and
// only ever scales a page *down* into recordVideo.size, so the context's
// deviceScaleFactor alone would letterbox 432x768 into the corner of a 1080x1920
// canvas. Chromium's --force-device-scale-factor raises the actual device pixels
// instead, which is what makes the capture natively 1080x1920.
const VIEWPORT = { width: 432, height: 768 };
const SCALE = 2.5;
const VIDEO = { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE };

const WIN_CONDITION = 5; // shorter than the UI's minimum of 8, so a full game fits the cut

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let t0 = 0;
const marks = [];
function mark(label) {
  const t = (Date.now() - t0) / 1000;
  marks.push({ label, t: +t.toFixed(2) });
  console.log(`  [mark] ${t.toFixed(2)}s  ${label}`);
}

let shotN = 0;
async function shot(page, label) {
  const name = `${String(++shotN).padStart(2, '0')}-${label}`;
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
}

// --- server truth -----------------------------------------------------------
// The client deliberately never learns the mystery card's year, so the demo
// reads the backend's persisted state to decide which gap to tap.
function serverState() {
  for (let i = 0; i < 20; i++) {
    try {
      return JSON.parse(fs.readFileSync(path.join(CACHE, 'state.json'), 'utf8'));
    } catch { /* mid-write, retry */ }
  }
  return null;
}

function serverGame(code) {
  const st = serverState();
  return (st && st.games && st.games[code]) || null;
}

const correctIndex = (timeline, year) => timeline.filter((c) => c.year <= year).length;
const wrongIndex = (timeline, year) => (correctIndex(timeline, year) === 0 ? timeline.length : 0);

// The state file lands on disk up to 250ms behind the socket traffic, so a naive
// read right after continue_game still describes the *previous* round and the
// scripted placement ends up aimed at the wrong song. Waiting for a snapshot in
// phase 'player-turn' is enough to disambiguate: every round passes through
// song-guess and reveal in between, so the first player-turn snapshot after a
// reveal necessarily belongs to the new round. (Freshness cannot be used here —
// the server only writes on change, so between game start and the first move
// there is no newer snapshot to wait for.)
async function nextRound(code, host, hostId, guestId) {
  for (let i = 0; i < 80; i++) {
    const hs = await state(host);
    if (hs.phase === 'player-turn') {
      const activeId = hs.isMyTurn ? hostId : guestId;
      const g = serverGame(code);
      // Both sides have to agree on whose turn it is. The socket client and the
      // 250ms state-file writer lag by different amounts, and trusting either
      // alone reads a stale round — which aims the scripted placement at the
      // previous song and produces a wrong answer on camera.
      if (g && g.phase === 'player-turn' && g.playerOrder[g.currentPlayerIdx] === activeId) {
        const card = g.sharedDeck[g.currentCardIndex];
        const timeline = g.timelines[activeId] || [];
        if (card) {
          return {
            activeId,
            card,
            timeline,
            cardIndex: g.currentCardIndex,
            correct: correctIndex(timeline, card.year),
            wrong: wrongIndex(timeline, card.year),
          };
        }
      }
    }
    await sleep(150);
  }
  const g = serverGame(code);
  console.log(`  ! client and server never agreed on the turn (server phase=${g && g.phase})`);
  return null;
}

// A challenger re-places the card on the *original* player's timeline while it
// still shows the challenged card. Timeline.jsx#gapToConfirmed already maps the
// rendered gaps back to indices in the timeline with that card removed (and
// omits the two gaps touching it, which would be no-op re-placements), so the
// gap to tap is simply the correct slot in the stripped timeline.
function challengeIndex(code) {
  const g = serverGame(code);
  if (!g || !g.challenge) return null;
  const card = g.sharedDeck[g.currentCardIndex];
  if (!card) return null;
  const base = (g.timelines[g.challenge.originalPlayerId] || []).filter((c) => c.id !== card.id);
  return correctIndex(base, card.year);
}

// --- player plumbing --------------------------------------------------------
async function newPlayer(browser, name, { record = false } = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    ...(record ? { recordVideo: { dir: RAW, size: VIDEO } } : {}),
  });
  const page = await ctx.newPage();
  return { name, ctx, page };
}

async function enterName(p) {
  await p.page.goto(BASE);
  await p.page.waitForTimeout(1500);
  await p.page.getByPlaceholder('Enter your name...').pressSequentially(p.name, { delay: 90 });
  await p.page.waitForTimeout(500);
  await p.page.getByRole('button', { name: 'Continue' }).click();
  await p.page.waitForTimeout(900);
}

const emit = (p, event, payload) =>
  p.page.evaluate(({ e, d }) => window.__beatably.socket.emit(e, d), { e: event, d: payload });

const state = (p) =>
  p.page.evaluate(() => {
    const b = window.__beatably || {};
    const me = (b.players || []).find((x) => x.id === b.socket?.id);
    return {
      phase: b.phase,
      view: b.view,
      // The win screen is an overlay: `view` stays 'game' and `phase` never
      // becomes 'game-over' on the client, so this is the only reliable signal.
      won: !!(b.showWinnerView || b.winner),
      myId: me?.persistentId || null,
      isMyTurn: !!(me && b.currentPlayerId === me.persistentId),
    };
  });

async function waitPhase(p, phase, timeout = 20000) {
  await p.page
    .waitForFunction((ph) => window.__beatably?.phase === ph, phase, { timeout })
    .catch(() => console.log(`  ! timed out waiting for phase=${phase}`));
}

// Typed character-by-character so the camera sees it being written; falls back
// to a direct fill if the field is still settling.
async function type(locator, text) {
  try {
    await locator.click({ timeout: 4000 });
    await locator.pressSequentially(text, { delay: 65, timeout: 12000 });
  } catch {
    await locator.fill(text).catch(() => {});
  }
}

async function clickIfVisible(page, name, timeout = 2500) {
  const btn = page.getByRole('button', { name });
  if (await btn.first().isVisible({ timeout }).catch(() => false)) {
    await btn.first().click();
    return true;
  }
  return false;
}

// Place through the real UI: tap the gap circle, hold on the pending state so
// the spring animation reads on camera, then confirm.
async function placeViaUI(p, index, { hold = 1100 } = {}) {
  // Gap circles mount with the timeline's entry animation, so a placement
  // issued the instant a phase flips can race them.
  await p.page.locator('[data-node-index]').first()
    .waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});

  const available = (await p.page.locator('[data-node-index]')
    .evaluateAll((ns) => ns.map((n) => Number(n.getAttribute('data-node-index')))))
    .sort((a, b) => a - b);
  if (!available.length) {
    console.log(`  ! no gap circles rendered (wanted ${index})`);
    return false;
  }
  // A challenge hides the gaps either side of the challenged card, so the exact
  // slot is sometimes absent; the neighbouring one still reads fine on camera.
  const target = available.includes(index)
    ? index
    : available.reduce((a, b) => (Math.abs(b - index) < Math.abs(a - index) ? b : a));
  if (target !== index) console.log(`  ~ gap ${index} unavailable, using ${target} of [${available}]`);

  await p.page.locator(`[data-node-index="${target}"]`).first().click();
  await sleep(hold);
  await clickIfVisible(p.page, 'Confirm Placement');
  return true;
}

// --- main -------------------------------------------------------------------
async function main() {
  // Only the capture outputs are disposable — promo/assets holds the caption
  // font the edit depends on.
  for (const d of [RAW, SHOTS]) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      `--force-device-scale-factor=${SCALE}`,
      '--autoplay-policy=no-user-gesture-required',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });

  const host = await newPlayer(browser, 'Alex', { record: true });
  const guest = await newPlayer(browser, 'Sam');

  t0 = Date.now();
  mark('recording-start');

  // 1. Brand + name entry -----------------------------------------------------
  await host.page.goto(BASE);
  await host.page.waitForTimeout(2200);
  mark('brand');
  await shot(host.page, 'brand');

  await host.page.getByPlaceholder('Enter your name...').pressSequentially('Alex', { delay: 130 });
  await host.page.waitForTimeout(700);
  mark('name-typed');
  await host.page.getByRole('button', { name: 'Continue' }).click();
  await host.page.waitForTimeout(1400);
  mark('menu');
  await shot(host.page, 'menu');

  // 2. Create the game --------------------------------------------------------
  await host.page.getByRole('button', { name: 'Create multiplayer game' }).click();
  await host.page.waitForFunction(() => window.__beatably?.roomCode, null, { timeout: 20000 });
  const code = await host.page.evaluate(() => window.__beatably.roomCode);
  console.log(`  room code ${code}`);
  await host.page.waitForTimeout(2000);
  mark('lobby');
  await shot(host.page, 'lobby');

  // Mirror lobby settings off the wire so we can rewrite winCondition without
  // guessing the full settings shape (the server replaces it wholesale).
  await host.page.evaluate(() => {
    window.__lobby = null;
    window.__beatably.socket.on('lobby_update', (l) => { window.__lobby = l; });
  });

  // 3. Friend joins -----------------------------------------------------------
  await enterName(guest);
  await guest.page.getByRole('button', { name: 'Join a game' }).click();
  await guest.page.waitForTimeout(600);
  for (let i = 0; i < code.length; i++) await guest.page.locator(`#code-${i}`).fill(code[i]);
  await guest.page.getByRole('button', { name: /^Join Game$/i }).click();
  await host.page.waitForTimeout(2200);
  mark('friend-joined');
  await shot(host.page, 'lobby-2p');

  const settings = await host.page.evaluate(() => window.__lobby?.settings || null);
  if (settings) {
    await emit(host, 'update_settings', { code, settings: { ...settings, winCondition: WIN_CONDITION } });
    await host.page.waitForTimeout(600);
  } else {
    console.log('  ! never saw lobby_update; keeping default winCondition');
  }

  // 4. Start ------------------------------------------------------------------
  await host.page.getByRole('button', { name: 'Start Game' }).click();
  await host.page.waitForFunction(() => window.__beatably?.view === 'game', null, { timeout: 30000 });
  await host.page.waitForTimeout(2500);
  mark('game-start');
  await shot(host.page, 'game-start');

  const hostId = (await state(host)).myId;
  const guestId = (await state(guest)).myId;

  // 5. Rounds -----------------------------------------------------------------
  let round = 0;
  let didChallenge = false;
  let didGuess = false;

  while (round < 14) {
    round += 1;
    const hs = await state(host);
    // The winner view replaces the game view the moment someone hits the target;
    // without this the loop keeps "playing" a finished game and records dead air.
    if (hs.won || hs.view !== 'game') break;

    const info = await nextRound(code, host, hostId, guestId);
    if (!info) { console.log('  ! server never reported this round, stopping'); break; }
    const active = info.activeId === hostId ? host : guest;

    console.log(`\n round ${round}: ${active.name} active — "${info.card.title}" (${info.card.year})`);

    if (active === host) {
      // Host plays for real, and plays correctly — this is the money shot.
      await host.page.waitForTimeout(1600);
      mark(`r${round}-host-turn`);
      await shot(host.page, `r${round}-host-turn`);

      // Start the preview so the transport actually runs on camera — a music
      // game whose progress bar never moves reads as a mockup.
      const play = host.page.getByRole('button', { name: 'Play' });
      if (await play.isVisible({ timeout: 1500 }).catch(() => false)) {
        await play.click();
        await host.page.waitForTimeout(3200);
        mark(`r${round}-playing`);
        await shot(host.page, `r${round}-playing`);
      }

      if (!(await placeViaUI(host, info.correct))) {
        await emit(host, 'place_card', { code, index: info.correct });
      }
      mark(`r${round}-host-confirm`);
      await waitPhase(host, 'song-guess');
      await host.page.waitForTimeout(1200);
      await shot(host.page, `r${round}-song-guess`);

      if (!didGuess) {
        // One round shows the credit bonus: type the real title + artist.
        mark(`r${round}-guess-open`);
        const title = host.page.getByPlaceholder('Song title');
        const artist = host.page.getByPlaceholder('Artist');
        if (await title.isVisible().catch(() => false)) {
          // The guess sheet slides up; typing into it mid-transition times out.
          await host.page.waitForTimeout(700);
          await type(title, info.card.title);
          await host.page.waitForTimeout(400);
          await type(artist, info.card.artist);
          await host.page.waitForTimeout(900);
          await shot(host.page, `r${round}-guess-filled`);
          mark(`r${round}-guess-filled`);
          const submitted =
            (await clickIfVisible(host.page, /submit/i)) ||
            (await clickIfVisible(host.page, /check|guess/i));
          if (!submitted) await artist.press('Enter');
          await host.page.waitForTimeout(1800);
          mark(`r${round}-guess-result`);
          await shot(host.page, `r${round}-guess-result`);
          didGuess = true;
        }
      }
      if ((await state(host)).phase === 'song-guess') {
        if (!(await clickIfVisible(host.page, 'Skip'))) await emit(host, 'skip_song_guess', { code });
      }
    } else {
      // Guest plays wrong, so the host stays ahead and the game resolves inside
      // the length of a promo cut.
      await host.page.waitForTimeout(1400);
      mark(`r${round}-observing`);
      await shot(host.page, `r${round}-observing`);
      if (!(await placeViaUI(guest, info.wrong, { hold: 800 }))) {
        await emit(guest, 'place_card', { code, index: info.wrong });
      }
      await waitPhase(guest, 'song-guess');
      await emit(guest, 'skip_song_guess', { code });
    }

    // Challenge window — host challenges the guest's first wrong placement.
    await waitPhase(host, 'challenge-window', 12000);
    await host.page.waitForTimeout(900);

    if (active === guest && !didChallenge) {
      mark(`r${round}-challenge-window`);
      await shot(host.page, `r${round}-challenge-window`);
      const opened = await clickIfVisible(host.page, /challenge/i, 3000);
      if (opened) {
        didChallenge = true;
        await host.page.waitForTimeout(1500);
        mark(`r${round}-challenge`);
        await shot(host.page, `r${round}-challenge`);
        const ci = challengeIndex(code);
        if (ci != null && !(await placeViaUI(host, ci, { hold: 1000 }))) {
          await emit(host, 'challenge_place_card', { code, index: ci });
        }
        await host.page.waitForTimeout(2200);
        mark(`r${round}-challenge-result`);
        await shot(host.page, `r${round}-challenge-result`);
      }
    }

    if ((await state(host)).phase === 'challenge-window') {
      await emit(host, 'skip_challenge', { code });
      await emit(guest, 'skip_challenge', { code });
    }

    // Reveal (a resolved challenge parks on 'challenge-resolved' on the way there)
    await host.page
      .waitForFunction(
        () => ['reveal', 'challenge-resolved'].includes(window.__beatably?.phase),
        null,
        { timeout: 15000 },
      )
      .catch(() => console.log('  ! never reached reveal'));
    await host.page.waitForTimeout(1700);
    mark(`r${round}-reveal`);
    await shot(host.page, `r${round}-reveal`);

    // Prefer the real button (it is the on-camera action), but a reveal after a
    // wrong placement holds the phase open behind a removal animation and the
    // observer has no button at all — so always back it with an explicit emit
    // from both players, and retry once if the server is still sitting on it.
    // continue_game advances the turn and the server accepts it from anyone, so
    // clicking the button *and* emitting advances twice and the same player goes
    // again. Prefer the real button (it is the on-camera action) and only fall
    // back to an emit — then retry once if the phase is genuinely stuck.
    const idxBefore = (serverGame(code) || {}).currentPlayerIdx;
    if (!(await clickIfVisible(host.page, /continue|next/i))) {
      await emit(active, 'continue_game', { code });
    }
    // A wrong placement holds 'reveal' open behind a card-removal animation, so
    // phase alone is not proof the continue was dropped — retry only if the turn
    // itself has not moved, or the second continue advances a second time and
    // the same player plays again.
    await host.page.waitForTimeout(2600);
    const g2 = serverGame(code) || {};
    if (g2.phase === 'reveal' && g2.currentPlayerIdx === idxBefore) {
      await emit(active, 'continue_game', { code });
      await host.page.waitForTimeout(1200);
    }

    const after = await state(host);
    if (after.won || after.view !== 'game') break;
  }

  // 6. Win screen -------------------------------------------------------------
  await host.page
    .waitForFunction(() => window.__beatably?.showWinnerView || window.__beatably?.winner, null, { timeout: 15000 })
    .catch(() => console.log('  ! never reached the win screen'));
  await host.page.waitForTimeout(3000);
  mark('game-over');
  await shot(host.page, 'game-over');
  await host.page.waitForTimeout(1500);
  mark('recording-end');

  const videoPath = await host.page.video().path();
  await host.ctx.close(); // finalises the webm
  await guest.ctx.close();
  await browser.close();

  const finalPath = path.join(RAW, 'host.webm');
  fs.renameSync(videoPath, finalPath);
  fs.writeFileSync(
    path.join(PROMO, 'markers.json'),
    JSON.stringify({ video: finalPath, size: VIDEO, marks }, null, 2),
  );
  console.log(`\nvideo:   ${finalPath}\nmarkers: ${path.join(PROMO, 'markers.json')}`);
}

main().catch((e) => { console.error(e); process.exit(2); });
