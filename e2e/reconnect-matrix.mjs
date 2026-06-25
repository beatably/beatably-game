// Reconnection matrix: disconnect a player in each game phase (as the active
// player and as the idle host) and assert the game resumes correctly.
//
// 2-player game: host = creator (plays last), guest = joiner (active first), so
// the lone eligible challenger is always the host. Each scenario uses a fresh
// game + isolated browser profiles.
import * as L from './lib.mjs';

const results = [];
function check(scn, name, pass, detail = '') {
  results.push({ scn, name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  [${scn}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function scenario(id, title, fn) {
  console.log(`\n▶ ${id}: ${title}`);
  let g;
  try {
    g = await L.freshGame(id);
    await fn(g);
  } catch (e) {
    check(id, 'scenario completed without error', false, e.message);
  } finally {
    try { await g?.host.ctx.close(); } catch { /* ignore */ }
    try { await g?.guest.ctx.close(); } catch { /* ignore */ }
  }
}

// drive helpers (guest = B = active first)
const place = async (g, who = 'guest') => { await L.emit(g[who], 'place_card', { code: g.code, index: 0 }); };
const toSongGuess = async (g) => { await place(g); await L.waitState(g.guest, "s.phase==='song-guess'"); };
const toChallengeWindow = async (g) => { await toSongGuess(g); await L.emit(g.guest, 'skip_song_guess', { code: g.code }); await L.waitState(g.guest, "s.phase==='challenge-window'"); };
const toReveal = async (g) => { await toChallengeWindow(g); await L.emit(g.host, 'skip_challenge', { code: g.code }); await L.waitState(g.guest, "s.phase==='reveal'"); };

async function main() {
  L.resetDirs();

  // S1 — active player reconnects during player-turn
  await scenario('s1', 'reconnect during player-turn (active player B)', async (g) => {
    const prompt = await L.killAndRejoin(g.guest);
    check('s1', 'restore prompt shown', prompt);
    await L.waitState(g.guest, "s.view==='game'").catch(() => {});
    await L.shot(g.guest, 's1-playerturn');
    const st = await L.getState(g.guest);
    check('s1', 'resumes player-turn, still B turn', st.phase === 'player-turn' && st.isMyTurn, JSON.stringify({ phase: st.phase, isMyTurn: st.isMyTurn }));
    await place(g);
    const ok = await L.waitState(g.guest, "s.phase==='song-guess'").then(() => true).catch(() => false);
    check('s1', 'can place after reconnect', ok);
  });

  // S2 — active player reconnects during song-guess (the original live bug)
  await scenario('s2', 'reconnect during song-guess (active player B)', async (g) => {
    await toSongGuess(g);
    await L.killAndRejoin(g.guest);
    await L.waitState(g.guest, "s.phase==='song-guess'").catch(() => {});
    await L.shot(g.guest, 's2-songguess');
    const st = await L.getState(g.guest);
    check('s2', 'resumes song-guess with placement highlight', st.phase === 'song-guess' && st.hasPreview, JSON.stringify({ phase: st.phase, hasPreview: st.hasPreview }));
    const ui = await g.guest.page.getByText('Do you want to guess the song').isVisible().catch(() => false);
    check('s2', 'song-guess Skip UI renders', ui);
    await L.emit(g.guest, 'skip_song_guess', { code: g.code });
    const ok = await L.waitState(g.guest, "s.phase==='challenge-window'").then(() => true).catch(() => false);
    check('s2', 'skip works after reconnect', ok);
  });

  // S3 — active player reconnects during challenge-window
  await scenario('s3', 'reconnect during challenge-window (active player B)', async (g) => {
    await toChallengeWindow(g);
    await L.killAndRejoin(g.guest);
    await L.waitState(g.guest, "s.phase==='challenge-window'").catch(() => {});
    await L.shot(g.guest, 's3-challengewindow-B');
    const st = await L.getState(g.guest);
    check('s3', 'resumes challenge-window, still B turn', st.phase === 'challenge-window' && st.isMyTurn, JSON.stringify({ phase: st.phase, isMyTurn: st.isMyTurn }));
    await L.emit(g.host, 'skip_challenge', { code: g.code });
    const ok = await L.waitState(g.guest, "s.phase==='reveal'").then(() => true).catch(() => false);
    check('s3', 'host pass -> reveal works after B reconnect', ok);
  });

  // S4 — idle host (eligible challenger) reconnects during challenge-window
  await scenario('s4', 'reconnect during challenge-window (idle host A, eligible challenger)', async (g) => {
    await toChallengeWindow(g);
    const prompt = await L.killAndRejoin(g.host);
    // Host may auto-rejoin (no prompt) or be prompted — both fine if resume works.
    console.log(`    · host reconnected via ${prompt ? 'restore prompt' : 'auto-rejoin'}`);
    await L.waitState(g.host, "s.phase==='challenge-window'").catch(() => {});
    await L.shot(g.host, 's4-challengewindow-A');
    const st = await L.getState(g.host);
    check('s4', 'host resumes challenge-window, not its turn', st.phase === 'challenge-window' && !st.isMyTurn, JSON.stringify({ phase: st.phase, isMyTurn: st.isMyTurn }));
    await L.emit(g.host, 'skip_challenge', { code: g.code });
    const ok = await L.waitState(g.host, "s.phase==='reveal'").then(() => true).catch(() => false);
    check('s4', 'host pass works after reconnect -> reveal', ok);
  });

  // S5 — active player reconnects during reveal, then continues
  await scenario('s5', 'reconnect during reveal (active player B)', async (g) => {
    await toReveal(g);
    await L.killAndRejoin(g.guest);
    await L.waitState(g.guest, "s.phase==='reveal'").catch(() => {});
    await L.shot(g.guest, 's5-reveal');
    const st = await L.getState(g.guest);
    check('s5', 'resumes reveal', st.phase === 'reveal', JSON.stringify({ phase: st.phase }));
    await L.emit(g.guest, 'continue_game', { code: g.code });
    const ok = await L.waitState(g.guest, "s.phase==='player-turn'").then(() => true).catch(() => false);
    check('s5', 'continue_game advances to next turn after reconnect', ok);
  });

  // S6 — idle host reconnects during song-guess; game must survive + continue
  await scenario('s6', 'reconnect of idle host during song-guess (game survives)', async (g) => {
    await toSongGuess(g);
    await L.killAndRejoin(g.host);
    await L.waitState(g.host, "s.view==='game'").catch(() => {});
    await L.shot(g.host, 's6-host-songguess');
    const sa = await L.getState(g.host);
    check('s6', 'host resumes into game as creator', sa.view === 'game' && sa.isCreator === true, JSON.stringify({ view: sa.view, isCreator: sa.isCreator }));
    const sb = await L.getState(g.guest);
    check('s6', 'B still active during host reconnect', sb.phase === 'song-guess' && sb.isMyTurn);
    await L.emit(g.guest, 'skip_song_guess', { code: g.code });
    const ok = await L.waitState(g.guest, "s.phase==='challenge-window'").then(() => true).catch(() => false);
    check('s6', 'game continues after host reconnect', ok);
  });

  // S7 — after a full turn cycle, host (now active) reconnects on its own turn
  await scenario('s7', 'reconnect on own turn after turn handoff (host A active)', async (g) => {
    await toReveal(g);
    await L.emit(g.guest, 'continue_game', { code: g.code });
    await L.waitState(g.host, "s.phase==='player-turn' && s.isMyTurn", 15000);
    await L.killAndRejoin(g.host);
    await L.waitState(g.host, "s.view==='game'").catch(() => {});
    await L.shot(g.host, 's7-host-turn');
    const st = await L.getState(g.host);
    check('s7', 'host resumes its own turn', st.phase === 'player-turn' && st.isMyTurn, JSON.stringify({ phase: st.phase, isMyTurn: st.isMyTurn }));
    await place(g, 'host');
    const ok = await L.waitState(g.host, "s.phase==='song-guess'").then(() => true).catch(() => false);
    check('s7', 'host can place after reconnect on its turn', ok);
  });

  // S8 — challenger reconnects mid-challenge, then completes the placement
  await scenario('s8', 'reconnect during challenge (challenger host A placing)', async (g) => {
    await toChallengeWindow(g);
    await L.emit(g.host, 'initiate_challenge', { code: g.code });
    await L.waitState(g.host, "s.phase==='challenge'").catch(() => {});
    await L.killAndRejoin(g.host);
    await L.waitState(g.host, "s.phase==='challenge'").catch(() => {});
    await L.shot(g.host, 's8-challenge-A');
    const st = await L.getState(g.host);
    check('s8', 'challenger resumes challenge phase', st.phase === 'challenge', JSON.stringify({ phase: st.phase }));
    await L.emit(g.host, 'challenge_place_card', { code: g.code, index: 0 });
    const ok = await L.waitState(g.host, "s.phase==='challenge-resolved'").then(() => true).catch(() => false);
    check('s8', 'challenger can place after reconnect -> challenge-resolved', ok);
  });
}

main()
  .then(() => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
    if (failed.length) {
      console.log('FAILURES:');
      failed.forEach((r) => console.log(`  [${r.scn}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
    }
    process.exit(failed.length ? 1 : 0);
  })
  .catch((e) => { console.error('matrix error:', e); process.exit(2); });
