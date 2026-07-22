import React, { useEffect, useState } from 'react';

// Shared animated backdrop: keyframes + radial purple glow + falling confetti.
// Used by both the multiplayer winner screen and the solo scoreboard.
const Backdrop = ({ particles }) => (
  <>
    <style>
      {`
        @keyframes dropConfetti {
          0% { transform: translateY(-120vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
        }
        @keyframes trophyEnter {
          0% { transform: scale(0.3) rotate(-15deg); opacity: 0; }
          60% { transform: scale(1.12) rotate(6deg); opacity: 1; }
          80% { transform: scale(0.96) rotate(4deg); }
          100% { transform: scale(1) rotate(5deg); }
        }
        @keyframes trophyRock {
          0% { transform: rotate(-5deg); }
          100% { transform: rotate(5deg); }
        }
      `}
    </style>
    <div
      className="fixed pointer-events-none"
      style={{
        width: 720,
        height: 720,
        left: '50%',
        top: '30%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(circle, rgba(153, 69, 255, 0.18) 0%, rgba(153, 69, 255, 0) 70%)',
      }}
    />
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute top-0 w-2 h-3 rounded-sm"
          style={{
            left: `${particle.left}%`,
            animation: `dropConfetti ${particle.duration}s linear ${particle.delay}s both`,
            backgroundColor: particle.color,
            boxShadow: `0 0 8px ${particle.color}55`,
          }}
        />
      ))}
    </div>
  </>
);

// Trophy emoji that springs in then rocks forever.
const Trophy = ({ size = 80, emoji = '🏆' }) => (
  <div
    style={{
      fontSize: size,
      lineHeight: 1,
      filter: 'drop-shadow(0 0 16px rgba(255, 20, 147, 0.5))',
      animation: 'trophyEnter 0.6s cubic-bezier(0.34, 1.4, 0.64, 1) both',
    }}
  >
    <span className="inline-block" style={{ animation: 'trophyRock 0.8s ease-in-out 0.7s infinite alternate' }}>
      {emoji}
    </span>
  </div>
);

// A single stat tile: big value + small caption.
const StatTile = ({ value, label, accent }) => (
  <div className="rounded-xl bg-surface-2 border border-border px-3 py-4 flex flex-col items-center justify-center text-center">
    <div className={`text-2xl md:text-3xl font-extrabold leading-none ${accent || 'text-foreground'}`}>{value}</div>
    <div className="mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
  </div>
);

