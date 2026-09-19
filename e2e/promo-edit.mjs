// Cuts the raw promo capture into a finished, captioned 9:16 promo video.
//
// Reads e2e/promo/markers.json (written by promo-video.mjs) so every cut is
// anchored to a real event in the playthrough rather than a hand-scrubbed
// timestamp — re-shoot the footage and the same edit still lands on the beat.
//
//   node e2e/promo-edit.mjs
//
// Output: e2e/promo/out/beatably-promo-9x16.mp4 (+ .webm, + poster.jpg)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PROMO = path.join(__dirname, 'promo');
const RAW = path.join(PROMO, 'raw', 'host.webm');
const WORK = path.join(PROMO, 'work');
const OUT = path.join(PROMO, 'out');
const FONT = path.join(PROMO, 'assets', 'Nunito-ExtraBold.ttf');
const LOGO = path.join(ROOT, 'frontend', 'public', 'img', 'beatably_logo.png');

const FPS = 30;
const ENDCARD_SEC = 2.9;

// Caption band. Without an opaque backing the captions sit on the app's own dark
// space background in the same white as the app's own labels, and read as part
// of the UI instead of as narration. The band runs the full frame width — a
// plate sized to the text needs the text measured, and getting that even
// slightly wrong clips the first and last glyphs.
const CAP_SIZE = 54;
const BAND_H = 124;
const BAND_ALPHA = 0.78;

const VIDEO_W = 1080;

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', ...args], { stdio: 'inherit' });

// --- PNG writer -------------------------------------------------------------
// Hand-rolled so the band can carry a real alpha channel (and therefore fade in
// and out with the text); ffmpeg's drawbox has no alpha ramp.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function writePng(file, w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function writeBand(file) {
  const px = Buffer.alloc(VIDEO_W * BAND_H * 4);
  const a = Math.round(BAND_ALPHA * 255);
  for (let i = 3; i < px.length; i += 4) px[i] = a; // RGB stays 0 = black
  writePng(file, VIDEO_W, BAND_H, px);
}

// drawtext is its own little language: colons separate options and single
// quotes terminate the string, so both have to be escaped inside the text.
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\u2019").replace(/:/g, '\\:').replace(/%/g, '\\%');

const FADE_IN = 0.3;
const FADE_OUT = 0.4;

// A caption is a full-width band plus text, both fading together. Centring is
// left to drawtext's own text_w/text_h so it cannot drift out of the band.
function caption(text, y, outDur) {
  const alpha = `if(lt(t,${FADE_IN}),t/${FADE_IN},if(lt(t,${(outDur - FADE_OUT).toFixed(2)}),1,max(0,(${outDur.toFixed(2)}-t)/${FADE_OUT})))`;
  const drawtext = [
    `drawtext=fontfile='${FONT}'`,
    `text='${esc(text)}'`,
    'fontcolor=white',
    `fontsize=${CAP_SIZE}`,
    'x=(w-text_w)/2',
    `y=${y}+(${BAND_H}-text_h)/2`,
    `alpha='${alpha}'`,
  ].join(':');

  return { bandY: y, drawtext };
}

