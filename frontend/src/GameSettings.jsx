import React, { useState, useEffect } from "react";
import { API_BASE_URL } from './config';

function GameSettings({ settings, onUpdate }) {
  const [localSettings, setLocalSettings] = useState(settings || {
    difficulty: "normal",
    // Default win condition if not provided
    winCondition: 10,
    musicPreferences: {
      genres: ['pop', 'rock', 'hip-hop', 'electronic', 'r&b'],
      yearRange: { min: 1960, max: 2025 },
      markets: ['US']
    }
  });

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [useChartMode, setUseChartMode] = useState(settings?.useChartMode ?? false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSongsButton, setShowSongsButton] = useState(false);

  useEffect(() => {
    // If incoming settings exist, normalize their musicPreferences.genres to lowercase
    if (settings) {
      const incomingGenres = (settings.musicPreferences?.genres || []).map(g => String(g || '').toLowerCase());
      const normalizedSettings = {
        ...settings,
        musicPreferences: {
          ...settings.musicPreferences,
          genres: Array.from(new Set(incomingGenres))
        }
      };
      setLocalSettings(normalizedSettings);
      return;
    }

    // Otherwise use our normalized defaults
    setLocalSettings({
      difficulty: "normal",
      winCondition: 10,
      musicPreferences: {
        // Normalize genres to lowercase canonical tags to avoid mismatches (e.g. 'r&b' vs 'R&B')
        genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie', 'r&b', 'reggae', 'funk', 'country', 'jazz', 'alternative'],
        yearRange: { min: 1960, max: 2025 },
        markets: ['US']
      }
    });
  }, [settings]);

  // Load showSongsButton state from localStorage
  useEffect(() => {
    const savedShowSongsButton = localStorage.getItem('showSongsButton');
    if (savedShowSongsButton !== null) {
      setShowSongsButton(savedShowSongsButton === 'true');
    }
  }, []);

  const handleChange = (key, value) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  // Chart mode toggle handler (stored at top-level of settings to keep payload small)
  const handleChartToggle = (checked) => {
    setUseChartMode(checked);
    const updated = { ...localSettings, useChartMode: checked };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  const handleMusicPreferenceChange = (key, value) => {
    // Normalize genres array to lowercase when updating
    let newVal = value;
    if (key === 'genres' && Array.isArray(value)) {
      newVal = Array.from(new Set(value.map(g => String(g || '').toLowerCase())));
    }

    const updated = {
      ...localSettings,
      musicPreferences: {
        ...localSettings.musicPreferences,
        [key]: newVal
      }
    };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  const handleGenreToggle = (genre) => {
    // Normalize genre keys to lowercase internal form
    const key = String(genre || '').toLowerCase();
    const currentGenres = (localSettings.musicPreferences.genres || []).map(g => String(g || '').toLowerCase());
    let newGenres;
    if (currentGenres.includes(key)) {
      newGenres = currentGenres.filter(g => g !== key);
    } else {
      newGenres = [...currentGenres, key];
    }

    // Deduplicate and keep ordering stable
    newGenres = Array.from(new Set(newGenres));

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

  const chartModeActive = localSettings.useChartMode ?? useChartMode;

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
      const effectiveChartMode = localSettings.useChartMode ?? useChartMode;
      console.log('[DebugPanel] Sending fetch request with:', {
        musicPreferences: localSettings.musicPreferences,
        difficulty: localSettings.difficulty,
        useChartMode: effectiveChartMode
      });
      
      const response = await fetch(`${API_BASE_URL}/api/fetch-songs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          musicPreferences: localSettings.musicPreferences,
          difficulty: localSettings.difficulty,
          useChartMode: effectiveChartMode
        })
      });
      const data = await response.json();
      console.log('[DebugPanel] Received fetch response:', data);
      setDebugData({ testFetch: data, timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Error testing song fetch:', error);
      setDebugData({ error: 'Failed to test song fetch' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-none p-3 rounded mb-20">
      <h3 className="font-medium mb-6">Game Settings</h3>
      
      {/* Basic Game Settings - Top Priority */}
      <div className="space-y-4 mb-8">
        {/* Chart Hits Mode */}
        <div className="mb-2">
          <label className="flex items-center space-x-2 text-white text-sm font-medium">
            <input
              type="checkbox"
              checked={useChartMode}
              onChange={(e) => handleChartToggle(e.target.checked)}
              className="rounded"
            />
            <span>Chart Hits Mode</span>
          </label>
          <p className="text-xs text-gray-400 mt-1">
            When enabled, playlists are built from Billboard Hot 100 charts (remote source with a small local fallback). Genre filters may be limited.
          </p>
        </div>

        {/* Difficulty - 3-way button selection */}
        <div>
          <label className="block text-white mb-2 text-sm text-left font-medium">DIFFICULTY</label>
          <div className="grid grid-cols-3 gap-1">
            {['easy', 'normal', 'hard'].map(level => (
              <button
                key={level}
                onClick={() => handleChange('difficulty', level)}
                className={`py-2 mb-4 px-3 rounded text-sm font-medium transition-all ${
                  localSettings.difficulty === level
                    ? 'bg-green-700 text-white shadow-lg'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500 hover:text-white'
                }`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Year Range - Always visible */}
        <div>
          <label className="block text-white mb-2 text-sm font-medium text-left">YEAR RANGE</label>
          {chartModeActive && (
            <div className="text-xs text-yellow-400 mb-2">
              Year range does not filter Chart Hits; chart dates determine year.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                type="number"
                min="1950"
                max="2025"
                value={localSettings.musicPreferences.yearRange.min}
                onChange={e => handleMusicPreferenceChange('yearRange', {
                  ...localSettings.musicPreferences.yearRange,
                  min: parseInt(e.target.value)
                })}
                disabled={chartModeActive}
                className="w-full p-2 rounded text-black text-sm disabled:bg-gray-300"
              />
            </div>
            <div>
              <input
                type="number"
                min="1950"
                max="2025"
                value={localSettings.musicPreferences.yearRange.max}
                onChange={e => handleMusicPreferenceChange('yearRange', {
                  ...localSettings.musicPreferences.yearRange,
                  max: parseInt(e.target.value)
                })}
                disabled={chartModeActive}
                className="w-full p-2 rounded text-black text-sm disabled:bg-gray-300"
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Advanced Settings - Collapsible */}
      <div className="pt-3">
        <button
          onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          className="w-full flex items-center justify-between py-2 px-3 bg-gray-900 hover:bg-gray-800 border-green-700 rounded text-sm font-medium transition-all"
        >
          <span>Advanced Settings</span>
          <span className={`transform transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {showAdvancedSettings && (
          <div className="mt-3 space-y-4">
            {/* Win Condition */}
            <div>
              <label className="block text-gray-300 mb-2 text-sm font-medium">Cards to Win</label>
              <input
                type="number"
                min="1"
                max="50"
                value={localSettings.winCondition ?? 10}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  // Clamp and sanitize
                  const value = Number.isFinite(raw) ? Math.min(50, Math.max(1, raw)) : 10;
                  const updated = { ...localSettings, winCondition: value };
                  setLocalSettings(updated);
                  onUpdate(updated);
                }}
                className="w-full p-2 rounded text-black text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                First player to reach this many cards in the timeline wins. Default is 10.
              </p>
            </div>
            {/* Genre Selection */}
            <div>
              <label className="block text-gray-300 mb-1 text-sm font-medium">Music Genres</label>
              {chartModeActive && (
                <div className="text-xs text-yellow-400 mb-2">
                  Genres are not applied in Chart Hits Mode.
                </div>
              )}
              <div className={`grid grid-cols-2 gap-2 ${chartModeActive ? 'opacity-50 pointer-events-none' : ''}`}>
                {availableGenres.map(genre => (
                  <button
                    key={genre}
                    onClick={() => handleGenreToggle(genre)}
                    disabled={chartModeActive}
                    className={`py-2 px-3 rounded text-sm font-medium transition-all text-left ${
                      localSettings.musicPreferences.genres.includes(genre)
                        ? 'bg-green-600 text-white shadow-lg'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500 hover:text-white'
                    }`}
                  >
                    <span>
                      {genre === 'r&b' ? 'R&B' : (genre.charAt(0).toUpperCase() + genre.slice(1))}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Geography/Markets */}
            <div>
              <label className="block text-gray-300 mb-1 text-sm font-medium">Geography</label>
              {chartModeActive && (
                <div className="text-xs text-yellow-400 mb-2">
                  In Chart Hits Mode, market selection only affects Spotify resolution market.
                </div>
              )}
              <div className={`space-y-2 ${chartModeActive ? 'opacity-50 pointer-events-none' : ''}`}>
                {availableMarkets.map(market => (
                  <button
                    key={market.code}
                    onClick={() => handleMarketToggle(market.code)}
                    disabled={chartModeActive}
                    className={`w-full py-2 px-3 rounded text-sm font-medium transition-all text-left ${
                      localSettings.musicPreferences.markets.includes(market.code)
                        ? 'bg-green-600 text-white shadow-lg'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500 hover:text-white'
                    }`}
                  >
                    {market.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset to Defaults */}
            <button
              onClick={() => handleMusicPreferenceChange('', {
                genres: ['pop', 'rock', 'hip-hop', 'electronic', 'r&b'],
                yearRange: { min: 1960, max: 2025 },
                markets: ['US']
              })}
              className="w-full py-2 px-3 bg-gray-600 hover:bg-gray-500 rounded text-sm transition"
            >
              Reset to Defaults
            </button>

            {/* Debug Panel */}
            <div className="pt-3">
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

                  {/* Show Songs Button Toggle */}
                  <div className="flex items-center space-x-2 p-2 bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      id="showSongsButton"
                      checked={showSongsButton}
                      onChange={(e) => {
                        setShowSongsButton(e.target.checked);
                        localStorage.setItem('showSongsButton', e.target.checked.toString());
                      }}
                      className="rounded"
                    />
                    <label htmlFor="showSongsButton" className="text-xs text-gray-300 cursor-pointer">
                      Show "All Songs" button in game footer during play
                    </label>
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
                                      {meta.totalFound !== undefined && (
                                        <div>Total Found: <span className="text-white">{meta.totalFound}</span></div>
                                      )}
                                      {meta.filteredByDifficulty !== undefined && (
                                        <div>After Filtering: <span className="text-white">{meta.filteredByDifficulty}</span></div>
                                      )}
                                      <div>Final Count: <span className="text-white">{meta.finalCount}</span></div>
                                      {meta.mode && (
                                        <div>Mode: <span className="text-white">{meta.mode}</span></div>
                                      )}
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
                                      <div className="text-white font-medium">
                                        {song.title}
                                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-700">
                                          {song.source === 'chart' ? 'Chart' : 'Spotify'}
                                        </span>
                                      </div>
                                      <div className="text-gray-400">
                                        {song.artist} • {song.year} • Pop: {song.popularity || 'N/A'} • {song.genre}
                                        {song.source === 'chart' && (song.rank || song.peakPos) && (
                                          <span className="ml-2 text-xs text-yellow-300">
                                            {song.peakPos ? `Peak #${song.peakPos}` : `Rank #${song.rank}`}
                                          </span>
                                        )}
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
        )}
      </div>
    </div>
  );
}

export default GameSettings;
