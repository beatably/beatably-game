// 3-4 player reconnection + multi-challenger scenarios.
//
// Turn order: host plays last, guests in join order. So guests[0] (Bob) is the
// active player first; the other guests + host are the eligible challengers.
import * as L from './lib.mjs';

const results = [];
function check(scn, name, pass, detail = '') {
  results.push({ scn, name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  [${scn}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function scenario(id, n, title, fn) {
  console.log(`\n▶ ${id} (${n}p): ${title}`);
  let g;
  try {
    g = await L.freshGameN(id, n);
    await fn(g);
  } catch (e) {
    check(id, 'scenario completed without error', false, e.message);
  } finally {
    await L.closeAll(g);
  }
}

const place = (g, who) => L.emit(who, 'place_card', { code: g.code, index: 0 });
const skipGuess = (g, who) => L.emit(who, 'skip_song_guess', { code: g.code });
const skipChallenge = (g, who) => L.emit(who, 'skip_challenge', { code: g.code });

async function main() {
  L.resetDirs();

  // m1 — bystander (non-host, non-active) reconnects during player-turn
  await scenario('m1', 3, 'bystander reconnects during another player\'s turn', async (g) => {
    const active = g.guests[0]; // Bob
    const bystander = g.guests[1]; // Cara (not host, not active)
    const prompt = await L.killAndRejoin(bystander);
    check('m1', 'bystander got restore prompt', prompt);
    await L.waitState(bystander, "s.view==='game'").catch(() => {});
    await L.shot(bystander, 'm1-bystander');
    const sB = await L.getState(bystander);
    check('m1', 'bystander resumes as non-active spectator', sB.view === 'game' && !sB.isMyTurn, JSON.stringify({ view: sB.view, isMyTurn: sB.isMyTurn }));
    // game unaffected: active player can still place
    await place(g, active);
    const ok = await L.waitState(active, "s.phase==='song-guess'").then(() => true).catch(() => false);
    check('m1', 'active player can still place (game unaffected)', ok);
  });

  // m2 — bystander reconnects during song-guess
  await scenario('m2', 3, 'bystander reconnects during song-guess', async (g) => {
    const active = g.guests[0];
    const bystander = g.guests[1];
    await place(g, active);
    await L.waitState(active, "s.phase==='song-guess'");
    await L.killAndRejoin(bystander);
    await L.waitState(bystander, "s.view==='game'").catch(() => {});
    await L.shot(bystander, 'm2-bystander-songguess');
    const sB = await L.getState(bystander);
    check('m2', 'bystander resumes during song-guess (not active)', sB.phase === 'song-guess' && !sB.isMyTurn, JSON.stringify({ phase: sB.phase, isMyTurn: sB.isMyTurn }));
    await skipGuess(g, active);
    const ok = await L.waitState(active, "s.phase==='challenge-window'").then(() => true).catch(() => false);
    check('m2', 'active can skip after bystander reconnect', ok);
  });

  // m3 — 4-player multi-challenger: ALL eligible challengers must pass -> reveal
  await scenario('m3', 4, 'challenge-window with 3 eligible challengers, all pass -> reveal', async (g) => {
    const active = g.guests[0];
    const challengers = [g.host, g.guests[1], g.guests[2]];
    await place(g, active);
    await L.waitState(active, "s.phase==='song-guess'");
    await skipGuess(g, active);
    await L.waitState(active, "s.phase==='challenge-window'");
    // one challenger passes, phase should stay challenge-window (not all responded)
    await skipChallenge(g, challengers[0]);
    await L.sleep(400);
    const stillWindow = await L.getState(active);
    check('m3', 'stays in challenge-window after only 1 of 3 passes', stillWindow.phase === 'challenge-window', JSON.stringify({ phase: stillWindow.phase }));
    // remaining challengers pass -> reveal
    await skipChallenge(g, challengers[1]);
    await skipChallenge(g, challengers[2]);
    const ok = await L.waitState(active, "s.phase==='reveal'").then(() => true).catch(() => false);
    check('m3', 'all 3 passing advances to reveal', ok);
  });

  // m4 — challenger reconnects DURING challenge-window (before passing), then all pass
  await scenario('m4', 3, 'challenger reconnects mid challenge-window (before passing) -> reveal', async (g) => {
    const active = g.guests[0];
    const challengerA = g.host;
    const challengerC = g.guests[1];
    await place(g, active);
    await L.waitState(active, "s.phase==='song-guess'");
    await skipGuess(g, active);
    await L.waitState(active, "s.phase==='challenge-window'");
    await L.killAndRejoin(challengerC);
    await L.waitState(challengerC, "s.phase==='challenge-window'").catch(() => {});
    await L.shot(challengerC, 'm4-challenger-reconnect');
    const sC = await L.getState(challengerC);
    check('m4', 'reconnected challenger sees challenge-window', sC.phase === 'challenge-window', JSON.stringify({ phase: sC.phase }));
    await skipChallenge(g, challengerA);
    await skipChallenge(g, challengerC);
    const ok = await L.waitState(active, "s.phase==='reveal'").then(() => true).catch(() => false);
    check('m4', 'all pass after reconnect -> reveal', ok);
  });

  // m5 — EXPLORATORY: challenger passes, THEN reconnects; do remaining passes still
  //      reach reveal? (challengeResponses is keyed by socket.id, which changes on
  //      reconnect — this probes whether that strands the all-responded check.)
  await scenario('m5', 3, 'EXPLORATORY: challenger passes then reconnects; can game still reach reveal?', async (g) => {
    const active = g.guests[0];
    const challengerA = g.host;
    const challengerC = g.guests[1];
    await place(g, active);
    await L.waitState(active, "s.phase==='song-guess'");
    await skipGuess(g, active);
    await L.waitState(active, "s.phase==='challenge-window'");
    // C passes first, then reconnects (new socket id; old response now stale)
    await skipChallenge(g, challengerC);
    await L.killAndRejoin(challengerC);
    await L.waitState(challengerC, "s.phase==='challenge-window'").catch(() => {});
    // A passes. If responses were keyed by persistent id, this reaches reveal.
    await skipChallenge(g, challengerA);
    const reached = await L.waitState(active, "s.phase==='reveal'", 6000).then(() => true).catch(() => false);
    check('m5', 'reaches reveal after a passer reconnects (no stranding)', reached,
      reached ? '' : 'STUCK in challenge-window — challengeResponses keyed by socket.id is stranded by reconnect');
    await L.shot(active, 'm5-after');
  });

  // m6 — a non-host player initiates a challenge and completes it
  await scenario('m6', 3, 'non-host player challenges and places -> challenge-resolved', async (g) => {
    const active = g.guests[0];
    const challengerC = g.guests[1];
    await place(g, active);
    await L.waitState(active, "s.phase==='song-guess'");
    await skipGuess(g, active);
    await L.waitState(active, "s.phase==='challenge-window'");
    await L.emit(challengerC, 'initiate_challenge', { code: g.code });
    const inChallenge = await L.waitState(challengerC, "s.phase==='challenge'").then(() => true).catch(() => false);
    check('m6', 'non-host challenge moves to challenge phase', inChallenge);
    await L.emit(challengerC, 'challenge_place_card', { code: g.code, index: 0 });
    const ok = await L.waitState(challengerC, "s.phase==='challenge-resolved'").then(() => true).catch(() => false);
    check('m6', 'non-host challenger places -> challenge-resolved', ok);
    await L.shot(challengerC, 'm6-nonhost-challenge');
  });

  // m7 — turn order with 4 players: active advances host-last (B -> C -> D -> A)
  await scenario('m7', 4, 'turn order is guests-then-host across a full round', async (g) => {
    const order = [];
    // Resolve the name of the active player by checking who isMyTurn.
    async function activeName() {
      for (const p of g.all) {
        const s = await L.getState(p);
        if (s.isMyTurn) {
          const nm = await p.page.evaluate(() => {
            const b = window.__beatably; const sid = b.socket?.id;
            return (b.players || []).find((pp) => pp.id === sid)?.name;
          });
          return nm;
        }
      }
      return '?';
    }
    for (let turn = 0; turn < 4; turn++) {
      const active = await L.findActive(g.all);
      order.push(await activeName());
      // advance a full turn: place -> skip guess -> all others pass -> reveal -> continue
      await place(g, active);
      await L.waitState(active, "s.phase==='song-guess'");
      await skipGuess(g, active);
      await L.waitState(active, "s.phase==='challenge-window'");
      for (const p of g.all) { if (p !== active) await skipChallenge(g, p); }
      await L.waitState(active, "s.phase==='reveal'");
      await L.emit(active, 'continue_game', { code: g.code });
      await L.waitState(active, "s.phase!=='reveal'").catch(() => {});
    }
    check('m7', 'turn order = Bob,Cara,Dan,Alice (guests then host)',
      JSON.stringify(order) === JSON.stringify(['Bob', 'Cara', 'Dan', 'Alice']),
      JSON.stringify(order));
  });
}

main()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
    if (failed.length) {
      console.log('FAILURES / FINDINGS:');
      failed.forEach((r) => console.log(`  [${r.scn}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
    }
    process.exit(failed.length ? 1 : 0);
  })
  .catch((e) => { console.error('multiplayer matrix error:', e); process.exit(2); });
