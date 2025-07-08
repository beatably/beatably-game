import React, { useState, useEffect } from "react";
import { API_BASE_URL } from './config';

function GameSettings({ settings, onUpdate }) {
  const [localSettings, setLocalSettings] = useState(settings || {
    difficulty: "normal",
    musicPreferences: {
      genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
      yearRange: { min: 1980, max: 2024 },
      markets: ['US']
    }
  });

  const [showMusicSettings, setShowMusicSettings] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocalSettings(settings || {
      difficulty: "normal",
      musicPreferences: {
        genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
        yearRange: { min: 1980, max: 2024 },
        markets: ['US']
      }
    });
  }, [settings]);

  const handleChange = (key, value) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  const handleMusicPreferenceChange = (key, value) => {
    const updated = {
      ...localSettings,
      musicPreferences: {
        ...localSettings.musicPreferences,
        [key]: value
      }
    };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  const handleGenreToggle = (genre) => {
    const currentGenres = localSettings.musicPreferences.genres || [];
    const newGenres = currentGenres.includes(genre)
      ? currentGenres.filter(g => g !== genre)
      : [...currentGenres, genre];
    
    // Ensure at least one genre is selected
    if (newGenres.length > 0) {
      handleMusicPreferenceChange('genres', newGenres);
    }
  };

  const handleMarketToggle = (market) => {
    const currentMarkets = localSettings.musicPreferences.markets || [];
    const newMarkets = currentMarkets.includes(market)
      ? currentMarkets.filter(m => m !== market)
      : [...currentMarkets, market];
    
    // Ensure at least one market is selected
    if (newMarkets.length > 0) {
      handleMusicPreferenceChange('markets', newMarkets);
    }
  };

  const availableGenres = [
    'pop', 'rock', 'hip-hop', 'electronic', 'indie', 'country', 
    'r&b', 'jazz', 'classical', 'folk', 'reggae', 'blues', 'funk', 'alternative'
  ];

  const availableMarkets = [
    { code: 'US', name: 'International (US)' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' }
  ];

  // Debug functions
  const fetchDebugData = async () => {
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

  const testFetchSongs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/fetch-songs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          musicPreferences: localSettings.musicPreferences,
          difficulty: localSettings.difficulty
        })
      });
      const data = await response.json();
      setDebugData({ testFetch: data, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Error testing song fetch:', error);
      setDebugData({ error: 'Failed to test song fetch' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-700 p-3 rounded mb-4">
      <h3 className="font-medium mb-2">Game Settings</h3>
      
      {/* Basic Game Settings */}
      <div className="grid grid-cols-1 gap-2 text-sm mb-4">
        <div>
          <label className="block text-gray-300 mb-1">Difficulty</label>
          <select
            className="w-full p-1 rounded text-black"
            value={localSettings.difficulty}
            onChange={e => handleChange('difficulty', e.target.value)}
          >
            {['easy', 'normal', 'hard'].map(level => (
              <option key={level} value={level}>{level.charAt(0).toUpperCase() + level.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Player Info */}
      <div className="bg-gray-600 p-2 rounded mb-4 text-sm">
        <div className="text-gray-300 mb-1">Players: Determined by who joins (max 4 players)</div>
        <div className="text-gray-300">Songs: Automatically maximized based on your music preferences</div>
      </div>

      {/* Music Settings - Always Visible */}
      <div className="border-t border-gray-600 pt-3">
        <div className="mb-3">
          <span className="font-medium text-gray-300">Music Preferences</span>
        </div>

        <div className="space-y-4">
          <div className="mt-3 space-y-4">
            {/* Genre Selection */}
            <div>
              <label className="block text-gray-300 mb-2 text-sm font-medium">Music Genres</label>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {availableGenres.map(genre => (
                  <label key={genre} className="flex items-center space-x-1 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={localSettings.musicPreferences.genres.includes(genre)}
                      onChange={() => handleGenreToggle(genre)}
                      className="rounded"
                    />
                    <span className="capitalize">{genre}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Year Range */}
            <div>
              <label className="block text-gray-300 mb-2 text-sm font-medium">Year Range</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-400 mb-1 text-xs">From</label>
                  <input
                    type="number"
                    min="1950"
                    max="2024"
                    value={localSettings.musicPreferences.yearRange.min}
                    onChange={e => handleMusicPreferenceChange('yearRange', {
                      ...localSettings.musicPreferences.yearRange,
                      min: parseInt(e.target.value)
                    })}
                    className="w-full p-1 rounded text-black text-xs"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1 text-xs">To</label>
                  <input
                    type="number"
                    min="1950"
                    max="2024"
                    value={localSettings.musicPreferences.yearRange.max}
                    onChange={e => handleMusicPreferenceChange('yearRange', {
                      ...localSettings.musicPreferences.yearRange,
                      max: parseInt(e.target.value)
                    })}
                    className="w-full p-1 rounded text-black text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Geography/Markets */}
            <div>
              <label className="block text-gray-300 mb-2 text-sm font-medium">Geography</label>
              <div className="space-y-1">
                {availableMarkets.map(market => (
                  <label key={market.code} className="flex items-center space-x-2 cursor-pointer hover:text-white text-xs">
                    <input
                      type="checkbox"
                      checked={localSettings.musicPreferences.markets.includes(market.code)}
                      onChange={() => handleMarketToggle(market.code)}
                      className="rounded"
                    />
                    <span>{market.name}</span>
                  </label>
                ))}
              </div>
            </div>


            {/* Reset to Defaults */}
            <button
              onClick={() => handleMusicPreferenceChange('', {
                genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
                yearRange: { min: 1980, max: 2024 },
                markets: ['US']
              })}
              className="w-full py-1 px-2 bg-gray-600 hover:bg-gray-500 rounded text-xs transition"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>

      {/* Debug Panel */}
      <div className="border-t border-gray-600 pt-3 mt-4">
        <button
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          className="w-full py-1 px-2 bg-yellow-600 hover:bg-yellow-500 rounded text-xs transition font-medium"
        >
          {showDebugPanel ? "Hide" : "Show"} Song Debug Panel
        </button>

        {showDebugPanel && (
          <div className="mt-3 space-y-3">
            <div className="text-xs text-yellow-300 bg-yellow-900 bg-opacity-30 p-2 rounded">
              <strong>Debug Panel:</strong> Use this to check what songs are being fetched from Spotify and verify that your settings are working correctly.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={fetchDebugData}
                disabled={loading}
                className="py-1 px-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded text-xs transition"
              >
                {loading ? "Loading..." : "View Last Fetch"}
              </button>
              <button
                onClick={testFetchSongs}
                disabled={loading}
                className="py-1 px-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-xs transition"
              >
                {loading ? "Loading..." : "Test Current Settings"}
              </button>
            </div>

            {debugData && (
              <div className="bg-gray-800 p-3 rounded text-xs max-h-96 overflow-y-auto">
                {debugData.error ? (
                  <div className="text-red-400">
                    <strong>Error:</strong> {debugData.error}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Metadata */}
                    {(debugData.metadata || debugData.testFetch?.metadata) && (
                      <div>
                        <h4 className="text-yellow-300 font-medium mb-2">Fetch Metadata:</h4>
                        <div className="text-gray-300 space-y-1">
                          {(() => {
                            const meta = debugData.metadata || debugData.testFetch?.metadata;
                            return (
                              <>
                                <div>Difficulty: <span className="text-white">{meta.difficulty}</span></div>
                                <div>Total Found: <span className="text-white">{meta.totalFound}</span></div>
                                <div>After Filtering: <span className="text-white">{meta.filteredByDifficulty}</span></div>
                                <div>Final Count: <span className="text-white">{meta.finalCount}</span></div>
                                {meta.playerCount && (
                                  <>
                                    <div>Player Count: <span className="text-white">{meta.playerCount}</span></div>
                                    <div>Min Songs Needed: <span className="text-white">{meta.minSongsNeeded}</span></div>
                                    <div>Has Enough Songs: <span className={meta.hasEnoughSongs ? "text-green-400" : "text-red-400"}>{meta.hasEnoughSongs ? "Yes" : "No"}</span></div>
                                  </>
                                )}
                                {meta.warning && (
                                  <div className="bg-yellow-900 bg-opacity-50 p-2 rounded mt-2">
                                    <div className="text-yellow-300 font-medium">Warning:</div>
                                    <div className="text-yellow-200 text-xs">{meta.warning}</div>
                                  </div>
                                )}
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

                    {/* Sample Songs */}
                    {(debugData.lastFetch?.tracks || debugData.testFetch?.tracks) && (
                      <div>
                        <h4 className="text-yellow-300 font-medium mb-2">Sample Songs (first 10):</h4>
                        <div className="space-y-1">
                          {(debugData.lastFetch?.tracks || debugData.testFetch?.tracks)
                            .slice(0, 10)
                            .map((song, index) => (
                              <div key={index} className="text-gray-300 border-l-2 border-gray-600 pl-2">
                                <div className="text-white font-medium">{song.title}</div>
                                <div className="text-gray-400">
                                  {song.artist} • {song.year} • Pop: {song.popularity || 'N/A'} • {song.genre}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Fetch History */}
                    {debugData.history && debugData.history.length > 0 && (
                      <div>
                        <h4 className="text-yellow-300 font-medium mb-2">Recent Fetches:</h4>
                        <div className="space-y-2">
                          {debugData.history.slice(0, 3).map((fetch, index) => (
                            <div key={index} className="bg-gray-700 p-2 rounded">
                              <div className="text-white text-xs">
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

                    {/* Raw Data Toggle */}
                    <details className="mt-3">
                      <summary className="text-yellow-300 cursor-pointer text-xs">Show Raw Data</summary>
                      <pre className="text-xs text-gray-400 mt-2 whitespace-pre-wrap break-words">
                        {JSON.stringify(debugData, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GameSettings;
