import React, { useState, useEffect } from "react";
import { API_BASE_URL } from './config';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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

  // Remove showAdvancedSettings state since we're making all settings visible
  const [useChartMode, setUseChartMode] = useState(settings?.useChartMode ?? false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSongsButton, setShowSongsButton] = useState(false);
  const [activeHandle, setActiveHandle] = useState(null);
  const trackRef = React.useRef(null);
  // Keep a ref to the active handle so pointer events can be coordinated
  const activeHandleRef = React.useRef(null);

  // Enhanced carousel state management
  const carouselRef = React.useRef(null);
  const carouselStartXRef = React.useRef(null);
  const carouselStartTimeRef = React.useRef(null);
  const carouselLastXRef = React.useRef(null);
  const carouselVelocityRef = React.useRef(0);
  const carouselActiveRef = React.useRef(false);
  const animationFrameRef = React.useRef(null);
  
  // Real-time drag position state
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

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
  
  // Track which handle is currently active so we can put it on top for pointer events.
  useEffect(() => {
    const clear = () => setActiveHandle(null);
    window.addEventListener('mouseup', clear);
    window.addEventListener('touchend', clear);
    return () => {
      window.removeEventListener('mouseup', clear);
      window.removeEventListener('touchend', clear);
    };
  }, []);
  
  const handleChange = (key, value) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  // Playing mode change handler (stored at top-level of settings to keep payload small)
  const handlePlayingModeChange = (isBillboardMode) => {
    setUseChartMode(isBillboardMode);
    const updated = { ...localSettings, useChartMode: isBillboardMode };
    setLocalSettings(updated);
    onUpdate(updated);
  };

  // iOS-style carousel physics and animation
  const animateToPosition = (targetOffset, duration = 300) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    setIsAnimating(true);
    const startOffset = dragOffset;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // iOS-style spring easing
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentOffset = startOffset + (targetOffset - startOffset) * easeProgress;
      
      setDragOffset(currentOffset);
      
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        setDragOffset(targetOffset);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  // Enhanced carousel event handlers with real-time feedback
  const onCarouselStart = (e) => {
    const clientX = getClientXFromEvent(e);
    if (clientX == null) return;
    
    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsAnimating(false);
    
    carouselStartXRef.current = clientX;
    carouselStartTimeRef.current = Date.now();
    carouselLastXRef.current = clientX;
    carouselVelocityRef.current = 0;
    carouselActiveRef.current = true;
    
    e.preventDefault();
  };

  const onCarouselMove = (e) => {
    if (!carouselActiveRef.current || carouselStartXRef.current == null) return;
    
    const clientX = getClientXFromEvent(e);
    if (clientX == null) return;
    
    const currentTime = Date.now();
    const deltaX = clientX - carouselStartXRef.current;
    
    // Calculate velocity for momentum
    if (carouselLastXRef.current != null) {
      const timeDelta = currentTime - (carouselStartTimeRef.current || currentTime);
      if (timeDelta > 0) {
        carouselVelocityRef.current = (clientX - carouselLastXRef.current) / timeDelta;
      }
    }
    
    carouselLastXRef.current = clientX;
    
    // Apply rubber band effect at boundaries
    let constrainedDelta = deltaX;
    const maxDrag = 100; // Maximum drag distance beyond boundaries
    
    if (!chartModeActive && deltaX > 0) {
      // Dragging right when Spotify is active (at right boundary)
      constrainedDelta = maxDrag * (1 - Math.exp(-deltaX / maxDrag));
    } else if (chartModeActive && deltaX < 0) {
      // Dragging left when Billboard is active (at left boundary)
      constrainedDelta = -maxDrag * (1 - Math.exp(deltaX / maxDrag));
    }
    
    // Real-time drag feedback
    setDragOffset(constrainedDelta);
  };

  const onCarouselEnd = (e) => {
    if (!carouselActiveRef.current) return;
    
    const velocity = carouselVelocityRef.current || 0;
    const currentDelta = dragOffset;
    
    // Determine target based on velocity and position
    let targetMode = chartModeActive;
    const velocityThreshold = 0.5; // px/ms
    const positionThreshold = 50; // px
    
    if (Math.abs(velocity) > velocityThreshold) {
      // High velocity - use velocity direction
      targetMode = velocity > 0; // Right swipe = Billboard (true)
    } else if (Math.abs(currentDelta) > positionThreshold) {
      // Low velocity - use position threshold
      targetMode = currentDelta > 0; // Right drag = Billboard (true)
    }
    
    // Reset drag offset immediately for smooth CSS transition
    setDragOffset(0);
    
    // Update mode immediately if changed (no delay for smooth carousel behavior)
    if (targetMode !== chartModeActive) {
      handlePlayingModeChange(targetMode);
    }
    
    // Reset carousel state
    carouselStartXRef.current = null;
    carouselStartTimeRef.current = null;
    carouselLastXRef.current = null;
    carouselVelocityRef.current = 0;
    carouselActiveRef.current = false;
    
    e.preventDefault();
  };

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

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

  // Year range slider handlers (5-year steps, enforce minimum gap of 5 years)
  const handleYearMinChange = (raw) => {
    const currentMax = localSettings.musicPreferences.yearRange.max;
    const clamped = Math.min(Math.max(1960, raw), currentMax - 5);
    handleMusicPreferenceChange('yearRange', { ...localSettings.musicPreferences.yearRange, min: clamped });
  };

  const handleYearMaxChange = (raw) => {
    const currentMin = localSettings.musicPreferences.yearRange.min;
    const clamped = Math.max(Math.min(2025, raw), currentMin + 5);
    handleMusicPreferenceChange('yearRange', { ...localSettings.musicPreferences.yearRange, max: clamped });
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

  // Helper to compute background for dual-range track (selected range highlight)
  const computeRangePercentages = () => {
    const min = localSettings.musicPreferences.yearRange.min;
    const max = localSettings.musicPreferences.yearRange.max;
    const minPct = ((min - 1960) / (2025 - 1960)) * 100;
    const maxPct = ((max - 1960) / (2025 - 1960)) * 100;
    return { minPct, maxPct };
  };

  const computeRangeBackground = () => {
    const { minPct, maxPct } = computeRangePercentages();
    const minP = Math.round(minPct);
    const maxP = Math.round(maxPct);
    return `linear-gradient(to right, #4b5563 ${minP}%, #10b981 ${minP}%, #10b981 ${maxP}%, #4b5563 ${maxP}%)`;
  };

  // Helpers to restrict grabbing to near the visible handle/thumb.
  const getClientXFromEvent = (e) => {
    if (!e) return null;
    if (e.touches && e.touches[0]) return e.touches[0].clientX;
    return e.clientX ?? null;
  };

  const isNearHandle = (handle, clientX, thresholdPx = 20) => {
    if (!trackRef?.current || clientX == null) return false;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    const { minPct, maxPct } = computeRangePercentages();
    const targetPct = handle === 'min' ? minPct : maxPct;
    const pxDist = Math.abs((pct - targetPct) / 100 * rect.width);
    return pxDist <= thresholdPx;
  };

  const handlePointerDown = (e, handle) => {
    const clientX = getClientXFromEvent(e);
    if (!isNearHandle(handle, clientX)) {
      // Prevent native range from jumping to clicked position when user clicks the track
      e.preventDefault?.();
      return;
    }
    setActiveHandle(handle);
    activeHandleRef.current = handle;
  };

  const handleTouchStart = (e, handle) => {
    const clientX = getClientXFromEvent(e);
    if (!isNearHandle(handle, clientX)) {
      e.preventDefault?.();
      return;
    }
    setActiveHandle(handle);
    activeHandleRef.current = handle;
  };

  // Start a drag session on a handle (badge). Updates value during pointer move.
  const startDrag = (handle, e) => {
    const clientX = getClientXFromEvent(e);
    // Allow a slightly larger grab area when starting from the badge
    if (!isNearHandle(handle, clientX, 30)) {
      e.preventDefault?.();
      return;
    }
    setActiveHandle(handle);
    activeHandleRef.current = handle;

    const onMove = (evt) => {
      const cx = getClientXFromEvent(evt);
      if (cx == null || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      let pct = (cx - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));
      // Map pct to nearest 5-year step between 1960 and 2025
      const range = 2025 - 1960;
      const raw = Math.round((pct * range) / 5) * 5 + 1960;
      const value = Math.min(2025, Math.max(1960, raw));
      if (handle === 'min') {
        handleYearMinChange(value);
      } else {
        handleYearMaxChange(value);
      }
    };

    const onEnd = () => {
      setActiveHandle(null);
      activeHandleRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
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
    <div className="space-y-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 30px)" }}>
      {/* Playing Mode - Enhanced iOS-style Carousel */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Playing Mode</Label>
        <div className="relative h-48 overflow-hidden -mx-4"> {/* Fixed height container, extends beyond parent padding */}
          <div 
            ref={carouselRef}
            className="absolute inset-0"
            style={{ touchAction: 'pan-y' }}
            onTouchStart={onCarouselStart}
            onTouchMove={onCarouselMove}
            onTouchEnd={onCarouselEnd}
            onMouseDown={onCarouselStart}
            onMouseMove={onCarouselMove}
            onMouseUp={onCarouselEnd}
          >
            <div 
              className="flex h-full"
              style={{ 
                transform: `translateX(calc(${chartModeActive ? '7%' : '-27%'} + ${dragOffset}px))`,
                width: '200%',
                transition: isAnimating || carouselActiveRef.current ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
              }}
            >
              {/* Billboard Mode Card */}
              <div 
                className="flex-shrink-0 flex flex-col justify-center"
                style={{ width: '35%', paddingLeft: '16px', paddingRight: '8px' }}
                onClick={() => !carouselActiveRef.current && handlePlayingModeChange(true)}
              >
                <div className="space-y-3">
                  <div className={`
                    relative h-32 rounded-xl border-2 overflow-hidden cursor-pointer
                    transition-all duration-300 ease-out
                    ${chartModeActive 
                      ? 'border-primary shadow-xl scale-105 opacity-100' 
                      : 'border-border shadow-md scale-95 opacity-80'
                    }
                  `}>
                    <img 
                      src="/img/spotify-mode.jpg" 
                      alt="Billboard Mode"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-center px-2">
                    <h3 className={`font-semibold text-sm transition-colors duration-200 ${
                      chartModeActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      Billboard Mode
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1">Chart hits & classics</p>
                  </div>
                </div>
              </div>

              {/* Spotify Mode Card */}
              <div 
                className="flex-shrink-0 flex flex-col justify-center"
                style={{ width: '35%', paddingLeft: '8px', paddingRight: '16px' }}
                onClick={() => !carouselActiveRef.current && handlePlayingModeChange(false)}
              >
                <div className="space-y-3">
                  <div className={`
                    relative h-32 rounded-xl border-2 overflow-hidden cursor-pointer
                    transition-all duration-300 ease-out
                    ${!chartModeActive 
                      ? 'border-primary shadow-xl scale-105 opacity-100' 
                      : 'border-border shadow-md scale-95 opacity-80'
                    }
                  `}>
                    <img 
                      src="/img/billboard-mode.jpg" 
                      alt="Spotify Mode"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-center px-2">
                    <h3 className={`font-semibold text-sm transition-colors duration-200 ${
                      !chartModeActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}>
                      Spotify Mode
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1">Discovery & variety</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Difficulty */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Difficulty</Label>
        <div className="grid grid-cols-3 gap-2">
          {['easy', 'normal', 'hard'].map(level => (
            <Button
              key={level}
              variant={localSettings.difficulty === level ? "default" : "ghost"}
              size="sm"
              className="h-10 touch-button setting-button border border-border"
              onClick={() => handleChange('difficulty', level)}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
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

      {/* Genre Selection - Hidden when Chart Mode is active */}
      {!chartModeActive && (
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
                {genre === 'r&b' ? 'R&B' : (genre.charAt(0).toUpperCase() + genre.slice(1))}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Geography/Markets - Hidden when Chart Mode is active */}
      {!chartModeActive && (
        <div className="space-y-3">
          <Label className="text-xl font-semibold text-foreground">Geography</Label>
          <div className="grid grid-cols-2 gap-2">
            {availableMarkets.map(market => (
              <Button
                key={market.code}
                variant={localSettings.musicPreferences.markets.includes(market.code) ? "default" : "ghost"}
                className={`h-10 text-sm justify-start touch-button setting-button border border-border ${
                  !localSettings.musicPreferences.markets.includes(market.code) ? 'focus:ring-0 focus:bg-transparent' : ''
                }`}
                onClick={() => handleMarketToggle(market.code)}
              >
                {market.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Reset to Defaults (inline text action) */}
      <div className="flex justify-center">
        <a
          href="#reset"
          onClick={(e) => {
            e.preventDefault();
            const defaultSettings = {
              difficulty: "normal",
              winCondition: 10,
              useChartMode: false,
              musicPreferences: {
                genres: ['pop', 'rock', 'hip-hop', 'electronic', 'r&b'],
                yearRange: { min: 1960, max: 2025 },
                markets: ['US']
              }
            };
            setLocalSettings(defaultSettings);
            setUseChartMode(false);
            onUpdate(defaultSettings);
          }}
          role="button"
          className="inline-link-button"
          aria-label="Reset settings to defaults"
        >
          <svg
            className="w-4 h-4 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path d="M21 12a9 9 0 1 1-3-6.708" />
            <path d="M21 3v6h-6" />
          </svg>
          Reset
        </a>
      </div>
    </div>
  );
}

export default GameSettings;
