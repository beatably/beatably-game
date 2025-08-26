import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from './config';

function SongDebugPanel({ roomCode, isVisible, onClose }) {
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('current');

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

  const fetchLastFetch = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/debug/songs`);
      const data = await response.json();
      setDebugData(data);
    } catch (error) {
      console.error('Error fetching debug data:', error);
      setDebugData({ error: 'Failed to fetch debug data' });
    } finally {
      setLoading(false);
    }
  };

  const fetchAllGames = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/debug/games`);
      const data = await response.json();
      setDebugData(data);
    } catch (error) {
      console.error('Error fetching games data:', error);
      setDebugData({ error: 'Failed to fetch games data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isVisible && activeTab === 'current' && roomCode) {
      fetchGameSongs();
    }
  }, [isVisible, activeTab, roomCode]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card container-card rounded-xl border border-border max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-foreground">Song Debug Panel</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl p-2 -m-2 rounded focus:outline-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('current')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'current'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Current Game Songs
          </button>
          <button
            onClick={() => setActiveTab('fetch')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'fetch'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Last Fetch
          </button>
          <button
            onClick={() => setActiveTab('games')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'games'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Games
          </button>
        </div>

        {/* Action buttons */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex gap-2 flex-wrap">
            {activeTab === 'current' && (
              <button
                onClick={fetchGameSongs}
                disabled={loading || !roomCode}
                className="px-3 py-1 h-10 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold touch-button disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Refresh Game Songs'}
              </button>
            )}
            {activeTab === 'fetch' && (
              <button
                onClick={fetchLastFetch}
                disabled={loading}
                className="px-3 py-1 h-10 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold touch-button disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Refresh Last Fetch'}
              </button>
            )}
            {activeTab === 'games' && (
              <button
                onClick={fetchAllGames}
                disabled={loading}
                className="px-3 py-1 h-10 rounded-md border border-border bg-transparent text-foreground text-sm font-semibold touch-button disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Refresh All Games'}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-400">Loading...</div>
          ) : debugData?.error ? (
            <div className="text-red-400">
              <strong>Error:</strong> {debugData.error}
            </div>
          ) : debugData ? (
            <div className="space-y-4">
              {/* Current Game Songs Tab */}
              {activeTab === 'current' && debugData.songs && (
                <div>
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
              )}

              {/* Last Fetch Tab */}
              {activeTab === 'fetch' && (debugData.lastFetch || debugData.metadata) && (
                <div>
                  {/* Metadata */}
                  {(debugData.metadata || debugData.lastFetch?.metadata) && (
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-foreground mb-2">Fetch Metadata</h3>
                      <div className="bg-gray-700 p-3 rounded text-sm space-y-1">
                        {(() => {
                          const meta = debugData.metadata || debugData.lastFetch?.metadata;
                          return (
                            <>
                              <div>Difficulty: <span className="text-white">{meta.difficulty}</span></div>
                              <div>Total Found: <span className="text-white">{meta.totalFound}</span></div>
                              <div>After Filtering: <span className="text-white">{meta.filteredByDifficulty}</span></div>
                              <div>Genres: <span className="text-white">{meta.genresSearched?.join(', ')}</span></div>
                              <div>Markets: <span className="text-white">{meta.marketsSearched?.join(', ')}</span></div>
                              <div>Year Range: <span className="text-white">{meta.preferences?.yearRange?.min}-{meta.preferences?.yearRange?.max}</span></div>
                              <div>Timestamp: <span className="text-white">{new Date(meta.timestamp).toLocaleString()}</span></div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Songs */}
                  {(debugData.lastFetch?.tracks || debugData.tracks) && (
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        Fetched Songs ({(debugData.lastFetch?.tracks || debugData.tracks).length})
                      </h3>
                      <div className="space-y-2">
                        {(debugData.lastFetch?.tracks || debugData.tracks).map((song, index) => (
                          <div key={index} className="bg-gray-700 p-3 rounded">
                            <div className="text-white font-medium">{song.title}</div>
                            <div className="text-gray-400 text-sm">
                              {song.artist} • {song.year} • Pop: {song.popularity || 'N/A'} • {song.genre}
                            </div>
                            {song.market && (
                              <div className="text-gray-500 text-xs">Market: {song.market}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* History */}
                  {debugData.history && debugData.history.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-lg font-semibold text-foreground mb-2">Recent Fetches</h3>
                      <div className="space-y-2">
                        {debugData.history.map((fetch, index) => (
                          <div key={index} className="bg-gray-700 p-3 rounded">
                            <div className="text-white text-sm">
                              {fetch.trackCount} songs • {fetch.difficulty} • {new Date(fetch.timestamp).toLocaleString()}
                            </div>
                            <div className="text-gray-400 text-xs mt-1">
                              Sample: {fetch.sampleTracks?.map(t => `${t.title} (${t.year})`).join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* All Games Tab */}
              {activeTab === 'games' && debugData.games && (
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    All Active Games ({Object.keys(debugData.games).length})
                  </h3>
                  <div className="space-y-4">
                    {Object.entries(debugData.games).map(([gameCode, game]) => (
                      <div key={gameCode} className="bg-gray-700 p-4 rounded">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-foreground font-medium">Game {gameCode}</h4>
                          <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-1 rounded border border-primary/20">
                            {game.phase}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-gray-300">Players: <span className="text-white">{game.players.length}</span></div>
                            <div className="text-gray-300">Current Player: <span className="text-white">{game.players[game.currentPlayerIdx]?.name}</span></div>
                            <div className="text-gray-300">Total Songs: <span className="text-white">{game.totalSongs}</span></div>
                            <div className="text-gray-300">Current Song: <span className="text-white">{game.currentCardIndex + 1}</span></div>
                          </div>
                          <div>
                            {game.currentSong && (
                              <>
                                <div className="text-gray-300">Now Playing:</div>
                                <div className="text-white text-xs">{game.currentSong.title}</div>
                                <div className="text-gray-400 text-xs">{game.currentSong.artist} ({game.currentSong.year})</div>
                              </>
                            )}
                          </div>
                        </div>

                        {game.songStats && (
                          <div className="mt-3 pt-3 border-t border-gray-600">
                            <div className="text-gray-300 text-sm">Song Statistics:</div>
                            <div className="text-xs text-gray-400 mt-1">
                              Years: {game.songStats.yearRange.min}-{game.songStats.yearRange.max} • 
                              Popularity: {game.songStats.popularityStats.min}-{game.songStats.popularityStats.max} (avg: {game.songStats.popularityStats.avg})
                            </div>
                            <div className="text-xs text-gray-400">
                              Genres: {Object.entries(game.songStats.genreDistribution).map(([genre, count]) => `${genre}(${count})`).join(', ')}
                            </div>
                          </div>
                        )}

                        {game.nextFewSongs && game.nextFewSongs.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-600">
                            <div className="text-gray-300 text-sm mb-2">Next Songs:</div>
                            <div className="space-y-1">
                              {game.nextFewSongs.slice(0, 3).map((song, index) => (
                                <div key={index} className="text-xs text-gray-400">
                                  {index + 1}. {song.title} - {song.artist} ({song.year})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw Data */}
              <details className="mt-6">
                <summary className="text-primary cursor-pointer text-sm">Show Raw Data</summary>
                <pre className="text-xs text-gray-400 mt-2 whitespace-pre-wrap break-words bg-gray-900 p-3 rounded overflow-x-auto">
                  {JSON.stringify(debugData, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="text-center text-gray-400">
              {activeTab === 'current' && !roomCode
                ? 'No room code available'
                : 'No data available. Click a button above to load data.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SongDebugPanel;