// Horizontal recap of the timeline the player built (oldest → newest).
const TimelineRecap = ({ timeline = [] }) => {
  if (!timeline.length) return null;
  return (
    <div className="w-full">
      <h3 className="text-foreground font-semibold mb-2 text-left">Your timeline</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {timeline.map((song, i) => (
          <div key={i} className="flex-shrink-0 flex flex-col items-center" style={{ width: 60 }}>
            <div
              className="rounded-lg overflow-hidden border border-border flex items-center justify-center"
              style={{
                width: 56,
                height: 56,
                background: song.album_art ? undefined : 'linear-gradient(135deg, #1E1B34, #2A2547)',
              }}
            >
              {song.album_art ? (
                <img
                  src={song.album_art}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <span style={{ fontSize: 22, opacity: 0.5 }}>🎵</span>
              )}
            </div>
            <span className="mt-1 text-xs font-semibold text-foreground">{song.year}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Global solo leaderboard (top 10). The current run's row is highlighted when it
// lands in the top 10; otherwise a separate "you" row with the run's rank is
// appended below the list.
const SoloLeaderboard = ({ soloResult, playerName }) => {
  const { rank, top10 = [], score } = soloResult || {};
  const inTop10 = rank && rank <= 10;
  let highlightedIdx = -1;
  if (inTop10) {
    highlightedIdx = top10.findIndex((e, i) => i + 1 === rank && e.score === score && e.name === playerName);
    if (highlightedIdx === -1) highlightedIdx = rank - 1;
  }
  return (
    <div className="w-full">
      <h3 className="text-foreground font-semibold mb-2 text-left">Global Top 10</h3>
      <div className="divide-y divide-border rounded-xl bg-surface-2 border border-border overflow-hidden">
        {top10.map((entry, index) => {
          const highlight = index === highlightedIdx;
          return (
            <div
              key={index}
              className="flex items-center justify-between px-4 py-3"
              style={highlight ? { backgroundColor: 'rgba(8, 175, 154, 0.10)' } : undefined}
            >
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`}>#{index + 1}</span>
                <span className={`text-foreground ${highlight ? 'font-semibold' : ''}`}>{entry.name}</span>
              </div>
              <span className="text-muted-foreground text-sm">{entry.score} songs</span>
            </div>
          );
        })}
        {!inTop10 && rank && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t-2 border-primary/30"
            style={{ backgroundColor: 'rgba(8, 175, 154, 0.10)' }}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-primary">#{rank}</span>
              <span className="text-foreground font-semibold">{playerName || 'You'}</span>
            </div>
            <span className="text-muted-foreground text-sm">{score} songs</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Full-width solo scoreboard: hero streak, stat tiles, timeline recap, and the
// global leaderboard, all scrollable on a single screen.
const SoloScoreboard = ({ soloResult, playerName, isPersonalBest, prevBest, particles, showContent, onPlayAgain, onReturnToLobby }) => {
  const { score, rank, creditsRemaining = 0, correctGuesses = 0, timeline = [] } = soloResult;
  const years = timeline.map((s) => s.year).filter((y) => Number.isFinite(y));
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;
  const rankAccent = rank === 1 ? 'text-[#F5C842]' : rank && rank <= 10 ? 'text-primary' : 'text-foreground';

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <Backdrop particles={particles} />
      <div className="relative z-10 flex-1 overflow-y-auto">
      <div
        className={`w-full max-w-lg mx-auto flex flex-col items-center px-5 py-8 transition-opacity duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}
      >
        <Trophy size={64} emoji={isPersonalBest ? '🏆' : '🎵'} />

        {isPersonalBest ? (
          <div className="mt-3 inline-block px-3 py-1 rounded-full text-sm font-semibold text-primary bg-primary/10 border border-primary/20">
            New personal best!
          </div>
        ) : (
          <div className="mt-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Run Over
          </div>
        )}

        {/* Hero streak */}
        <div className="mt-4 text-7xl font-extrabold leading-none text-foreground drop-shadow-lg tabular-nums">
          {score}
        </div>
        <div className="mt-1 text-base text-muted-foreground">
          {score === 1 ? 'song placed in a row' : 'songs placed in a row'}
        </div>
        {!isPersonalBest && prevBest > 0 && (
          <div className="mt-1 text-sm text-muted-foreground">
            Your best: <span className="text-foreground font-semibold">{prevBest}</span>
          </div>
        )}

        {/* Stat tiles */}
        <div className="mt-6 grid grid-cols-3 gap-3 w-full">
          <StatTile value={rank ? `#${rank}` : '—'} label="Global rank" accent={rankAccent} />
          <StatTile value={correctGuesses} label="Songs named" accent="text-primary" />
          <StatTile value={creditsRemaining} label="Credits left" accent="text-[#F5C842]" />
        </div>

        {minYear != null && (
          <div className="mt-3 w-full rounded-xl bg-surface-2 border border-border px-4 py-3 text-center">
            <span className="text-sm text-muted-foreground">Era spanned </span>
            <span className="text-sm font-semibold text-foreground">
              {minYear} – {maxYear}
            </span>
            <span className="text-sm text-muted-foreground"> · {maxYear - minYear} yrs</span>
          </div>
        )}

        {/* Timeline recap */}
        <div className="mt-6 w-full">
          <TimelineRecap timeline={timeline} />
        </div>

        {/* Leaderboard */}
        <div className="mt-6 w-full">
          <SoloLeaderboard soloResult={soloResult} playerName={playerName} />
        </div>
      </div>
      </div>

      {/* Actions — sticky bottom card (gameplay-footer style) */}
      <div
        className="relative z-10 w-full bg-footer-panel shadow border-t border-border rounded-t-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0px)' }}
      >
        <div className="w-full max-w-lg mx-auto flex items-center gap-3 px-5 py-3">
          <button
            className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold whitespace-nowrap flex items-center justify-center gap-2 rounded-md focus:ring-primary transition-all duration-200 ease-out active:scale-95"
            onClick={onPlayAgain}
          >
            Play Again
          </button>
          <button
            className="w-full h-12 px-4 bg-transparent border border-border font-semibold whitespace-nowrap flex items-center justify-center gap-2 rounded-md hover:bg-input hover:text-foreground text-foreground focus:ring-primary transition-all duration-200 ease-out active:scale-95"
            onClick={onReturnToLobby}
          >
            Exit to Menu
          </button>
        </div>
      </div>
    </div>
  );
};

// Game-over screen (iOS GameOverOverlay parity): radial purple glow backdrop,
// trophy springs in (scale 0.3 / -15° → 1 / +5°) then rocks ±5° forever with a
// magenta glow; final scores in a surface-2 card with the #1 row teal-tinted.
// Solo mode renders a dedicated full-width scoreboard instead.
const WinnerView = ({ winner, players, soloResult, isSolo, onPlayAgain, onReturnToLobby }) => {
  const [showContent, setShowContent] = useState(false);
  const [particles, setParticles] = useState([]);
  const [isPersonalBest, setIsPersonalBest] = useState(false);
  const [prevBest, setPrevBest] = useState(0);

  // Track the player's personal best locally (the leaderboard is global, but
  // "new personal best" is per-device).
  useEffect(() => {
    if (!isSolo || !soloResult) return;
    try {
      const best = Number(localStorage.getItem('beatably_solo_best') || 0);
      setPrevBest(best);
      if (soloResult.score > best) {
        setIsPersonalBest(true);
        localStorage.setItem('beatably_solo_best', String(soloResult.score));
      }
    } catch (e) {
      // localStorage unavailable — skip personal-best tracking
    }
  }, [isSolo, soloResult]);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 100);
    const newParticles = [];
    for (let i = 0; i < 50; i++) {
      newParticles.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 3 + Math.random() * 2,
        color: ['#22C55E', '#00CED1', '#9945FF', '#FF1493', '#F5C842'][Math.floor(Math.random() * 5)],
      });
    }
    setParticles(newParticles);
    return () => clearTimeout(timer);
  }, []);

  const winnerData = players.find((p) => p.id === winner?.id) || winner;

  if (isSolo && soloResult) {
    return (
      <SoloScoreboard
        soloResult={soloResult}
        playerName={winnerData?.name}
        isPersonalBest={isPersonalBest}
        prevBest={prevBest}
        particles={particles}
        showContent={showContent}
        onPlayAgain={onPlayAgain}
        onReturnToLobby={onReturnToLobby}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background overflow-hidden">
      <Backdrop particles={particles} />

      <div className={`relative z-10 flex flex-col items-center px-4 text-center transition-opacity duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
        <div className="relative mb-6">
          <Trophy />
        </div>

        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground drop-shadow-lg">
          {winnerData?.name ? `${winnerData.name} wins!` : 'Victory Achieved!'}
        </h1>

        <p className="mt-3 text-base md:text-lg text-muted-foreground">
          and shows amazing knowledge in music.
        </p>

        {players.length > 1 && (
          <div className="mt-6 w-full max-w-xl mx-auto">
            <h3 className="text-foreground font-semibold mb-2">Final Scores</h3>
            <div className="divide-y divide-border rounded-xl bg-surface-2 border border-border overflow-hidden">
              {players
                .slice()
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((player, index) => {
                  const isWinner = player.id === winner?.id;
                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between px-4 py-3"
                      style={index === 0 ? { backgroundColor: 'rgba(8, 175, 154, 0.10)' } : undefined}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`}>#{index + 1}</span>
                        <span className={`text-foreground ${isWinner ? 'font-semibold' : ''}`}>{player.name}</span>
                      </div>
                      <span className="text-muted-foreground text-sm">{player.score || 0} songs</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          <button
            className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold whitespace-nowrap flex items-center justify-center gap-2 rounded-md focus:ring-primary transition-all duration-200 ease-out active:scale-95"
            onClick={onPlayAgain}
          >
            <span>Play Again</span>
          </button>
          <button
            className="w-full h-12 px-4 bg-transparent border border-border font-semibold whitespace-nowrap flex items-center justify-center gap-2 rounded-md hover:bg-input hover:text-foreground text-foreground focus:ring-primary transition-all duration-200 ease-out active:scale-95"
            onClick={onReturnToLobby}
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};

export default WinnerView;
