# Promo video

A 9:16 captioned promo cut from a **real scripted playthrough** of the app — no
mockups, no after-the-fact compositing. Two browser players are driven against
the local stack, the host's screen is recorded, and the edit cuts to timestamps
the capture itself emitted.

## Output

`out/` (committed):

| File | Use |
|---|---|
| `beatably-promo-9x16.mp4` | H.264 1080x1920, 30fps, ~29s, silent. App Store previews, social, press kits. |
| `beatably-promo-9x16.webm` | VP9, same cut. Inline autoplay on the marketing site. |
| `poster.jpg` | Poster frame for the `<video>` element. |

Silent by design — no audio ships, so nothing in the video is licensed music.
Drop your own licensed bed under it if you want sound.

## Regenerate

```bash
e2e/dev-stack.sh              # in another shell: backend :3001 + vite :5173
node e2e/promo-video.mjs      # ~2 min — records raw/host.webm + markers.json
node e2e/promo-edit.mjs       # ~1 min — cuts, captions, encodes into out/
```

Raw footage, screenshots and intermediates are gitignored; only `out/` and the
caption font in `assets/` are kept.

## How the cut is built

`promo-video.mjs` timestamps every beat it performs (`markers.json`), and
`promo-edit.mjs` defines each segment relative to those labels rather than to
absolute times — so a re-shoot with different songs and different pacing still
lands on the same beats. The running order is:

| Beat | Caption |
|---|---|
| Reveal of a correct placement (the hook) | When did this song come out? |
| Brand / name entry | — |
| Main menu | Play with friends, or solo |
| Lobby with join QR | — |
| Preview playing | Hear a 30-second clip |
| Tap a gap, confirm, reveal | Place it on your timeline |
| Title + artist guess | Name it for bonus credits |
| Challenging another player | Challenge a wrong answer |
| Win screen | Race to build your timeline |
| End card | beatably.app |

## Notes for anyone changing this

- **Recording resolution.** Playwright's screencast captures CSS pixels and only
  ever scales a page *down* into `recordVideo.size`, so a context
  `deviceScaleFactor` alone letterboxes the page into the corner of the canvas.
  Chromium's `--force-device-scale-factor` is what makes the capture natively
  1080x1920. The viewport stays at 432x768 so the app renders its phone layout.
- **Placement is scripted, gameplay is not.** Gaps are tapped through the real
  UI so the spring animation and reveal states are genuine; only the *choice* of
  gap comes from the server's own `state.json`, since the client is never told
  the mystery card's year.
- **Win condition.** The capture sets `winCondition: 5` over the wire (the lobby
  UI's minimum is 8) so a complete game fits inside a promo-length shoot.
- **Captions sit on a full-width band**, not bare text and not a plate sized to
  the words. Bare white-on-dark captions read as part of the app's own UI, and a
  text-hugging plate has to be measured — `cropdetect` under-reports the ink box
  by enough to clip the first and last glyphs. A full-width band needs no
  measurement at all, so centring can be left to drawtext's own `text_w`/`text_h`
  and cannot drift. Band geometry is `BAND_H` / `BAND_ALPHA`; each segment picks
  its own `y` so the band lands in empty space on that particular screen.
- **The font must be a static instance.** `assets/Nunito-ExtraBold.ttf` was
  produced with `fontTools.varLib.instancer ... wght=800`. Do not swap in the
  variable `Nunito[wght].ttf` from Google Fonts: freetype renders its default
  instance, which is ExtraLight, and the captions turn thin and washed out.
- **Segment ends.** A `rN-reveal` marker fires 1.7s into the reveal and the round
  is advanced right after, so a segment must not run past `mark + ~0.3s` or it
  spills into the next player's turn.
