// Visual smoke for the rebuilt timeline: multi-card S-curve layout, gap
// circles, tap-to-place pending animation frames, reveal states.
// Not part of the pass/fail suite — emits screenshots only.
import * as L from './lib.mjs';

async function main() {
  L.resetDirs();
  const host = await L.newPlayer('vhost', 'vhost');
  const guest = await L.newPlayer('vguest', 'vguest');
  L.attachLog(host.page, 'vhost');
  L.attachLog(guest.page, 'vguest');
  const players = [host, guest];

  // Capture How to Play from the landing screen.
  await host.page.goto(L.BASE);
  const htpLink = host.page.getByText(/What is Beatably/i);
  if (await htpLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await htpLink.click();
    await host.page.waitForTimeout(400);
    await L.shot(host, 'v-how-to-play');
    const done = host.page.getByRole('button', { name: 'Done' });
    if (await done.isVisible().catch(() => false)) await done.click();
  }

  const code = await L.createGame(host, 'Alice');
  await L.joinGame(guest, 'Bob', code);

  // Capture the lobby settings (host editable + guest read-only) before starting.
  await host.page.waitForTimeout(500);
  await L.shot(host, 'v-lobby-host-settings');
  await L.shot(guest, 'v-lobby-guest-settings');

  await L.startGame(host, guest);

  // Capture the very first single-card timeline (gradient path must be visible).
  await host.page.waitForTimeout(600);
  const firstActive = await L.findActive(players);
  if (firstActive) await L.shot(firstActive, 'v-single-card-timeline');

  // Advance a few rounds via socket emits so timelines accumulate cards.
  for (let round = 0; round < 5; round++) {
    const p = await L.findActive(players);
    if (!p) break;
    const st = await L.getState(p);
    const idx = Math.min(round, (st.timeline || []).length);
    await L.emit(p, 'place_card', { code, index: idx });
    await L.waitState(p, "s.phase==='song-guess'").catch(() => {});
    if (round === 1) {
      await p.page.waitForTimeout(500);
      await L.shot(p, 'v-song-guess-sheet');
    }
    await L.emit(p, 'skip_song_guess', { code });
    await L.waitState(p, "s.phase==='challenge-window'").catch(() => {});
    if (round === 2) {
      const other = p === host ? guest : host;
      await other.page.waitForTimeout(600);
      await L.shot(other, 'v-challenge-window-panel');
    }
    await L.emit(host, 'skip_challenge', { code });
    await L.emit(guest, 'skip_challenge', { code });
    await L.waitState(p, "s.phase==='reveal'").catch(() => {});
    if (round === 3) await L.shot(p, `v-reveal-round${round}`);
    await L.emit(p, 'continue_game', { code });
    await L.waitState(p, "s.phase==='player-turn'").catch(() => {});
  }

  // Multi-card idle layout on whoever is now active.
  const p = await L.findActive(players);
  if (p) {
    await L.shot(p, 'v-multicard-idle');
    // Tap a real gap circle to trigger the placement animation.
    const gap = p.page.locator('[data-node-index]').last();
    if (await gap.count()) {
      await gap.click();
      await p.page.waitForTimeout(180); // mid-animation
      await L.shot(p, 'v-placement-mid');
      await p.page.waitForTimeout(700); // settled, pending mystery node
      await L.shot(p, 'v-placement-pending');
    }
    const other = p === host ? guest : host;
    await L.shot(other, 'v-observer-view');

    // Cancel the pending placement, then tap a revealed art node → song detail sheet.
    const cancel = p.page.getByRole('button', { name: 'Cancel' });
    if (await cancel.isVisible().catch(() => false)) await cancel.click();
    await p.page.waitForTimeout(300);
    const artImg = p.page.locator('.curved-timeline-container img').first();
    if (await artImg.count()) {
      await artImg.click();
      await p.page.waitForTimeout(500);
      await L.shot(p, 'v-song-detail-sheet');
    }
  }

  for (const pl of players) {
    try { await pl.ctx.close(); } catch { /* ignore */ }
  }
  console.log('visual flow done');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(2); });
