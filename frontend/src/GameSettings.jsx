import React, { useState, useEffect } from "react";

function GameSettings({ settings, onUpdate }) {
  const [localSettings, setLocalSettings] = useState(settings || {
    minPlayers: 2,
    maxPlayers: 8,
    difficulty: "normal",
    timeLimit: 30,
    musicPreferences: {
      genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
      yearRange: { min: 1980, max: 2024 },
      markets: ['US'],
      limit: 50
    }
  });

  const [showMusicSettings, setShowMusicSettings] = useState(false);

  useEffect(() => {
    setLocalSettings(settings || {
      minPlayers: 2,
      maxPlayers: 8,
      difficulty: "normal",
      timeLimit: 30,
      musicPreferences: {
        genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
        yearRange: { min: 1980, max: 2024 },
        markets: ['US'],
        limit: 50
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

  return (
    <div className="bg-gray-700 p-3 rounded mb-4">
      <h3 className="font-medium mb-2">Game Settings</h3>
      
      {/* Basic Game Settings */}
      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div>
          <label className="block text-gray-300 mb-1">Min Players</label>
          <select
            className="w-full p-1 rounded text-black"
            value={localSettings.minPlayers}
            onChange={e => handleChange('minPlayers', parseInt(e.target.value))}
          >
            {[2, 3, 4].map(num => (
              <option key={num} value={num}>{num}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-gray-300 mb-1">Max Players</label>
          <select
            className="w-full p-1 rounded text-black"
            value={localSettings.maxPlayers}
            onChange={e => handleChange('maxPlayers', parseInt(e.target.value))}
          >
            {[4, 6, 8, 10].map(num => (
              <option key={num} value={num}>{num}</option>
            ))}
          </select>
        </div>
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
        <div>
          <label className="block text-gray-300 mb-1">Time Limit (sec)</label>
          <select
            className="w-full p-1 rounded text-black"
            value={localSettings.timeLimit}
            onChange={e => handleChange('timeLimit', parseInt(e.target.value))}
          >
            {[15, 30, 45, 60, 90].map(time => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
        </div>
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

            {/* Song Limit */}
            <div>
              <label className="block text-gray-300 mb-1 text-sm font-medium">Number of Songs</label>
              <select
                className="w-full p-1 rounded text-black text-xs"
                value={localSettings.musicPreferences.limit}
                onChange={e => handleMusicPreferenceChange('limit', parseInt(e.target.value))}
              >
                {[30, 40, 50, 60, 75, 100].map(num => (
                  <option key={num} value={num}>{num} songs</option>
                ))}
              </select>
            </div>

            {/* Reset to Defaults */}
            <button
              onClick={() => handleMusicPreferenceChange('', {
                genres: ['pop', 'rock', 'hip-hop', 'electronic', 'indie'],
                yearRange: { min: 1980, max: 2024 },
                markets: ['US'],
                limit: 50
              })}
              className="w-full py-1 px-2 bg-gray-600 hover:bg-gray-500 rounded text-xs transition"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameSettings;
