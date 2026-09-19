// Share wording and payload shape.
//
// Two things broke here before and must not come back:
//   1. `text` and `url` were passed to navigator.share as separate fields, so
//      most targets shared only the link and threw the score away.
//   2. A zero-score run bragged "I placed 0 songs in a row … I'm #39 in the
//      world", which is both wrong and unshareable.
//
// The wording lives in a dependency-free module so it can be imported directly.
import assert from 'node:assert';
import {
  SHARE_URL, DEFAULT_MESSAGE, composeShare, soloShareText, multiplayerShareText,
} from '../frontend/src/utils/shareText.js';

const results = [];
function check(name, fn) {
  try { fn(); results.push(true); console.log(`  PASS  ${name}`); }
  catch (e) { results.push(false); console.log(`  FAIL  ${name} — ${e.message}`); }
}

console.log('\n▶ Solo wording');
check('a real streak names the score and dares the reader', () => {
  const t = soloShareText({ score: 12 });
  assert.match(t, /12 songs in a row/);
  assert.match(t, /beat me/i);
});
check('a top-10 rank is named', () => {
  assert.match(soloShareText({ score: 14, rank: 3 }), /#3 in the world/);
});
check('an unimpressive rank is not named', () => {
  assert.doesNotMatch(soloShareText({ score: 7, rank: 39 }), /in the world/);
});
check('one song reads as one song', () => {
  assert.match(soloShareText({ score: 1 }), /exactly 1 song/);
});
check('a zero run becomes a dare, never a boast', () => {
  const t = soloShareText({ score: 0, rank: 39 });
  assert.doesNotMatch(t, /0 songs in a row/);
  assert.doesNotMatch(t, /in the world/, 'must not brag about a rank it did not earn');
  assert.match(t, /do better/i);
});

console.log('\n▶ Multiplayer wording');
check('winning is first person', () => {
  const t = multiplayerShareText({ iWon: true, score: 10 });
  assert.match(t, /I just won/);
  assert.match(t, /10 songs/);
});
check('losing credits the winner instead', () => {
  const t = multiplayerShareText({ iWon: false, winnerName: 'Anna' });
  assert.match(t, /^Anna just won/);
  assert.doesNotMatch(t, /I just won/);
});
check('an unknown winner still produces a line', () => {
  assert.match(multiplayerShareText({}), /Beatably/);
});

console.log('\n▶ Payload shape');
check('the link is inside the text, not a separate field', () => {
  const body = composeShare(soloShareText({ score: 5 }));
  assert.ok(body.includes(SHARE_URL), 'link must be in the body');
  assert.match(body, /5 songs in a row/, 'and so must the score');
});
check('an empty message falls back to the invite', () => {
  assert.ok(composeShare().includes(DEFAULT_MESSAGE));
  assert.ok(composeShare().includes(SHARE_URL));
});

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
