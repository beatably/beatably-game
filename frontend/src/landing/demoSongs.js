// Fictional songs for the ILLUSTRATIVE demos (sections 02 Place, 03 Earn,
// 04 Challenge). Artist/title/artwork are all invented — the covers are
// original generated art in /img/landing/covers — so nothing here uses real
// Apple Music artwork or metadata. Years are chosen so the demo choreography
// (insert positions, steal ordering) reads correctly. Real songs with real
// playback live only in the interactive "Your turn" section (see realSongs.js).
//
// Object keys are internal handles kept stable so the demo components don't
// need to change; they do NOT refer to real tracks.

const cover = (n) => `/img/landing/covers/cover-${n}.png`;
const song = (id, title, artist, year, coverN) => ({
  id,
  title,
  artist,
  year,
  art: cover(coverN),
});

export const SONGS = {
  takeOnMe: song('demo-a', 'Slow Rivers', 'Velvet Hours', 1985, '01'),
  likeAPrayer: song('demo-b', 'Paper Cathedral', 'Vela', 1989, '10'),
  wonderwall: song('demo-c', 'Cassette Summer', 'The Static Hours', 1995, '03'),
  babyOneMoreTime: song('demo-d', 'Sugar Static', 'Polar Youth', 1999, '04'),
  heyYa: song('demo-e', 'Boombox Gospel', 'Two-Tone Kings', 2003, '05'),
  mrBrightside: song('demo-f', 'Fever Lights', 'Midnight Arcade', 2004, '06'),
  umbrella: song('demo-g', 'Cloudburst', 'Marisol Rae', 2008, '07'),
  rollingInTheDeep: song('demo-h', 'Undertow', 'Ash & Ember', 2011, '08'),
  blindingLights: song('demo-i', 'Chrome Horizon', 'VHS Dreams', 2020, '09'),
};
