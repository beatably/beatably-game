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
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-gray-900 via-purple-950 to-black overflow-hidden"
      style={{
        // subtle animated gradient background
        backgroundSize: '400% 400%',
        animation: 'gradientShift 18s ease infinite'
      }}
    >
      <style>
        {`
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
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
      <div className="pointer-events-none absolute inset-0" aria-hidden="true"></div>
      
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
            className="absolute inset-0 blur-2xl rounded-full bg-yellow-400/30 -z-10"
            style={{ animation: 'glowPulse 2.8s ease-in-out infinite' }}
          />
        </div>

        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 drop-shadow-lg">
          {winnerData?.name ? `${winnerData.name} wins!` : 'Victory Achieved!'}
        </h1>

        <p className="mt-3 text-base md:text-lg text-gray-300">
          Amazing knowledge of music!
        </p>

        {players.length > 1 && (
          <div className="mt-6 w-full max-w-xl mx-auto">
            <h3 className="text-gray-200 font-semibold mb-2">Final Scores</h3>
            <div className="divide-y divide-gray-700/60 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10">
              {players
                .slice()
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((player, index) => {
                  const isWinner = player.id === winner?.id;
                  return (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between px-4 py-3 ${isWinner ? 'bg-yellow-400/10' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${index === 0 ? 'text-yellow-300' : 'text-gray-300'}`}>#{index + 1}</span>
                        <span className={`text-white ${isWinner ? 'font-semibold' : ''}`}>{player.name}</span>
                      </div>
                      <span className="text-gray-300 text-sm">{player.score || 0} cards</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          <button
            className="inline-flex items-center justify-center rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400 active:bg-green-700 transition-colors"
            onClick={onPlayAgain}
          >
            Play Again
          </button>
          <button
            className="inline-flex items-center justify-center rounded-md bg-gray-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 active:bg-gray-800 transition-colors"
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
