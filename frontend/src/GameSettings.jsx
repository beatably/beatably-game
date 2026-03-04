import { useState, useEffect } from "react";
import { API_BASE_URL } from './config';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePreviewMode } from './contexts/PreviewModeContext';

function GameSettings({ settings, onUpdate, isGameStarted }) {
  const [localSettings, setLocalSettings] = useState(settings || {
    difficulty: "easy",
    winCondition: 10,
    musicPreferences: {
      genres: ['pop', 'indie', 'rock', 'electronic', 'hip-hop'],
      yearRange: { min: 1960, max: 2025 },
      markets: ['international']
    }
  });

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
      difficulty: "easy",
      winCondition: 10,
      musicPreferences: {
        genres: ['pop', 'indie', 'rock', 'electronic', 'hip-hop'],
        yearRange: { min: 1960, max: 2025 },
        markets: ['international']
      }
    });
  }, [settings]);

  const handleChange = (key, value) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  // Preview mode context
  const { isFullPlayMode, setFullPlayMode } = usePreviewMode();

  // Check for canceled Spotify auth on component mount
  useEffect(() => {
    // If user returned without access token but had pending full play mode, they canceled
    if (localStorage.getItem('pending_full_play_mode') === 'true' && !localStorage.getItem('access_token')) {
      console.log('[GameSettings] Spotify auth was canceled, resetting full play mode');
      localStorage.removeItem('pending_full_play_mode');
      setFullPlayMode(false);
    }
  }, [setFullPlayMode]);

  // Full play mode toggle handler
  const handleFullPlayModeToggle = () => {
    const newValue = !isFullPlayMode;
    
    // If disabling, just turn it off
    if (!newValue) {
      setFullPlayMode(newValue);
      return;
    }
    
    // If enabling full play mode and no Spotify token, trigger auth
    if (newValue && !localStorage.getItem('access_token')) {
      console.log('[GameSettings] Use Spotify Account enabled, triggering Spotify auth');
      // Save current settings before redirect
      localStorage.setItem('pending_full_play_mode', 'true');
      // Redirect to Spotify auth
      window.location.href = `${API_BASE_URL}/login`;
    } else {
      // Already has token, just enable
      setFullPlayMode(newValue);
    }
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

  // Decade button selection handler
  // Behavior:
  // - Clicking a decade lower than the current min extends the min to that decade
  // - Clicking a decade higher than the current max extends the max to that decade + 9 (end of decade)
  // - Clicking a decade inside the current range collapses the range to that single decade (decade to decade + 9)
  const handleDecadeClick = (decade) => {
    const currentMin = localSettings.musicPreferences.yearRange.min;
    const currentMax = localSettings.musicPreferences.yearRange.max;

    // CRITICAL FIX: Convert decade to decade range (e.g., 1990 -> 1990-1999, 2020 -> 2020-2029)
    const decadeEnd = decade + 9;

    if (decade < currentMin) {
      handleMusicPreferenceChange('yearRange', { ...localSettings.musicPreferences.yearRange, min: decade });
      return;
    }
    if (decadeEnd > currentMax) {
      handleMusicPreferenceChange('yearRange', { ...localSettings.musicPreferences.yearRange, max: decadeEnd });
      return;
    }

    // Clicked inside current range -> collapse to single decade range
    handleMusicPreferenceChange('yearRange', { ...localSettings.musicPreferences.yearRange, min: decade, max: decadeEnd });
  };

  const availableGenres = [
    'pop', 'indie', 'rock', 'electronic', 'hip-hop'
  ];

  const availableGameModes = [
    { code: 'se', name: 'Swedish Only', description: 'Local Swedish hits' },
    { code: 'intl-se', name: 'International + Swedish', description: 'Mix of both' },
    { code: 'international', name: 'International Only', description: 'Global hits' }
  ];

  const isAdvanced = localSettings.difficulty === 'advanced';

  return (
    <div className="space-y-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 30px)" }}>
      {/* Difficulty */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Difficulty</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'easy', label: 'Easy', description: 'Top chart hits' },
            { value: 'advanced', label: 'Advanced', description: 'All songs + genres' }
          ].map(({ value, label, description }) => (
            <Button
              key={value}
              variant={localSettings.difficulty === value ? "default" : "ghost"}
              size="sm"
              className="h-auto py-3 flex flex-col touch-button setting-button border border-border"
              onClick={() => handleChange('difficulty', value)}
            >
              <span className="font-semibold">{label}</span>
              <span className="text-xs opacity-70 mt-0.5">{description}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Win Condition */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Cards to Win</Label>
        <div className="grid grid-cols-3 gap-2">
          {[8, 10, 12].map(cardCount => (
            <Button
              key={cardCount}
              variant={(localSettings.winCondition ?? 10) === cardCount ? "default" : "ghost"}
              size="sm"
              className="h-10 touch-button border border-border"
              onClick={() => {
                const updated = { ...localSettings, winCondition: cardCount };
                setLocalSettings(updated);
                onUpdate(updated);
              }}
            >
              {cardCount} cards
            </Button>
          ))}
        </div>
      </div>

      {/* Year Range */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Year Range</Label>
        <div className="grid grid-cols-4 gap-1">
          {[1960, 1970, 1980, 1990, 2000, 2010, 2020].map(decade => {
            const min = localSettings.musicPreferences.yearRange.min;
            const max = localSettings.musicPreferences.yearRange.max;
            const active = decade >= min && decade <= max;
            return (
              <Button
                key={decade}
                variant={active ? "default" : "ghost"}
                className="h-10 text-sm touch-button setting-button border border-border"
                onClick={() => handleDecadeClick(decade)}
              >
                {decade}s
              </Button>
            );
          })}
        </div>
      </div>

      {/* Genre Selection - Advanced mode only */}
      {isAdvanced && (
        <div className="space-y-3">
          <Label className="text-xl font-semibold text-foreground">Music Genres</Label>
          <div className="grid grid-cols-2 gap-2">
            {availableGenres.map(genre => (
              <Button
                key={genre}
                variant={localSettings.musicPreferences.genres.includes(genre) ? "default" : "ghost"}
                className={`h-10 text-sm justify-start touch-button setting-button border border-border ${
                  !localSettings.musicPreferences.genres.includes(genre) ? 'focus:ring-0 focus:bg-transparent' : ''
                }`}
                onClick={() => handleGenreToggle(genre)}
              >
                {genre.charAt(0).toUpperCase() + genre.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Music Selection - visible in both modes */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Music Selection</Label>
        <div className="grid grid-cols-1 gap-2">
          {availableGameModes.map(mode => {
            const currentMarkets = localSettings.musicPreferences.markets || [];
            const isActive = (() => {
              if (mode.code === 'se') {
                return currentMarkets.length === 1 && currentMarkets.includes('SE');
              } else if (mode.code === 'international') {
                return !currentMarkets.includes('SE') &&
                       (currentMarkets.includes('international') || currentMarkets.includes('INTL'));
              } else if (mode.code === 'intl-se') {
                return currentMarkets.includes('SE') &&
                       (currentMarkets.includes('international') || currentMarkets.includes('INTL'));
              }
              return false;
            })();
            return (
              <Button
                key={mode.code}
                variant={isActive ? "default" : "ghost"}
                className={`h-auto py-3 text-left justify-start touch-button setting-button border border-border ${
                  !isActive ? 'focus:ring-0 focus:bg-transparent' : ''
                }`}
                onClick={() => {
                  let newMarkets;
                  if (mode.code === 'se') newMarkets = ['SE'];
                  else if (mode.code === 'international') newMarkets = ['international'];
                  else if (mode.code === 'intl-se') newMarkets = ['SE', 'international'];
                  handleMusicPreferenceChange('markets', newMarkets);
                }}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{mode.name}</span>
                  <span className="text-xs text-muted-foreground">{mode.description}</span>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Use Spotify Account - Last Setting */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xl font-semibold text-foreground">Use Spotify account</Label>
          <button
            onClick={handleFullPlayModeToggle}
            disabled={isGameStarted}
            type="button"
            className={`
              relative inline-flex h-8 w-[51px] min-w-0 min-h-0 items-center rounded-full 
              transition-colors duration-200 ease-in-out p-0
              ${isGameStarted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${isFullPlayMode ? 'bg-[#7D3BED]' : 'bg-gray-400'}
            `}
            role="switch"
            aria-checked={isFullPlayMode}
            aria-label={`Toggle Spotify account ${isFullPlayMode ? 'off' : 'on'}`}
          >
            <span
              className={`
                inline-block h-7 w-7 transform rounded-full bg-white shadow-lg 
                transition-transform duration-200 ease-in-out
                ${isFullPlayMode ? 'translate-x-[20px]' : 'translate-x-0.5'}
              `}
            />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          This will enable full-length tracks and playback on other devices. An invite from the Game Developer is required, and you will need to login with your Spotify account.
        </p>
      </div>

      {/* Reset to Defaults (inline text action) */}
      <div className="flex justify-center">
        <button
          onClick={(e) => {
            e.preventDefault();
            const defaultSettings = {
              difficulty: "easy",
              winCondition: 10,
              musicPreferences: {
                genres: ['pop', 'indie', 'rock', 'electronic', 'hip-hop'],
                yearRange: { min: 1960, max: 2025 },
                markets: ['international']
              }
            };
            setLocalSettings(defaultSettings);
            onUpdate(defaultSettings);
          }}
          aria-label="Reset settings to defaults"
          className="text-foreground underline font-semibold text-sm p-2 -m-2 hover:text-foreground/80 focus:outline-none"
        >
          <svg
            className="w-4 h-4 text-muted-foreground mr-2 inline"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3-6.708" />
            <path d="M21 3v6h-6" />
          </svg>
          Reset
        </button>
      </div>

    </div>
  );
}

export default GameSettings;
