import React, { useState } from "react";
import GameSettings from "./GameSettings";

function WaitingRoom({
  code,
  players,
  currentPlayer,
  onKick,
  onStart,
  onLeave,
  settings,
  onUpdateSettings,
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const isCreator = currentPlayer?.isCreator;
  const enoughPlayers = players.length >= 2; // Minimum 2 players, max 4 players
  const tooManyPlayers = players.length > 4;
  const canStart = isCreator && enoughPlayers && !tooManyPlayers;

  const handleStartGame = async () => {
    setIsStartingGame(true);
    try {
      await onStart();
    } catch (error) {
      console.error('Error starting game:', error);
      setIsStartingGame(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="bg-gray-900 w-full max-w-md p-4 md:p-0">
        <div className="px-4 pt-6">
          <h2 className="text-5xl font-chewy text-center mb-12">Waiting Room</h2>
          <div className="mb-12 text-center">
            <div className="font-semibold text-white">Game code</div>
            <div className="font- text-5xl md:text-5xl tracking-wider rounded px-4 py-2 inline-block select-all">
              {code}
            </div>
            <div className="text-sm mt-4 text-gray-400">Share this code with friends to join</div>
          </div>
          <div className="mb-12">
            <div className="font-semibold text-gray-300 mb-3">Players ({players.length}/4)</div>
            <div className="bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700 overflow-hidden">
              {players.map((player) => (
                <div
                  key={player.id || player.name}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-base">{player.name}</span>
                    {player.isCreator && (
                      <span className="text-xs text-gray-400 font-semibold bg-gray-900 px-2 py-0.5 rounded ml-1 border border-gray-500">Host</span>
                    )}
                  </div>
                  {isCreator && player.id !== currentPlayer?.id && (
                    <button
                      className="ml-2 text-xs px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white font-semibold transition"
                      onClick={() => onKick(player.id)}
                    >
                      Kick
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        {isCreator && showSettings && (
          <div className="px-4 pb-2">
            <GameSettings settings={settings} onUpdate={onUpdateSettings} />
          </div>
        )}
        <div className="flex flex-col md:flex-row gap-2 md:gap-4 justify-between items-center px-4 pb-6">
          {isCreator && (
            <button
              className={`w-full md:w-auto px-4 py-2 rounded font-semibold border border-green-700 text-white hover:bg-gray-800 transition ${showSettings ? "bg-green-900" : "bg-gray-900"}`}
              onClick={() => setShowSettings((s) => !s)}
            >
              {showSettings ? "Hide Settings" : "Game Settings"}
            </button>
          )}

          <button
            className="w-full md:w-auto px-4 py-2 rounded font-semibold border border-green-700 text-white hover:bg-gray-800 transition bg-gray-900"
            onClick={onLeave}
          >
            Leave Game
          </button>
          {isCreator && (
            <button
              className="w-full md:w-auto px-4 py-2 bg-green-700 hover:bg-green-600 rounded font-semibold text-white transition disabled:bg-gray-700 disabled:text-gray-400 flex items-center justify-center"
              disabled={!canStart || isStartingGame}
              onClick={handleStartGame}
            >
              {isStartingGame && (
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {isStartingGame ? "Preparing songs..." : "Start Game"}
            </button>
          )}
        </div>
        {isCreator && !canStart && (
          <div className="text-center text-sm text-yellow-400 pb-4">
            {!enoughPlayers && "Need at least 2 players to start"}
            {tooManyPlayers && "Maximum 4 players allowed"}
          </div>
        )}
      </div>
    </div>
  );
}

export default WaitingRoom;
