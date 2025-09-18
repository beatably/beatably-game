import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from './config';

function SongDebugPanel({ roomCode, isVisible, onClose }) {
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchGameSongs = async () => {
    if (!roomCode) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/debug/games/${roomCode}/songs`);
      const data = await response.json();
      setDebugData(data);
    } catch (error) {
      console.error('Error fetching game songs:', error);
      setDebugData({ error: 'Failed to fetch game songs' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible && roomCode) {
      fetchGameSongs();
    }
  }, [isVisible, roomCode]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card container-card rounded-xl border border-border max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-foreground">Current Game Songs</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl p-2 -m-2 rounded focus:outline-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-400">Loading...</div>
          ) : debugData?.error ? (
            <div className="text-red-400">
              <strong>Error:</strong> {debugData.error}
            </div>
          ) : debugData?.songs ? (
            <div className="space-y-4">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Game {debugData.gameCode} - Songs ({debugData.totalSongs} total)
                </h3>
                <div className="text-sm text-gray-300 space-y-1">
                  <div>Current Index: <span className="text-white">{debugData.currentIndex}</span></div>
                  <div>Songs Played: <span className="text-white">{debugData.currentIndex}</span></div>
                  <div>Songs Remaining: <span className="text-white">{debugData.totalSongs - debugData.currentIndex}</span></div>
                </div>
              </div>

              <div className="space-y-2">
                {debugData.songs.map((song, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded border-l-4 ${
                      song.isCurrent
                        ? 'bg-yellow-900 bg-opacity-30 border-yellow-400'
                        : song.hasBeenPlayed
                        ? 'bg-gray-700 border-gray-500'
                        : 'bg-gray-800 border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium">
                          {song.index + 1}. {song.title}
                        </div>
                        <div className="text-gray-400 text-sm">
                          {song.artist} • {song.year} • Pop: {song.popularity || 'N/A'} • {song.genre}
                        </div>
                        {song.market && (
                          <div className="text-gray-500 text-xs">Market: {song.market}</div>
                        )}
                      </div>
                      <div className="text-xs">
                        {song.isCurrent && (
                          <span className="bg-primary text-primary-foreground px-2 py-1 rounded">CURRENT</span>
                        )}
                        {song.hasBeenPlayed && !song.isCurrent && (
                          <span className="bg-input text-foreground px-2 py-1 rounded">PLAYED</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-400">
              {!roomCode ? 'No room code available' : 'No song data available'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SongDebugPanel;