function main() {
  const markers = JSON.parse(fs.readFileSync(path.join(PROMO, 'markers.json'), 'utf8'));
  const at = (label) => {
    const m = markers.marks.find((x) => x.label === label);
    if (!m) throw new Error(`marker not found: ${label}`);
    return m.t;
  };
  const has = (label) => markers.marks.some((x) => x.label === label);

  // Which rounds the host actually played, in order.
  const hostRounds = markers.marks
    .filter((m) => /^r\d+-playing$/.test(m.label))
    .map((m) => parseInt(m.label.match(/^r(\d+)/)[1], 10));
  if (hostRounds.length < 2) throw new Error('need at least two host rounds in the capture');
  const last = hostRounds[hostRounds.length - 1];
  const mid = hostRounds[Math.floor(hostRounds.length / 2)];
  const guessRound = markers.marks.find((m) => /^r\d+-guess-open$/.test(m.label));

  // start/dur are in SOURCE seconds; speed>1 compresses them on output.
  const segments = [
    {
      name: 'hook',
      // Open on the payoff: the card lands and the year is revealed. The reveal
      // mark fires 1.7s into the reveal and the round is advanced immediately
      // after it, so anything past mark+0.3 spills into the next turn.
      start: at(`r${last}-reveal`) - 2.2,
      dur: 2.5,
      speed: 1.0,
      text: 'When did this song come out?',
      y: 380,
    },
    { name: 'brand', start: at('brand') - 0.5, dur: 1.5, speed: 1.0 },
    // The menu is only on screen between the name entry and the create click,
    // so the window has to sit *before* the marker, not after it.
    { name: 'menu', start: at('menu') - 1.2, dur: 1.2, speed: 1.0, text: 'Play with friends, or solo', y: 330 },
    // friend-joined is marked ~2.2s after the guest is actually in the list, and
    // Start Game is clicked shortly after it — so this window sits mostly before
    // the marker or the beat runs on into the first turn.
    { name: 'lobby', start: at('friend-joined') - 1.8, dur: 2.2, speed: 1.0 },
    {
      name: 'listen',
      start: at(`r${mid}-host-turn`) + 0.3,
      dur: at(`r${mid}-playing`) - (at(`r${mid}-host-turn`) + 0.3),
      speed: 1.3,
      text: 'Hear a 30-second clip',
      y: 380,
    },
    {
      name: 'place',
      start: at(`r${mid}-playing`) - 0.3,
      dur: at(`r${mid}-reveal`) + 0.3 - (at(`r${mid}-playing`) - 0.3),
      speed: 1.45,
      text: 'Place it on your timeline',
      y: 380,
    },
  ];

  if (guessRound) {
    const g = parseInt(guessRound.label.match(/^r(\d+)/)[1], 10);
    segments.push({
      name: 'guess',
      start: at(`r${g}-guess-open`),
      dur: at(`r${g}-guess-result`) + 1.5 - at(`r${g}-guess-open`),
      speed: 2.0,
      text: 'Name it for bonus credits',
      y: 380,
    });
  }

  if (has('r1-challenge-window') && has('r1-challenge-result')) {
    segments.push({
      name: 'challenge',
      start: at('r1-challenge-window') - 0.3,
      dur: at('r1-challenge-result') + 0.9 - (at('r1-challenge-window') - 0.3),
      speed: 1.5,
      text: 'Challenge a wrong answer',
      y: 380,
    });
  }

  segments.push({
    name: 'win',
    start: at('game-over') - 0.8,
    dur: 2.8,
    speed: 1.0,
    text: 'Race to build your timeline',
    y: 250,
  });

  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  // One band serves every caption — it is the same full-width rectangle.
  const bandFile = path.join(WORK, 'band.png');
  writeBand(bandFile);

  // --- cut each beat --------------------------------------------------------
  const parts = [];
  let total = 0;
  segments.forEach((s, i) => {
    const outDur = s.dur / s.speed;
    total += outDur;
    const file = path.join(WORK, `${String(i).padStart(2, '0')}-${s.name}.mp4`);
    console.log(
      `  ${s.name.padEnd(10)} src ${s.start.toFixed(1)}s +${s.dur.toFixed(1)}s  x${s.speed}  -> ${outDur.toFixed(1)}s`,
    );

    const base = `setpts=(PTS-STARTPTS)/${s.speed},fps=${FPS}`;
    if (!s.text) {
      ff(['-ss', String(s.start), '-t', String(s.dur), '-i', RAW,
          '-vf', `${base},format=yuv420p`, '-an',
          '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-r', String(FPS), '-y', file]);
      parts.push(file);
      return;
    }

    const cap = caption(s.text, s.y, outDur);
    const fadeOutAt = Math.max(0, outDur - FADE_OUT).toFixed(2);
    const filter = [
      `[0:v]${base}[base]`,
      `[1:v]format=rgba,fade=t=in:st=0:d=${FADE_IN}:alpha=1,`
        + `fade=t=out:st=${fadeOutAt}:d=${FADE_OUT}:alpha=1[band]`,
      `[base][band]overlay=x=0:y=${cap.bandY}:shortest=1[banded]`,
      `[banded]${cap.drawtext},format=yuv420p[v]`,
    ].join(';');
    ff(['-ss', String(s.start), '-t', String(s.dur), '-i', RAW,
        '-loop', '1', '-i', bandFile,
        '-filter_complex', filter, '-map', '[v]', '-an',
        '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-r', String(FPS), '-y', file]);
    parts.push(file);
  });

  // --- end card -------------------------------------------------------------
  // Background is a real frame from the playthrough, blurred — keeps the card
  // in the app's own palette instead of inventing one.
  const bg = path.join(WORK, 'endbg.png');
  ff(['-ss', String(at(`r${last}-playing`)), '-i', RAW, '-frames:v', '1',
      '-vf', 'boxblur=40:3,eq=brightness=-0.10:saturation=1.2', '-y', bg]);

  const endcard = path.join(WORK, `${String(segments.length).padStart(2, '0')}-endcard.mp4`);
  const endFilter = [
    '[1:v]scale=760:-1[logo]',
    '[0:v][logo]overlay=(W-w)/2:660[v0]',
    `[v0]${[
      `drawtext=fontfile='${FONT}'`,
      `text='${esc('Free on iOS and web')}'`,
      'fontcolor=white@0.82', 'fontsize=46', 'x=(w-text_w)/2', 'y=1000',
    ].join(':')}[v1]`,
    `[v1]${[
      `drawtext=fontfile='${FONT}'`,
      `text='${esc('beatably.app')}'`,
      'fontcolor=white', 'fontsize=68', 'borderw=6', 'bordercolor=0x0B0714@0.7',
      'x=(w-text_w)/2', 'y=1120',
    ].join(':')}[v2]`,
    `[v2]fade=t=in:st=0:d=0.5,format=yuv420p[v]`,
  ].join(';');
  ff(['-loop', '1', '-t', String(ENDCARD_SEC), '-i', bg, '-i', LOGO,
      '-filter_complex', endFilter, '-map', '[v]',
      '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-r', String(FPS), '-y', endcard]);
  parts.push(endcard);
  total += ENDCARD_SEC;

  // --- concat + top and tail ------------------------------------------------
  const list = path.join(WORK, 'concat.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));

  const mp4 = path.join(OUT, 'beatably-promo-9x16.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list,
      '-vf', `fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.5).toFixed(2)}:d=0.5,format=yuv420p`,
      '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-profile:v', 'high', '-level', '4.0',
      '-movflags', '+faststart', '-r', String(FPS), '-an', '-y', mp4]);

  // WebM for autoplaying inline on the marketing site.
  const webm = path.join(OUT, 'beatably-promo-9x16.webm');
  ff(['-i', mp4, '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1',
      '-deadline', 'good', '-cpu-used', '2', '-an', '-y', webm]);

  // Poster frame for the <video> element.
  const poster = path.join(OUT, 'poster.jpg');
  ff(['-ss', '1.2', '-i', mp4, '-frames:v', '1', '-q:v', '3', '-y', poster]);

  console.log(`\ntotal ${total.toFixed(1)}s`);
  for (const f of [mp4, webm, poster]) {
    console.log(`  ${(fs.statSync(f).size / 1e6).toFixed(2)} MB  ${f}`);
  }
}

main();
