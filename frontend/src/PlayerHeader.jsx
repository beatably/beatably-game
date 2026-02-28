import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import beatablyLogo from "./assets/beatably_logo.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const CoinIcon = ({ className = "" }) => (
  <span className={`inline-block w-3 h-3 align-middle ${className}`}>
    <svg viewBox="0 0 20 20" fill="gold" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="9" stroke="#BBB" strokeWidth="1" fill="#FFEB3B" />
      <circle cx="10" cy="10" r="5" fill="#FFD700" />
    </svg>
  </span>
);

function TokenStack({ count }) {
  // Show up to 5 tokens, overlap if more than 1
  return (
    <span className="flex items-center relative h-5 ml-1 md:ml-2">
      {[...Array(count)].map((_, i) => (
        <span
          key={i}
          className="absolute"
          style={{ left: `${i * 7}px`, zIndex: count - i }}
        >
          <CoinIcon className="w-3 h-3" />
        </span>
      ))}
      <span style={{ width: `${count > 0 ? 5 * (count - 1) + 20 : 0}px`, display: "inline-block" }}></span>
    </span>
  );
}

function PlayerHeader({ players, currentPlayerId, tokenAnimations = {}, isCreator, onRestart, onExit }) {
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
    <header className="w-full bg-card flex items-center justify-between p-2 md:px-2 md:py-1">
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
      
      <div className={`flex ${
        players.length === 4 ? 'gap-2' : 
        players.length === 3 ? 'gap-4' : 
        'gap-6'
      } text-[10px] md:text-xs`}>
        {players.map((p, index) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-xl items-center px-1.5 py-1 md:px-2 md:py-1 ${
              players.length === 4 ? 'min-w-[60px] max-w-[80px] flex-shrink' : 'min-w-[70px] md:min-w-[80px]'
            } justify-center relative ${
              p.persistentId === currentPlayerId 
                ? "gradient-border-magenta neon-glow-magenta" 
                : "bg-card/50 border-2 border-border"
            }`}
          >
            <span className={`font-bold text-foreground truncate ${
              players.length === 4 ? 'max-w-[60px]' : 'max-w-[70px] md:max-w-[60px]'
            } mb-0.5 md:mb-1`}>{p.name}</span>
            <div className={`flex items-center gap-0.5 transition-all duration-500 ${
              animatingTokens[p.id] ? 'animate-pulse bg-primary/10 rounded-md px-1' : ''
            }`}>
              <span className="font-semibold text-base md:text-lg text-foreground">{p.score}</span>
              <span className="text-muted-foreground xs:inline">pts</span>
              <div className={`transition-transform duration-300 ${
                animatingTokens[p.id] ? 'scale-110' : 'scale-100'
              }`}>
                <TokenStack count={p.tokens} />
              </div>
            </div>
          </div>
        ))}
      </div>
      
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
