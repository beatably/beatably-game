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
    if (onExit) {
      onExit();
    }
  };

  return (
    <header className="w-full bg-card mobile-shadow flex items-center justify-end p-2 md:px-2 md:py-1">
      <div className="absolute left-16 top-5">
        <img className="w-0" src={beatablyLogo} alt="Beatably Logo"></img>
      </div>
      <div className="flex flex-wrap gap-4 md:gap-6 text-[10px] md:text-xs">

        {players.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-md items-center px-1.5 py-1 md:px-2 md:py-1 min-w-[70px] md:min-w-[80px] justify-center ${
              p.id === currentPlayerId ? "bg-input ring-1 ring-primary" : "bg-transparent"
            }`}
          >
            <span className="font-bold text-foreground truncate max-w-[70px] md:max-w-[60px] mb-0.5 md:mb-1">{p.name}</span>
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
          <div className="absolute left-2 top-2">
          <button 
            onClick={() => setMenuOpen(!menuOpen)} 
            className="bg-input text-foreground p-2 rounded hover:bg-card flex items-center justify-center"
            aria-label="Menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" className="text-foreground">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          
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
        </div>
      )}
    </header>
  );
}

export default PlayerHeader;
