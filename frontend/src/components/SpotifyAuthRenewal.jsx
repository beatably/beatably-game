import React from 'react';
import { API_BASE_URL } from '../config';

const SpotifyAuthRenewal = ({ 
  isVisible, 
  onRenew, 
  onDismiss, 
  gameState = null,
  autoRedirect = false 
}) => {
  const handleRenewClick = () => {
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
        handleRenewClick();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, autoRedirect]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full border border-gray-600">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Spotify Authorization Renewed
          </h2>
          <p className="text-gray-300 text-sm mb-4">
            Your Spotify connection has been refreshed and you can continue playing.
          </p>
          
          {gameState && (
            <div className="bg-gray-700 rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-300">
                <strong>Room:</strong> {gameState.roomCode}
              </p>
              <p className="text-sm text-gray-300">
                <strong>Player:</strong> {gameState.playerName}
              </p>
              {gameState.view === 'game' && (
                <p className="text-sm text-gray-300">
                  <strong>Status:</strong> Game in progress
                </p>
              )}
            </div>
          )}

          {autoRedirect && (
            <div className="text-sm text-blue-400 mb-4">
              Automatically rejoining game in a few seconds...
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              Continue Without Spotify
            </button>
          )}
          <button
            onClick={handleRenewClick}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors font-semibold"
          >
            {gameState ? 'Rejoin Game' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpotifyAuthRenewal;
