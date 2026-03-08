import { Button } from "@/components/ui/button";

const GENRE_META = [
  { id: 'pop', label: 'Pop', emoji: '🌟' },
  { id: 'indie', label: 'Indie', emoji: '🎸' },
  { id: 'rock', label: 'Rock', emoji: '🤘' },
  { id: 'electronic', label: 'Electronic', emoji: '🎛️' },
  { id: 'hip-hop', label: 'Hip-Hop', emoji: '🎤' },
];

const MARKET_DESCRIPTIONS = {
  international: 'Widely recognised hits from around the world.',
  mix: 'A blend of international and Swedish chart hits.',
  se: 'Songs by Swedish artists, from pop exports to classics.',
};

// Shows just the two endpoint handles with a fixed-width gradient line between them
function StaticEraTimeline({ min, max }) {
  const minLabel = String(min);
  const maxLabel = max >= 2025 ? 'Today' : String(max);

  return (
    <div className="relative select-none" style={{ width: '200px', height: '44px' }}>
      {/* Gradient line */}
      <div
        className="absolute"
        style={{
          left: '10px',
          right: '10px',
          top: '10px',
          height: '1px',
          background: 'linear-gradient(90deg, #08AF9A, #7D3BED)',
        }}
      />
      {/* Start handle */}
      <div className="absolute" style={{ left: 0, top: 0 }}>
        <div
          className="w-5 h-5 rounded-full border-2 bg-background"
          style={{
            borderColor: '#08AF9A',
            boxShadow: '0 0 0 3px rgba(8,175,154,0.2)',
          }}
        />
        <span
          className="absolute text-[10px] font-medium text-foreground/70 whitespace-nowrap"
          style={{ top: '22px', left: '50%', transform: 'translateX(-50%)' }}
        >
          {minLabel}
        </span>
      </div>
      {/* End handle */}
      <div className="absolute" style={{ right: 0, top: 0 }}>
        <div
          className="w-5 h-5 rounded-full border-2 bg-background"
          style={{
            borderColor: '#7D3BED',
            boxShadow: '0 0 0 3px rgba(125,59,237,0.2)',
          }}
        />
        <span
          className="absolute text-[10px] font-medium text-foreground/70 whitespace-nowrap"
          style={{ top: '22px', right: '50%', transform: 'translateX(50%)' }}
        >
          {maxLabel}
        </span>
      </div>
    </div>
  );
}

// Label column — consistent uppercase muted style
function RowLabel({ children }) {
  return (
    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide w-20 flex-shrink-0 pt-0.5 text-left">
      {children}
    </div>
  );
}

function GameStartModal({ settings, players, onDismiss }) {
  const prefs = settings?.musicPreferences || {};
  const markets = prefs.markets || [];
  const yearRange = prefs.yearRange || { min: 1960, max: 2025 };
  const difficulty = settings?.difficulty || 'easy';
  const winCondition = settings?.winCondition ?? 10;

  const marketMode =
    markets.includes('SE') && markets.includes('international') ? 'mix'
    : markets.includes('SE') ? 'se'
    : 'international';
  const marketImg = { international: '/img/intl.svg', mix: '/img/mix.svg', se: '/img/se.svg' }[marketMode];
  const marketLabel = { international: 'International', mix: 'Mix', se: 'Swedish Only' }[marketMode];

  const isAdvanced = difficulty === 'advanced';
  const selectedGenres = (prefs.genres || []).map(g => String(g).toLowerCase());
  const activeGenres = GENRE_META.filter(g => selectedGenres.includes(g.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-background border border-border rounded-xl max-w-sm w-full shadow-xl">
        <div className="p-6 space-y-8">

          {/* Title */}
          <h2 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Chewy', cursive" }}>
            Game On!
          </h2>

          <div className="space-y-7">
            {/* Difficulty */}
            <div className="flex items-start gap-4">
              <RowLabel>Difficulty</RowLabel>
              <span className="text-sm font-semibold text-foreground">
                {difficulty === 'easy' ? 'Easy' : 'Advanced'}
              </span>
            </div>

            {/* Music selection */}
            <div className="flex items-start gap-4">
              <RowLabel>Music</RowLabel>
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex-shrink-0 overflow-hidden rounded-md w-14" style={{ aspectRatio: '4/3' }}>
                  <img src={marketImg} alt={marketLabel} className="absolute inset-0 w-full h-full object-cover" />
                  <span className="absolute inset-0 rounded-md pointer-events-none" style={{
                    background: 'linear-gradient(90deg, #08AF9A, #7D3BED)',
                    padding: '2px',
                    WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed text-left">{MARKET_DESCRIPTIONS[marketMode]}</p>
              </div>
            </div>

            {/* First to */}
            <div className="flex items-start gap-4">
              <RowLabel>First to</RowLabel>
              <span className="text-sm font-semibold text-foreground">{winCondition} hits</span>
            </div>

            {/* Era */}
            <div className="flex items-start gap-4">
              <RowLabel>Era</RowLabel>
              <div className="pt-[2px]">
                <StaticEraTimeline min={yearRange.min} max={yearRange.max} />
              </div>
            </div>

            {/* Genres — Advanced only */}
            {isAdvanced && activeGenres.length > 0 && (
              <div className="flex items-start gap-4">
                <RowLabel>Genres</RowLabel>
                <div className="flex flex-wrap gap-1.5">
                  {activeGenres.map(({ id, emoji, label }) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-white/5 px-2.5 py-1 text-xs font-medium text-foreground/80">
                      <span>{emoji}</span>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground text-center italic">
              May the best ears win. Good luck!
            </p>
            <Button className="w-full" onClick={onDismiss}>
              Let's go! →
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default GameStartModal;
