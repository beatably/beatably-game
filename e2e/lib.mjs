// Shared helpers for the two-browser e2e harness.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
export const HEADLESS = process.env.E2E_HEADED !== '1';
export const LOGS = path.join(__dirname, 'logs');
export const SHOTS = path.join(__dirname, 'screenshots');
const PROFILES = path.join(__dirname, '.profiles');

export function resetDirs() {
  for (const d of [LOGS, SHOTS]) fs.mkdirSync(d, { recursive: true });
  fs.rmSync(PROFILES, { recursive: true, force: true });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function attachLog(page, label) {
  const f = path.join(LOGS, `${label}.log`);
  try { fs.appendFileSync(f, `\n--- ${new Date().toISOString()} ---\n`); } catch { /* ignore */ }
  page.on('console', (m) => { try { fs.appendFileSync(f, `${m.type()}: ${m.text()}\n`); } catch { /* ignore */ } });
  page.on('pageerror', (e) => { try { fs.appendFileSync(f, `PAGEERROR: ${e.message}\n`); } catch { /* ignore */ } });
}

// A "player" owns a persistent browser context (isolated, durable storage) and a
// current page. Reconnecting closes the page and opens a fresh one in the same
// context (localStorage survives — like restarting the browser app).
export async function newPlayer(name, label) {
  const ctx = await chromium.launchPersistentContext(path.join(PROFILES, name), {
    headless: HEADLESS,
    viewport: { width: 430, height: 900 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  attachLog(page, label);
  return { name, label, ctx, page };
}

export async function emit(player, event, payload) {
  await player.page.evaluate(
    ({ e, p }) => window.__beatably.socket.emit(e, p),
    { e: event, p: payload },
  );
}

export async function getState(player) {
  return player.page.evaluate(() => {
    const b = window.__beatably || {};
    const sid = b.socket && b.socket.id;
    const me = (b.players || []).find((p) => p.id === sid);
    const myPersistentId = me ? me.persistentId : null;
    return {
      view: b.view,
      phase: b.phase,
      currentPlayerId: b.currentPlayerId,
      isCreator: b.isCreator,
      myPersistentId,
      isMyTurn: !!(myPersistentId && b.currentPlayerId === myPersistentId),
      hasPreview: (b.timeline || []).some((c) => c && c.preview),
      challenge: b.challenge || null,
      players: (b.players || []).map((p) => ({ name: p.name, tokens: p.tokens, score: p.score })),
    };
  });
}

export async function waitState(player, predicate, timeout = 15000) {
  await player.page.waitForFunction(
    (predStr) => {
      const b = window.__beatably || {};
      const sid = b.socket && b.socket.id;
      const me = (b.players || []).find((p) => p.id === sid);
      const s = {
        view: b.view, phase: b.phase, currentPlayerId: b.currentPlayerId, isCreator: b.isCreator,
        myPersistentId: me ? me.persistentId : null,
        isMyTurn: !!(me && b.currentPlayerId === me.persistentId),
        hasPreview: (b.timeline || []).some((c) => c && c.preview),
      };
      // eslint-disable-next-line no-new-func
      return new Function('s', `return (${predStr});`)(s);
    },
    predicate,
    { timeout },
  );
}

export async function createGame(host, name) {
  await host.page.goto(BASE);
  await host.page.getByPlaceholder('Enter your name...').fill(name);
  await host.page.getByRole('button', { name: 'Create new game' }).click();
  await host.page.waitForFunction(() => window.__beatably && window.__beatably.roomCode, null, { timeout: 20000 });
  return host.page.evaluate(() => window.__beatably.roomCode);
}

export async function joinGame(guest, name, code) {
  await guest.page.goto(BASE);
  await guest.page.getByPlaceholder('Enter your name...').fill(name);
  await guest.page.getByRole('button', { name: 'Join game with code' }).click();
  for (let i = 0; i < code.length; i++) await guest.page.locator(`#code-${i}`).fill(code[i]);
  await guest.page.getByRole('button', { name: 'Join Game' }).click();
}

export async function startGame(host, guest) {
  await host.page.getByRole('button', { name: 'Start Game' }).click();
  // Wait for the game to actually start on both (phase defaults to player-turn,
  // so also require view === 'game' and a populated timeline).
  for (const p of [host, guest]) {
    await waitState(p, "s.view === 'game' && s.phase === 'player-turn' && true", 30000);
  }
}

// Simulate "kill the browser and restart": close the page, reopen in the same
// persistent context, accept the restore prompt. Returns whether the prompt
// appeared. Mutates player.page to the new page.
export async function killAndRejoin(player) {
  await player.page.close();
  await sleep(700);
  const page = await player.ctx.newPage();
  attachLog(page, `${player.label}-reconnect`);
  await page.goto(BASE);
  player.page = page;
  const rejoin = page.getByRole('button', { name: 'Rejoin Game' });
  const shown = await rejoin.isVisible({ timeout: 15000 }).catch(() => false);
  if (shown) await rejoin.click();
  return shown;
}

export async function shot(player, name) {
  try { await player.page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); } catch { /* ignore */ }
}

// Convenience: spin up a fresh 2-player game with isolated profiles per scenario.
// host = creator (plays last), guest = joiner (active first).
export async function freshGame(id) {
  const host = await newPlayer(`host-${id}`, `host-${id}`);
  const guest = await newPlayer(`guest-${id}`, `guest-${id}`);
  const code = await createGame(host, 'Alice');
  await joinGame(guest, 'Bob', code);
  await startGame(host, guest);
  return { host, guest, code };
}

const GUEST_NAMES = ['Bob', 'Cara', 'Dan'];

// Fresh N-player game (n = 2..4). host = creator (plays last); guests join in
// order, so guests[0] is the active player first. Returns { host, guests, all, code }.
export async function freshGameN(id, n) {
  const host = await newPlayer(`h-${id}`, `host-${id}`);
  const code = await createGame(host, 'Alice');
  const guests = [];
  for (let i = 0; i < n - 1; i++) {
    const gp = await newPlayer(`g${i}-${id}`, `guest${i}-${id}`);
    await joinGame(gp, GUEST_NAMES[i], code);
    guests.push(gp);
  }
  // Wait until the host sees the whole lobby, then start.
  await host.page.waitForFunction((want) => (window.__beatably?.players?.length || 0) >= want, n, { timeout: 20000 });
  await host.page.getByRole('button', { name: 'Start Game' }).click();
  const all = [host, ...guests];
  for (const p of all) await waitState(p, "s.view==='game' && s.phase==='player-turn' && true", 30000);
  return { host, guests, all, code };
}

// Find the player whose turn it currently is (isMyTurn === true).
export async function findActive(players) {
  for (const p of players) {
    const s = await getState(p);
    if (s.isMyTurn) return p;
  }
  return null;
}

export async function closeAll(game) {
  for (const p of (game?.all || [])) {
    try { await p.ctx.close(); } catch { /* ignore */ }
  }
}
