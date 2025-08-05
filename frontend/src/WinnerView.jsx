import React, { useEffect, useState } from 'react';
import './WinnerView.css';

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
    <div className="winner-overlay">
      <div className="animated-background"></div>
      
      {/* Confetti particles */}
      <div className="confetti-container">
        {particles.map(particle => (
          <div
            key={particle.id}
            className="confetti"
            style={{
              left: `${particle.left}%`,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              backgroundColor: particle.color
            }}
          />
        ))}
      </div>

      <div className={`winner-content ${showContent ? 'show' : ''}`}>
        <div className="trophy-container">
          <div className="trophy">🏆</div>
          <div className="trophy-glow"></div>
        </div>
        
        <h1 className="winner-title">
          {winnerData?.name ? `${winnerData.name} Wins!` : 'Victory Achieved!'}
        </h1>
        
        <p className="winner-subtitle">
          Beatably celebrates your achievement – great job!
        </p>
        
        {players.length > 1 && (
          <div className="final-scores">
            <h3>Final Scores</h3>
            <div className="scores-list">
              {players
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .map((player, index) => (
                  <div key={player.id} className={`score-item ${player.id === winner?.id ? 'winner-highlight' : ''}`}>
                    <span className="rank">#{index + 1}</span>
                    <span className="name">{player.name}</span>
                    <span className="score">{player.score || 0} cards</span>
                  </div>
                ))}
            </div>
          </div>
        )}
        
        <div className="winner-actions">
          <button 
            className="btn btn-primary"
            onClick={onPlayAgain}
          >
            Play Again
          </button>
          <button 
            className="btn btn-secondary"
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
