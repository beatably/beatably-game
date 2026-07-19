// Demo songs for the landing-page timelines. Art thumbs are 320px Apple Music
// covers pulled from the curated DB (backend/cache/curated-songs.json) into
// /img/landing/art — years match the game's own database values.

const song = (id, title, artist, year) => ({
  id,
  title,
  artist,
  year,
  art: `/img/landing/art/${id}.jpg`,
});

export const SONGS = {
  takeOnMe: song('take-on-me', 'Take on Me', 'a-ha', 1985),
  likeAPrayer: song('like-a-prayer', 'Like a Prayer', 'Madonna', 1989),
  wonderwall: song('wonderwall', 'Wonderwall', 'Oasis', 1995),
  babyOneMoreTime: song('baby-one-more-time', '...Baby One More Time', 'Britney Spears', 1999),
  heyYa: song('hey-ya', 'Hey Ya!', 'Outkast', 2003),
  mrBrightside: song('mr-brightside', 'Mr. Brightside', 'The Killers', 2004),
  umbrella: song('umbrella', 'Umbrella', 'Rihanna', 2008),
  rollingInTheDeep: song('rolling-in-the-deep', 'Rolling in the Deep', 'Adele', 2011),
  blindingLights: song('blinding-lights', 'Blinding Lights', 'The Weeknd', 2020),
};
