import React from 'react';
import { API_BASE_URL } from '../config';

const SpotifyAuthRenewal = ({ 
  isVisible, 
  onRenew, 
  gameState = null,
  autoRedirect = false 
}) => {
  const handleAutoRedirect = () => {
    if (gameState) {
      // Save game state for restoration after auth
      localStorage.setItem('game_state_backup', JSON.stringify({
        ...gameState,
        timestamp: Date.now()
      }));
      localStorage.setItem('pending_reauth', 'true');
    }
    
    if (onRenew) {
      onRenew();
    } else {
      // Direct redirect to Spotify auth
      const gameRedirect = window.location.origin + window.location.pathname;
      window.location.href = `${API_BASE_URL}/login?redirect=${encodeURIComponent(gameRedirect)}`;
    }
  };

  // Auto-redirect after a short delay if enabled
  React.useEffect(() => {
    if (isVisible && autoRedirect) {
      const timer = setTimeout(() => {
        handleAutoRedirect();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, autoRedirect]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 px-6">
      <div className="bg-card border-border mobile-shadow container-card p-6 w-full max-w-sm">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              Spotify Authorization Renewed
            </h2>
            <p className="text-muted-foreground text-sm">
              Your Spotify connection has been refreshed and you can continue playing.
            </p>
          </div>
          
          {gameState && (
            <div className="bg-input rounded-lg p-3 space-y-2">
              <p className="text-sm text-foreground">
                <span className="font-semibold">Room:</span> {gameState.roomCode}
              </p>
              <p className="text-sm text-foreground">
                <span className="font-semibold">Player:</span> {gameState.playerName}
              </p>
              {gameState.view === 'game' && (
                <p className="text-sm text-foreground">
                  <span className="font-semibold">Status:</span> Game in progress
                </p>
              )}
            </div>
          )}

          {autoRedirect && (
            <div className="text-sm text-foreground">
              Automatically rejoining game in a few seconds...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpotifyAuthRenewal;
