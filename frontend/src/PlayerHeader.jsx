import React from "react";
import beatablyLogo from "./assets/beatably_logo.png";

const CoinIcon = ({ className = "" }) => (
  <span className={`inline-block w-5 h-5 align-middle ${className}`}>
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
          style={{ left: `${i * 12}px`, zIndex: count - i }}
        >
          <CoinIcon className="w-5 h-5" />
        </span>
      ))}
      <span style={{ width: `${count > 0 ? 12 * (count - 1) + 20 : 0}px`, display: "inline-block" }}></span>
    </span>
  );
}

function PlayerHeader({ players, currentPlayerId }) {
  const [menuOpen, setMenuOpen] = React.useState(false);

  const handleRestart = () => {
    alert("Game restarted.");
    window.location.reload();
  };

  const handleExit = () => {
    alert("Exiting to lobby.");
    window.location.href = "/lobby";
  };

  return (
    <header className="relative sticky top-0 z-30 w-full bg-none shadow flex items-center justify-end p-2 md:px-2 md:py-1 ">
      <div className="absolute left-16 top-5">
        <img className="w-24" src={beatablyLogo} alt="Beatably Logo"></img>
      </div>
      <div className="flex flex-wrap gap-4 md:gap-6 text-[10px] md:text-xs">

        {players.map((p) => (
          <div
            key={p.id}
            className={`flex flex-col rounded-md items-center px-1.5 py-1 md:px-2 md:py-1 min-w-[70px] md:min-w-[80px] justify-center ${
              p.id === currentPlayerId ? "bg-gray-700 ring-1 ring-gray-500" : "bg-none"
            }`}
          >
            <span className="font-bold truncate max-w-[70px] md:max-w-[60px] mb-0.5 md:mb-1">{p.name}</span>
            <div className="flex items-center gap-0.5">
              <span className="font-semibold text-base md:text-lg">{p.score}</span>
              <span className="text-gray-400 xs:inline">pts</span>
              <TokenStack count={p.tokens} />
            </div>
            {/* Special abilities indicators */}
            <div className="flex gap-1 mt-0.5">
              {p.doublePoints && (
                <span className="text-xs bg-yellow-600 px-1 rounded" title="Double Points">
                  2x
                </span>
              )}
              {p.skipChallenge && (
                <span className="text-xs bg-green-600 px-1 rounded" title="Skip Challenge">
                  🛡️
                </span>
              )}
              {p.bonusTokens > 0 && (
                <span className="text-xs bg-purple-600 px-1 rounded" title="Bonus Tokens">
                  +{p.bonusTokens}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {players.length > 0 && (
        <div className="absolute left-3 top-4">
          <button 
            onClick={() => setMenuOpen(!menuOpen)} 
            className="bg-gray-700 text-white p-2 rounded hover:bg-gray-600 flex items-center justify-center"
            aria-label="Menu"
          >
            <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          
          {/* Modal overlay */}
          {menuOpen && (
            <>
              {/* Background overlay */}
              <div 
                className="fixed inset-0 bg-black bg-opacity-50 z-40"
                onClick={() => setMenuOpen(false)}
              />
              
              {/* Modal content */}
              <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
                  <div className="space-y-3">
                    <button 
                      onClick={players.length > 0 && players[0].id === currentPlayerId ? handleRestart : undefined} 
                      className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${players.length > 0 && players[0].id === currentPlayerId ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-400 text-gray-200 cursor-not-allowed'}`}
                      disabled={!(players.length > 0 && players[0].id === currentPlayerId)}
                    >
                      Restart Game
                    </button>
                    <button 
                      onClick={handleExit} 
                      className="w-full bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
                    >
                      Exit to Lobby
                    </button>
                  </div>
                  <button 
                    onClick={() => setMenuOpen(false)}
                    className="w-full mt-6 bg-transparent border border-gray-600 hover:bg-gray-700 text-gray-300 py-3 px-4 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}

export default PlayerHeader;
