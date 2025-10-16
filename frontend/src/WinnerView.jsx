import React, { useEffect, useState } from 'react';

// Tailwind-only Winner View (no external CSS). Ensure any previous CSS file is unused.
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
          color: ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444'][Math.floor(Math.random() * 5)]
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
          @keyframes trophyBounce {
            0% { transform: translateY(-16px) scale(1); }
            50% { transform: translateY(0px) scale(1.05); }
            100% { transform: translateY(-16px) scale(1); }
          }
          @keyframes glowPulse {
            0% { opacity: 0.35; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.1); }
            100% { opacity: 0.35; transform: scale(1); }
          }
        `}
      </style>
      
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
            className="text-7xl md:text-8xl drop-shadow-[0_0_20px_rgba(255,215,0,0.4)]"
            style={{ animation: 'trophyBounce 2.2s ease-in-out infinite' }}
          >
            🏆
          </div>
          <div
            className="absolute inset-0 blur-2xl rounded-full bg-primary/20 -z-10"
            style={{ animation: 'glowPulse 2.8s ease-in-out infinite' }}
          />
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
            <div className="divide-y divide-border rounded-lg bg-card/20 backdrop-blur-sm border border-border">
              {players
                .slice()
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((player, index) => {
                  const isWinner = player.id === winner?.id;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between px-4 py-3 ${isWinner ? 'bg-primary/10' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${index === 0 ? 'text-primary' : 'text-muted-foreground'}`}>#{index + 1}</span>
                        <span className={`text-foreground ${isWinner ? 'font-semibold' : ''}`}>{player.name}</span>
                      </div>
                      <span className="text-muted-foreground text-sm">{player.score || 0} cards</span>
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
