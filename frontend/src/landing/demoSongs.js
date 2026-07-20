// Songs for the ILLUSTRATIVE demos (sections 02 Place, 03 Earn, 04 Challenge).
// Titles/artists/years are REAL — those are facts, not copyrightable, so naming
// a track and its release year is fine. The ALBUM ART is NOT the real cover:
// each `art` is original, generated, era/genre-evocative artwork (see
// /img/landing/covers), so no label-owned artwork is used here.
//
// Real songs with real Apple Music artwork + playback live only in the
// interactive "Your turn" section (see realSongs.js).

const song = (id, title, artist, year) => ({
  id,
  title,
  artist,
  year,
  art: `/img/landing/covers/${id}.jpg`,
});

export const SONGS = {
  takeOnMe: song('take-on-me', 'Take on Me', 'a-ha', 1985),
  likeAPrayer: song('like-a-prayer', 'Like a Prayer', 'Madonna', 1989),
  wonderwall: song('wonderwall', 'Wonderwall', 'Oasis', 1995),
  babyOneMoreTime: song('baby-one-more-time', '...Baby One More Time', 'Britney Spears', 1999),
  heyYa: song('hey-ya', 'Hey Ya!', 'OutKast', 2003),
  mrBrightside: song('mr-brightside', 'Mr. Brightside', 'The Killers', 2004),
  umbrella: song('umbrella', 'Umbrella', 'Rihanna', 2008),
  rollingInTheDeep: song('rolling-in-the-deep', 'Rolling in the Deep', 'Adele', 2011),
  blindingLights: song('blinding-lights', 'Blinding Lights', 'The Weeknd', 2020),
};
