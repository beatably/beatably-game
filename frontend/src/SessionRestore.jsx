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
      <div className="bg-card container-card border border-border p-6 max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Restore Game Session?
          </h2>
          <p className="text-muted-foreground text-sm">
            We found a recent game session that you can rejoin.
          </p>
        </div>

        <div className="bg-input rounded-lg p-4 mb-6 border border-border">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-semibold text-foreground">Room: {sessionData.roomCode}</h3>
              <p className="text-sm text-muted-foreground">Player: {sessionData.playerName}</p>
              {sessionData.isCreator && (
                <span className="inline-block bg-primary/10 text-primary font-semibold text-xs px-2 py-1 rounded border border-primary/20 mt-1">
                  Creator
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {formatTimeAgo(sessionData.timestamp)}
              </p>
            </div>
          </div>
          
          <div className="border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">
              {getGameStatusText()}
            </p>
            
            {sessionData.phase && (
              <p className="text-xs text-muted-foreground mt-1">
                Phase: {sessionData.phase.replace('-', ' ')}
              </p>
            )}
          </div>

          {sessionData.players && sessionData.players.length > 0 && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
              className="inline-link-button flex items-center text-foreground text-sm font-semibold p-2 -m-2 hover:text-foreground/80 focus:outline-none mt-2"
            >
              <svg
                className="w-4 h-4 text-muted-foreground mr-2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              {showDetails ? 'Hide' : 'Show'} player details
            </button>
          )}

          {showDetails && sessionData.players && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Players in game:</p>
              <div className="space-y-1">
                {sessionData.players.map((player, index) => (
                  <div key={player.id || index} className="flex justify-between text-xs">
                    <span className={`${player.id === sessionData.currentPlayerId ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                      {player.name}
                      {player.isCreator && ' (Host)'}
                      {player.id === sessionData.playerId && ' (You)'}
                    </span>
                    <span className="text-muted-foreground">
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
            className="flex-1 h-12 flex items-center justify-center px-4 whitespace-nowrap border border-border bg-transparent text-foreground rounded-md font-semibold touch-button disabled:opacity-60 disabled:cursor-not-allowed"
          >
            New Game
          </button>
          <button
            onClick={onRestore}
            disabled={isRestoring}
            className="flex-1 h-12 flex items-center justify-center px-4 whitespace-nowrap bg-primary hover:bg-primary/90 text-primary-foreground rounded-md font-semibold touch-button disabled:opacity-60 disabled:cursor-not-allowed"
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

        <p className="text-xs text-muted-foreground text-center mt-4">
          Sessions expire after 30 minutes of inactivity
        </p>
      </div>
    </div>
  );
};

export default SessionRestore;
