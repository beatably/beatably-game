import React, { useState } from 'react';
import LoadingSpinner from './LoadingSpinner';

const SessionRestore = ({ 
  sessionData, 
  onRestore, 
  onDecline, 
  isRestoring = false 
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!sessionData) return null;

  const formatTimeAgo = (timestamp) => {
    const minutes = Math.floor((Date.now() - timestamp) / (1000 * 60));
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
  };

  const getGameStatusText = () => {
    if (sessionData.view === 'waiting') {
      return `Waiting room with ${sessionData.players?.length || 0} players`;
    }
    if (sessionData.view === 'game') {
      const currentPlayer = sessionData.players?.find(p => p.id === sessionData.currentPlayerId);
      return `Game in progress - ${currentPlayer?.name || 'Unknown'}'s turn (Round ${sessionData.gameRound || 1})`;
    }
    return 'Game session';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full border border-gray-600">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Restore Game Session?
          </h2>
          <p className="text-gray-300 text-sm">
            We found a recent game session that you can rejoin.
          </p>
        </div>

        <div className="bg-gray-700 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-semibold text-white">Room: {sessionData.roomCode}</h3>
              <p className="text-sm text-gray-300">Player: {sessionData.playerName}</p>
              {sessionData.isCreator && (
                <span className="inline-block bg-yellow-600 text-yellow-100 text-xs px-2 py-1 rounded mt-1">
                  Creator
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">
                {formatTimeAgo(sessionData.timestamp)}
              </p>
            </div>
          </div>
          
          <div className="border-t border-gray-600 pt-3">
            <p className="text-sm text-gray-300">
              {getGameStatusText()}
            </p>
            
            {sessionData.phase && (
              <p className="text-xs text-gray-400 mt-1">
                Phase: {sessionData.phase.replace('-', ' ')}
              </p>
            )}
          </div>

          {sessionData.players && sessionData.players.length > 0 && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-blue-400 hover:text-blue-300 text-xs mt-2 underline"
            >
              {showDetails ? 'Hide' : 'Show'} player details
            </button>
          )}

          {showDetails && sessionData.players && (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <p className="text-xs text-gray-400 mb-2">Players in game:</p>
              <div className="space-y-1">
                {sessionData.players.map((player, index) => (
                  <div key={player.id || index} className="flex justify-between text-xs">
                    <span className={`${player.id === sessionData.currentPlayerId ? 'text-yellow-300 font-semibold' : 'text-gray-300'}`}>
                      {player.name}
                      {player.isCreator && ' (Host)'}
                      {player.id === sessionData.playerId && ' (You)'}
                    </span>
                    <span className="text-gray-400">
                      Score: {player.score || 0} | Tokens: {player.tokens || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onDecline}
            disabled={isRestoring}
            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Start New Game
          </button>
          <button
            onClick={onRestore}
            disabled={isRestoring}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
          >
            {isRestoring ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Rejoining...
              </>
            ) : (
              'Rejoin Game'
            )}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          Sessions expire after 30 minutes of inactivity
        </p>
      </div>
    </div>
  );
};

export default SessionRestore;
