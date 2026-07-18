// Live placement preview: while the active player has a tentative gap
// selected, observers should see it (remotePreviewIndex + a preview node),
// and it should clear on cancel.
import * as L from './lib.mjs';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function main() {
  L.resetDirs();
  const host = await L.newPlayer('pvhost', 'pvhost');
  const guest = await L.newPlayer('pvguest', 'pvguest');
  L.attachLog(host.page, 'pvhost');
  L.attachLog(guest.page, 'pvguest');

  const code = await L.createGame(host, 'Alice');
  await L.joinGame(guest, 'Bob', code);
  await L.startGame(host, guest);

  // Dismiss the "Game On!" start modal on both pages.
  for (const pl of [host, guest]) {
    const go = pl.page.getByRole('button', { name: /Let's go/ });
    if (await go.isVisible({ timeout: 5000 }).catch(() => false)) await go.click();
  }

  // Guest (joiner) is active first. Tap a gap circle on the guest's page.
  const active = await L.findActive([host, guest]);
  const observer = active === host ? guest : host;
  check('active player identified', !!active);

  const gap = active.page.locator('[data-node-index]').first();
  await gap.waitFor({ timeout: 10000 });
  await gap.click();

  // Observer should receive placement_preview and expose remotePreviewIndex.
  const sawPreview = await L.waitState(observer, 's.remotePreviewIndex === 0', 10000)
    .then(() => true).catch(() => false);
  check('observer sees remotePreviewIndex=0 after active taps gap', sawPreview);
  await observer.page.waitForTimeout(400);
  await L.shot(observer, 'pv-observer-preview');

  // Cancel on the active page clears the preview for the observer.
  await active.page.getByRole('button', { name: 'Cancel' }).click();
  const cleared = await L.waitState(observer, 's.remotePreviewIndex === null', 10000)
    .then(() => true).catch(() => false);
  check('observer preview clears on cancel', cleared);

  // Re-select and confirm; observer preview should clear after confirmation.
  await active.page.locator('[data-node-index]').first().click();
  await L.waitState(observer, 's.remotePreviewIndex === 0', 10000).catch(() => {});
  await active.page.getByRole('button', { name: 'Confirm Placement' }).click();
  const clearedAfterConfirm = await L.waitState(
    observer,
    "s.remotePreviewIndex === null && s.phase === 'song-guess'",
    15000
  ).then(() => true).catch(() => false);
  check('observer preview clears after confirm (phase song-guess)', clearedAfterConfirm);

  for (const pl of [host, guest]) {
    try { await pl.ctx.close(); } catch { /* ignore */ }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('preview flow error:', e); process.exit(2); });
