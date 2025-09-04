import React, { useState, useEffect } from 'react';

function SongGuessNotification({ notification, onClose }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      setIsExiting(false);
      
      // Generate confetti for correct answers
      if (notification.correct) {
        generateConfetti();
      }
      
      // Auto-hide after 4 seconds
      const timer = setTimeout(() => {
        handleClose();
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const generateConfetti = () => {
    const newParticles = [];
    for (let i = 0; i < 30; i++) {
      newParticles.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.5,
        duration: 2 + Math.random() * 1.5,
        color: ['#22c55e', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444'][Math.floor(Math.random() * 5)]
      });
    }
    setParticles(newParticles);
  };

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      setParticles([]);
      onClose();
    }, 300);
  };

  if (!notification || !isVisible) return null;

  const { playerName, correct, title, artist, tokensEarned } = notification;

  return (
    <>
      <style>
        {`
          @keyframes dropConfetti {
            0% { transform: translateY(-120vh) rotate(0deg); opacity: 0; }
            10% { opacity: 1; }
            100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
          }
        `}
      </style>
      
      {/* Confetti particles for correct answers */}
      {correct && (
        <div className="fixed inset-0 z-40 pointer-events-none">
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
      )}

      {/* Centered notification popup */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-6 transition-all duration-300 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}>
        <div className={`container-card bg-card border-border shadow-2xl max-w-md w-full transform transition-all duration-300 ${
          isExiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
        }`}>
          <div className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center rounded-full flex-shrink-0">
                <div className={`${correct ? 'text-primary' : 'text-destructive'} text-2xl`}>
                  {correct ? '🎵' : '❌'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-lg text-foreground">
                  {correct ? `${playerName} guessed correctly!` : `${playerName} guessed incorrectly`}
                </div>
                {correct && tokensEarned && (
                  <div className="text-sm font-semibold mt-2 text-primary bg-primary/10 px-3 py-1 rounded-md border border-primary/20 inline-block">
                    +{tokensEarned} token{tokensEarned > 1 ? 's' : ''} earned!
                  </div>
                )}
                {!correct && (
                  <div className="text-sm text-muted-foreground mt-1">
                    Better luck next time!
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </>
  );
}

export default SongGuessNotification;
