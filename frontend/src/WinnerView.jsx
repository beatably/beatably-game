import React, { useEffect, useState } from 'react';

// Game-over screen (iOS GameOverOverlay parity): radial purple glow backdrop,
// trophy springs in (scale 0.3 / -15° → 1 / +5°) then rocks ±5° forever with a
// magenta glow; final scores in a surface-2 card with the #1 row teal-tinted.
const WinnerView = ({ winner, players, onPlayAgain, onReturnToLobby }) => {
  const [showContent, setShowContent] = useState(false);
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    // Trigger animations after component mounts
    const timer = setTimeout(() => setShowContent(true), 100);

    // Generate confetti particles
    const generateParticles = () => {
      const newParticles = [];
      for (let i = 0; i < 50; i++) {
        newParticles.push({
          id: i,
          left: Math.random() * 100,
          delay: Math.random() * 3,
          duration: 3 + Math.random() * 2,
          color: ['#22C55E', '#00CED1', '#9945FF', '#FF1493', '#F5C842'][Math.floor(Math.random() * 5)]
        });
      }
      setParticles(newParticles);
    };

    generateParticles();

    return () => clearTimeout(timer);
  }, []);

  const winnerData = players.find(p => p.id === winner?.id) || winner;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background overflow-hidden"
    >
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

      {/* Radial purple glow behind everything (iOS: purple@0.18 → clear, r360) */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 720,
          height: 720,
          left: '50%',
          top: '45%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(153, 69, 255, 0.18) 0%, rgba(153, 69, 255, 0) 70%)',
        }}
      />

      {/* Confetti particles */}
      <div className="absolute inset-0">
        {particles.map(particle => (
          <div
            key={particle.id}
            className="absolute top-0 w-2 h-3 rounded-sm"
            style={{
              left: `${particle.left}%`,
              animation: `dropConfetti ${particle.duration}s linear ${particle.delay}s forwards`,
              backgroundColor: particle.color,
              boxShadow: `0 0 8px ${particle.color}55`
            }}
          />
        ))}
      </div>

      <div className={`relative z-10 flex flex-col items-center px-4 text-center transition-opacity duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}>
        <div className="relative mb-6">
          <div
            style={{
              fontSize: 80,
              lineHeight: 1,
              filter: 'drop-shadow(0 0 16px rgba(255, 20, 147, 0.5))',
              animation: 'trophyEnter 0.6s cubic-bezier(0.34, 1.4, 0.64, 1) both',
            }}
          >
            <span
              className="inline-block"
              style={{ animation: 'trophyRock 0.8s ease-in-out 0.7s infinite alternate' }}
            >
              🏆
            </span>
          </div>
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
