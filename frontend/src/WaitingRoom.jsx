import React, { useState, useEffect, useRef } from "react";
import GameSettings from "./GameSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  const [isLeaving, setIsLeaving] = useState(false);
  const settingsButtonRef = useRef(null);
  const leaveButtonRef = useRef(null);
  const startGameButtonRef = useRef(null);
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

  // Add body class for waiting room safe area styling
  useEffect(() => {
    document.body.classList.add('waiting-room-active');
    return () => {
      document.body.classList.remove('waiting-room-active');
    };
  }, []);

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

  const handleLeave = async () => {
    setIsLeaving(true);
    try {
      await onLeave();
    } catch (error) {
      console.error('Error leaving game:', error);
      setIsLeaving(false);
    }
  };

  return (
    <div
      className="waiting-room-container flex flex-col items-center justify-center text-foreground px-6"
      style={{
        backgroundColor: "hsl(var(--background))",
        // Use min-height instead of fixed height to allow scrolling
        minHeight: "100dvh",
        // Allow scrolling when content exceeds viewport
        overflow: "auto",
        // iOS optimizations
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
        // Ensure proper safe area handling
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))"
      }}
    >
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-5xl font-bold chewy-regular text-foreground mb-2">Waiting Room</h2>
        </div>

        {/* Combined Game Code and Players Card */}
        <Card className="bg-card border-border mobile-shadow container-card">
          <CardContent className="p-6">
            {/* Game Code Section */}
            <div className="text-center mb-6">
              <div className="text-sm text-muted-foreground mb-2">Game Code</div>
              <div className="text-4xl font-bold text-foreground tracking-wider select-all mb-2">
                {code}
              </div>
              <div className="text-xs text-muted-foreground">Share this code with friends</div>
            </div>
            
            {/* Players Section */}
            <div>
              <div className="text-lg font-semibold text-foreground mb-3">
                Players ({players.length}/4)
              </div>
              <div className="space-y-2">
                {players.map((player) => (
                  <div
                    key={player.id || player.name}
                    className="flex items-center justify-between p-3 bg-input rounded-lg h-12"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{player.name}</span>
                      {player.isCreator && (
                        <span className="text-xs text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                          Host
                        </span>
                      )}
                    </div>
                    {isCreator && player.id !== currentPlayer?.id && (
                      <button
                        onClick={() => onKick(player.id)}
                        aria-label={`Kick ${player.name}`}
                        className="bg-transparent border-0 p-2 -m-2 focus:outline-none"
                      >
                        <svg
                          className="w-4 h-4 text-muted-foreground hover:text-foreground"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M6 18L18 6" />
                          <path d="M6 6L18 18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {isCreator && !canStart && (
              <div className="mt-4 text-sm text-foreground text-center">
                {!enoughPlayers && "Need at least 2 players to start"}
                {tooManyPlayers && "Maximum 4 players allowed"}
              </div>
            )}
            {!isCreator && (guestSeesLoading || isLoadingExternally || loadingStage > 0) && (
              <div className="mt-4 text-sm text-foreground text-center">
                Host is preparing the game…
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings Panel */}
        {isCreator && showSettings && (
          <Card className="bg-card border-border mobile-shadow container-card">
            <CardContent className="p-4">
              <GameSettings 
                settings={settings} 
                onUpdate={onUpdateSettings}
                isGameStarted={false}
              />
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          {isCreator && (
            <Button
              ref={settingsButtonRef}
              variant="outline"
              className="w-full h-12 font-semibold touch-button no-focus-outline"
              onClick={() => {
                setShowSettings((s) => !s);
                // Immediately blur after click to prevent focus ring
                if (settingsButtonRef.current) {
                  setTimeout(() => {
                    settingsButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (settingsButtonRef.current) {
                  settingsButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (settingsButtonRef.current) {
                  settingsButtonRef.current.blur();
                }
              }}
            >
              {showSettings ? "Hide Settings" : "Game Settings"}
            </Button>
          )}

          <Button
            ref={leaveButtonRef}
            variant="outline"
            className="w-full h-12 font-semibold touch-button border-border hover:bg-card flex items-center justify-center no-focus-outline"
            disabled={isLeaving}
            onClick={() => {
              handleLeave();
              // Immediately blur after click to prevent focus ring
              if (leaveButtonRef.current) {
                setTimeout(() => {
                  leaveButtonRef.current.blur();
                }, 0);
              }
            }}
            onTouchStart={() => {
              // Prevent focus on touch start
              if (leaveButtonRef.current) {
                leaveButtonRef.current.blur();
              }
            }}
            onTouchEnd={() => {
              // Blur the button after touch to remove persistent focus highlight
              if (leaveButtonRef.current) {
                leaveButtonRef.current.blur();
              }
            }}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {isLeaving && (
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
            {isLeaving ? "Leaving..." : "Leave Game"}
          </Button>

          {isCreator && (
            <Button
              ref={startGameButtonRef}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button flex items-center justify-center no-focus-outline"
              disabled={!canStart || isStartingGame}
              onClick={() => {
                handleStartGame();
                // Immediately blur after click to prevent focus ring
                if (startGameButtonRef.current) {
                  setTimeout(() => {
                    startGameButtonRef.current.blur();
                  }, 0);
                }
              }}
              onTouchStart={() => {
                // Prevent focus on touch start
                if (startGameButtonRef.current) {
                  startGameButtonRef.current.blur();
                }
              }}
              onTouchEnd={() => {
                // Blur the button after touch to remove persistent focus highlight
                if (startGameButtonRef.current) {
                  startGameButtonRef.current.blur();
                }
              }}
              style={{ WebkitTapHighlightColor: 'transparent' }}
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
            </Button>
          )}
        </div>


      </div>
    </div>
  );
}

export default WaitingRoom;
