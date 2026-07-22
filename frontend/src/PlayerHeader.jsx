import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import beatablyLogo from "./assets/beatably_logo.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OverlappingCoins } from "@/components/design/CoinView";

function TokenStack({ count }) {
  return (
    <span className="flex items-center h-5 ml-1 md:ml-2">
      <OverlappingCoins count={count} size={13} />
    </span>
  );
}

// A single solo header stat: value on top, small caption below.
function SoloStat({ value, label, accent }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 min-w-0">
      <div className={`font-bold text-base md:text-lg leading-none flex items-center ${accent || 'text-foreground'}`}>
        {value}
      </div>
      <span className="text-[10px] md:text-xs text-muted-foreground mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}

function PlayerHeader({ players, currentPlayerId, tokenAnimations = {}, isCreator, isSolo, onRestart, onExit, onShowHowToPlay }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showExitConfirm, setShowExitConfirm] = React.useState(false);
  const [animatingTokens, setAnimatingTokens] = useState({});
  const [isRestarting, setIsRestarting] = useState(false);

  // Handle token animations
  useEffect(() => {
    Object.keys(tokenAnimations).forEach(playerId => {
      if (tokenAnimations[playerId] && !animatingTokens[playerId]) {
        setAnimatingTokens(prev => ({ ...prev, [playerId]: true }));
        
        // Remove animation after 2 seconds
        setTimeout(() => {
          setAnimatingTokens(prev => {
            const newState = { ...prev };
            delete newState[playerId];
            return newState;
          });
        }, 2000);
      }
    });
  }, [tokenAnimations, animatingTokens]);

  const isPlayerAnimating = (player) => {
    if (!player) return false;
    return !!(animatingTokens[player.id] || animatingTokens[player.persistentId]);
  };

  const handleRestart = async () => {
    setMenuOpen(false);
    if (onRestart) {
      setIsRestarting(true);
      try {
        await onRestart();
      } catch (error) {
        console.error('Error restarting game:', error);
      } finally {
        setIsRestarting(false);
      }
    }
  };

  const handleExit = () => {
    setMenuOpen(false);
    setShowExitConfirm(true);
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    if (onExit) {
      onExit();
    }
  };

  const handleCancelExit = () => {
    setShowExitConfirm(false);
  };

  return (
    <header className="w-full flex items-center justify-between p-2 md:px-2 md:py-1">
      <div className="absolute left-16 top-5">
        <img className="w-0" src={beatablyLogo} alt="Beatably Logo"></img>
      </div>

      {/* Menu button - aligned with header content */}
      {players.length > 0 && (
        <div className="flex items-center">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="bg-input text-foreground p-2 rounded hover:bg-card flex items-center justify-center"
            aria-label="Menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" className="text-foreground">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Solo: no turn to highlight, so drop the player card and spread a row of
          run stats across from the menu icon. */}
      {isSolo && players.length > 0 ? (
        <div className="flex items-center gap-2 md:gap-5 pr-1">
          <SoloStat value={Math.max(0, (players[0].score || 1) - 1)} label="Streak" />
          <div className="w-px h-6 bg-border" />
          <SoloStat value={players[0].correctGuesses || 0} label="Guessed" accent="text-primary" />
          <div className="w-px h-6 bg-border" />
          {/* data-player-card lets CoinFlightLayer originate the credit-spend
              animation from the credits stack (matches multiplayer cards). */}
          <div data-player-card={players[0].persistentId}>
            <SoloStat
              value={(
                <>
                  <span>{players[0].tokens}</span>
                  <TokenStack count={players[0].tokens} />
                </>
              )}
              label="Credits"
              accent="text-[#F5C842]"
            />
          </div>
        </div>
      ) : (
      /* Score cards (iOS ScoreHeader): quarter-width cards, horizontal scroll,
          active = magenta tint + gradient border + dual glow */
      <div className="flex gap-2 overflow-x-auto text-[10px] md:text-xs" style={{ scrollbarWidth: 'none' }}>
        {players.map((p) => (
          <div
            key={p.id}
            data-player-card={p.persistentId}
            className={`flex flex-col rounded-xl items-center px-1.5 py-1 md:px-2 md:py-1 flex-shrink-0 justify-center relative ${
              p.persistentId === currentPlayerId
                ? "gradient-border-magenta"
                : "bg-surface-2/85 border border-border"
            }`}
            style={{
              width: players.length >= 3 ? 'calc((100vw - 96px) / 4)' : undefined,
              minWidth: players.length >= 3 ? 64 : 80,
              ...(p.persistentId === currentPlayerId
                ? { boxShadow: '0 0 8px rgba(255, 20, 147, 0.6), 0 0 18px rgba(255, 20, 147, 0.3)' }
                : {}),
            }}
          >
            <span className={`font-bold text-foreground truncate ${
              players.length === 4 ? 'max-w-[60px]' : 'max-w-[70px] md:max-w-[60px]'
            } mb-0.5 md:mb-1`}>{p.name}</span>
            <div className={`flex items-center gap-0.5 transition-all duration-500 ${
              isPlayerAnimating(p) ? 'animate-pulse bg-primary/10 rounded-md px-1' : ''
            }`}>
              <span className="font-semibold text-base md:text-lg text-foreground">{p.score}</span>
              <span className="text-muted-foreground xs:inline">songs</span>
              <div className={`transition-transform duration-300 ${
                isPlayerAnimating(p) ? 'scale-110' : 'scale-100'
              }`}>
                <TokenStack count={p.tokens} />
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {players.length > 0 && (
        <>
          {/* Modal overlay - rendered via portal */}
          {menuOpen && createPortal(
            <>
              {/* Background overlay */}
              <div 
                className="fixed inset-0 bg-black bg-opacity-50"
                style={{ zIndex: 9999 }}
                onClick={() => setMenuOpen(false)}
              />
              
              {/* Modal content */}
              <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
                <Card className="bg-card border-border mobile-shadow container-card w-full max-w-sm">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <Button
                        onClick={isCreator ? handleRestart : undefined}
                        disabled={!isCreator}
                        className={`w-full h-12 px-4 font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button ${
                          isCreator 
                            ? 'bg-primary hover:bg-primary/90 text-primary-foreground' 
                            : 'border border-border text-muted-foreground cursor-not-allowed bg-transparent'
                        }`}
                        variant={isCreator ? "default" : "outline"}
                      >
                        Restart Game
                      </Button>
                      <Button
                        onClick={handleExit}
                        variant="outline"
                        className="w-full h-12 px-4 border border-border bg-transparent hover:bg-input font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
                      >
                        Exit to Lobby
                      </Button>
                      <Button
                        onClick={() => { setMenuOpen(false); onShowHowToPlay && onShowHowToPlay(); }}
                        variant="outline"
                        className="w-full h-12 px-4 border border-border bg-transparent hover:bg-input font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
                      >
                        How to Play
                      </Button>
                    </div>
                    <Button
                      onClick={() => setMenuOpen(false)}
                      variant="outline"
                      className="w-full h-12 px-4 mt-6 border border-border bg-transparent hover:bg-input font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
                    >
                      Cancel
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </>,
            document.body
          )}
          
          {/* Restart loading overlay - rendered via portal */}
          {isRestarting && createPortal(
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center" style={{ zIndex: 10001 }}>
              <Card className="bg-card border-border mobile-shadow container-card w-full max-w-sm">
                <CardContent className="p-6 text-center">
                  <div className="mb-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Restarting Game</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                        <span>Fetching fresh songs...</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                        <span>Resetting game state...</span>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                        <span>Starting new game...</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body
          )}

          {/* Exit confirmation modal - rendered via portal */}
          {showExitConfirm && createPortal(
            <>
              {/* Background overlay */}
              <div 
                className="fixed inset-0 bg-black bg-opacity-50"
                style={{ zIndex: 9999 }}
                onClick={handleCancelExit}
              />
              
              {/* Modal content */}
              <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
                <Card className="bg-card border-border mobile-shadow container-card w-full max-w-sm">
                  <CardContent className="p-6 text-center">
                    <div className="mb-2">
                      <svg className="mx-auto mb-3" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" className="text-yellow-500" fill="currentColor" />
                        <line x1="12" y1="9" x2="12" y2="13" stroke="#000" strokeWidth="2" />
                        <line x1="12" y1="17" x2="12.01" y2="17" stroke="#000" strokeWidth="2" />
                      </svg>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Leave Game?</h3>
                      <p className="text-sm text-muted-foreground">
                        Are you sure you want to exit? This will <span className="text-foreground font-semibold">end the game for everyone</span>.
                      </p>
                    </div>
                    <div className="space-y-3 mt-5">
                      <Button
                        onClick={handleConfirmExit}
                        className="w-full h-12 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2"
                      >
                        Yes, End Game
                      </Button>
                      <Button
                        onClick={handleCancelExit}
                        variant="outline"
                        className="w-full h-12 px-4 border border-border bg-transparent hover:bg-input font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button"
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>,
            document.body
          )}
        </>
      )}
    </header>
  );
}

export default PlayerHeader;
