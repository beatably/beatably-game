import React, { useState, useEffect } from "react";
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
  // Optional: externally supplied progress state if parent wants to control it
  externalLoadingStage,
  isLoadingExternally
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0); // 0: idle, 1: fetching, 2: filtering, 3: preparing, 4: done
  const [guestSeesLoading, setGuestSeesLoading] = useState(false); // guests should also see loading while host starts
  const isCreator = currentPlayer?.isCreator;
  const enoughPlayers = players.length >= 2; // Minimum 2 players, max 4 players
  const tooManyPlayers = players.length > 4;
  const canStart = isCreator && enoughPlayers && !tooManyPlayers;

  // Sync with external progress if provided (e.g., from socket events)
  useEffect(() => {
    if (typeof externalLoadingStage === 'number') {
      setLoadingStage(externalLoadingStage);
      const active = externalLoadingStage > 0 && externalLoadingStage < 4;
      setIsStartingGame(active);
      // If external stage is driven (e.g., by App / sockets), ensure guests also see it
      setGuestSeesLoading(active);
    }
  }, [externalLoadingStage]);

  const handleStartGame = async () => {
    setIsStartingGame(true);
    setGuestSeesLoading(true); // make guests see loading immediately
    // Stage 1: Fetching
    setLoadingStage(1);
    try {
      // Kick off the start
      const startPromise = onStart();

      // Drive stages visually while waiting for transition to game
      // Stage 2 after short delay
      const t1 = setTimeout(() => {
        setLoadingStage((prev) => (prev < 2 ? 2 : prev));
      }, 900);

      // Stage 3 after another short delay
      const t2 = setTimeout(() => {
        setLoadingStage((prev) => (prev < 3 ? 3 : prev));
      }, 1800);

      await startPromise;
      // If we are still in waiting view, keep showing progress until backend flips to game_started
    } catch (error) {
      console.error('Error starting game:', error);
      setIsStartingGame(false);
      setGuestSeesLoading(false);
      setLoadingStage(0);
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
              {(isStartingGame || isLoadingExternally) && (
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              {(() => {
                const stage = externalLoadingStage || loadingStage;
                if (isStartingGame || isLoadingExternally) {
                  if (stage === 1) return "Fetching songs…";
                  if (stage === 2) return "Filtering songs…";
                  if (stage >= 3) return "Preparing playlist…";
                  return "Preparing songs…";
                }
                return "Start Game";
              })()}
            </button>
          )}
        </div>

        {/*
          No separate progress panel; progress text now shown directly in Start button.
          Show a lightweight indicator for guests (non-creator) while host is starting.
        */}
        {!isCreator && (guestSeesLoading || isLoadingExternally || loadingStage > 0) && (
          <div className="px-4 pb-2 w-full max-w-md text-center text-sm text-gray-300">
            Game is preparing…
          </div>
        )}

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
