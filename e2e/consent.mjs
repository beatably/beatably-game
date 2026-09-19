// Analytics consent flow.
//
// Guards the rule that matters legally: nothing is stored on the visitor's
// device and no beacon is sent until they opt in. Run with:
//   e2e/run.sh consent.mjs
import { chromium, webkit } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const BANNER = '.bt-consent';
const results = [];

function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function openPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page._errors = [];
  page._tracked = [];
  page.on('pageerror', (e) => page._errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().includes('/api/track')) page._tracked.push(r.url());
  });
  return page;
}

const storage = (page) => page.evaluate(() => ({ ...localStorage }));
const settle = (page) => page.waitForTimeout(2500);

async function run() {
  const browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });

  console.log('\n▶ Landing: before any choice');
  let page = await openPage(browser, { width: 1280, height: 860 });
  await page.goto(`${BASE}/landing.html`);
  await settle(page);
  check('banner is shown on a first visit', await page.isVisible(BANNER));
  check('no /api/track request before a choice', page._tracked.length === 0);
  check('no bt_vid written before a choice', !(await storage(page)).bt_vid);

  console.log('\n▶ Declining');
  await page.click('button:has-text("Decline")');
  await page.waitForTimeout(1000);
  check('banner closes', !(await page.isVisible(BANNER)));
  check('still no /api/track request', page._tracked.length === 0);
  let store = await storage(page);
  check('choice saved as denied with no visitor id', store.bt_consent === 'denied' && !store.bt_vid);
  await page.reload();
  await settle(page);
  check('banner stays closed after a reload', !(await page.isVisible(BANNER)));
  check('no tracking after a reload', page._tracked.length === 0);
  check('no page errors', page._errors.length === 0, page._errors.join(' | '));
  await page.context().close();

  console.log('\n▶ Accepting');
  page = await openPage(browser, { width: 1280, height: 860 });
  await page.goto(`${BASE}/landing.html`);
  await settle(page);
  check('nothing sent while the banner is open', page._tracked.length === 0);
  await page.click('button:has-text("Accept")');
  await page.waitForTimeout(1200);
  check('the held pageview is sent on accept', page._tracked.length >= 1);
  store = await storage(page);
  check('consent granted and a visitor id exists', store.bt_consent === 'granted' && !!store.bt_vid);
  const vid = store.bt_vid;
  await page.reload();
  await settle(page);
  check('the same visitor id is reused', (await storage(page)).bt_vid === vid);
  check('banner does not come back', !(await page.isVisible(BANNER)));

  console.log('\n▶ Changing your mind');
  await page.goto(`${BASE}/landing.html?privacy=settings`);
  await settle(page);
  check('?privacy=settings reopens the banner', await page.isVisible(BANNER));
  await page.click('button:has-text("Decline")');
  await page.waitForTimeout(800);
  check('switching to Decline deletes the visitor id', !(await storage(page)).bt_vid);
  await page.context().close();

  console.log('\n▶ Game page');
  page = await openPage(browser, { width: 1280, height: 860 });
  await page.goto(BASE);
  await page.waitForTimeout(3000);
  check('banner is shown in the game too', await page.isVisible(BANNER));
  check('game sends nothing before a choice', page._tracked.length === 0);

  console.log('\n▶ No third-party font requests');
  const google = [];
  page.on('request', (r) => { if (/gstatic|googleapis/.test(r.url())) google.push(r.url()); });
  await page.goto(`${BASE}/landing.html`);
  await settle(page);
  check('nothing is fetched from Google', google.length === 0, google.join(', '));
  await page.context().close();
  await browser.close();

  // The banner must not cover the primary button on a phone, or people cannot
  // start a game while it is open.
  console.log('\n▶ Mobile placement (WebKit)');
  const mobile = await webkit.launch({ headless: process.env.E2E_HEADED !== '1' });
  const mPage = await openPage(mobile, { width: 390, height: 844 });
  await mPage.goto(BASE);
  await mPage.waitForTimeout(3000);
  const banner = await mPage.locator(BANNER).boundingBox();
  const cta = await mPage.locator('button:has-text("Continue")').first().boundingBox();
  const overlaps = banner && cta
    && banner.y < cta.y + cta.height && banner.y + banner.height > cta.y;
  check('banner does not cover the Continue button', !overlaps);
  await mobile.close();

  await crossSubdomain();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

/**
 * The landing page and the game are separate origins (beatably.app and
 * play.beatably.app), so localStorage alone cannot carry the consent choice
 * between them — the banner used to appear twice and one person counted as two
 * visitors. Both hostnames are mapped to the local build to prove the cookie
 * on the parent domain closes that gap.
 *
 * Needs a host-agnostic server on E2E_STATIC_PORT (the Vite dev server refuses
 * unknown hostnames); skipped when that is not running.
 */
async function crossSubdomain() {
  const port = process.env.E2E_STATIC_PORT;
  if (!port) {
    console.log('\n▶ Cross-subdomain: skipped (set E2E_STATIC_PORT to a server for frontend/dist)');
    return;
  }
  console.log('\n▶ Cross-subdomain (beatably.app → play.beatably.app)');
  const browser = await chromium.launch({
    headless: process.env.E2E_HEADED !== '1',
    args: [`--host-resolver-rules=MAP beatably.app 127.0.0.1:${port}, MAP play.beatably.app 127.0.0.1:${port}`],
  });
  try {
    const ctx = await browser.newContext();
    await ctx.route('**://*.onrender.com/**', (r) => r.abort());
    const page = await ctx.newPage();

    await page.goto('http://beatably.app/landing.html');
    await page.waitForTimeout(2500);
    check('banner shows on the landing page', await page.isVisible(BANNER));
    await page.click('button:has-text("Accept")');
    await page.waitForTimeout(1000);

    const cookies = await ctx.cookies();
    check('consent is stored on the parent domain',
      cookies.some((c) => c.name === 'bt_consent' && c.domain === '.beatably.app'));
    const landingVid = await page.evaluate(() => localStorage.getItem('bt_vid'));

    await page.goto('http://play.beatably.app/');
    await page.waitForTimeout(3000);
    check('the banner is not shown a second time on the game', !(await page.isVisible(BANNER)));
    check('the visitor keeps one id across both sites',
      !!landingVid && landingVid === await page.evaluate(() => localStorage.getItem('bt_vid')));

    // A decline must travel too, and must not arrive as a grant.
    await ctx.clearCookies();
    await page.goto('http://beatably.app/landing.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(2500);
    await page.click('button:has-text("Decline")');
    await page.waitForTimeout(1000);
    await page.goto('http://play.beatably.app/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(3000);
    check('a decline carries across as a decline',
      await page.evaluate(() => localStorage.getItem('bt_consent')) === 'denied');
    check('and leaves no visitor id', !(await page.evaluate(() => localStorage.getItem('bt_vid'))));
  } finally {
    await browser.close();
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
