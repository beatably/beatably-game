import React from 'react';
import BottomCard from './components/design/BottomCard';

// Port of iOS SongDetailSheet: hi-res album art, title/artist, big teal year,
// and a "Listen on Apple Music" link when the song has an Apple Music URL
// (curated songs only — hidden otherwise).
function hiResArt(url) {
  if (!url) return null;
  // Apple Music artwork URLs end in e.g. .../300x300bb.jpg — request a larger size.
  return url.replace(/\/\d+x\d+bb\.jpg$/, '/1200x1200bb.jpg');
}

function SongDetailSheet({ open, onClose, card }) {
  if (!card) return null;
  const art = hiResArt(card.album_art || card.image);

  return (
    <BottomCard open={open} onClose={onClose}>
      <div className="px-6 pt-10 pb-8 flex flex-col items-center text-center max-w-sm mx-auto w-full">
        <div
          className="overflow-hidden mb-5"
          style={{
            width: 176,
            height: 176,
            borderRadius: 16,
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 6px 12px rgba(0, 0, 0, 0.4)',
            backgroundColor: '#1E1B34',
          }}
        >
          {art && <img src={art} alt="Album cover" className="w-full h-full object-cover" />}
        </div>
        <div className="text-lg font-bold text-foreground leading-tight">{card.title}</div>
        <div className="text-sm text-muted-foreground mt-1">{card.artist}</div>
        <div className="font-bold mt-3" style={{ fontSize: 38, color: '#08AF9A' }}>
          {card.year}
        </div>
        {card.apple_music_url && (
          <a
            href={card.apple_music_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block press-scale"
            aria-label="Listen on Apple Music"
          >
            <img
              src="/img/listen-on-apple-music.png"
              alt="Listen on Apple Music"
              style={{ height: 46, width: 'auto' }}
            />
          </a>
        )}
      </div>
    </BottomCard>
  );
}

export default SongDetailSheet;
