import { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from './config';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePreviewMode } from './contexts/PreviewModeContext';

const DECADES_NODES = [
  { year: 1960, label: '1960' },
  { year: 1970, label: '1970' },
  { year: 1980, label: '1980' },
  { year: 1990, label: '1990' },
  { year: 2000, label: '2000' },
  { year: 2010, label: '2010' },
  { year: 2020, label: '2020' },
  { year: 2025, label: 'Today' },
];

function nodeMaxYear(idx) {
  return DECADES_NODES[idx].year === 2025 ? 2025 : DECADES_NODES[idx].year + 9;
}

function DecadesTimeline({ min, max, onChange }) {
  const trackRef = useRef(null); // inner div — inset-x-[10px], used for coordinate mapping
  const dragging = useRef(null);
  const dragStartX = useRef(null);
  const didDrag = useRef(false);

  const last = DECADES_NODES.length - 1;

  const minIdx = Math.max(0, DECADES_NODES.findIndex(n => n.year === min));
  const maxIdx = (() => {
    for (let i = last; i >= 0; i--) {
      if (nodeMaxYear(i) === max) return i;
    }
    return DECADES_NODES.reduce((best, _, i) =>
      Math.abs(nodeMaxYear(i) - max) < Math.abs(nodeMaxYear(best) - max) ? i : best, 0);
  })();

  const xToIndex = (clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * last);
  };

  const onPointerDown = (e) => {
    didDrag.current = false;
    dragStartX.current = e.clientX;
    const idx = xToIndex(e.clientX);
    dragging.current = Math.abs(idx - minIdx) <= Math.abs(idx - maxIdx) ? 'min' : 'max';
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    // Only treat as drag after 5px of movement to preserve tap behaviour
    if (!didDrag.current && Math.abs(e.clientX - dragStartX.current) < 5) return;
    didDrag.current = true;
    const idx = xToIndex(e.clientX);
    if (dragging.current === 'min') {
      onChange(DECADES_NODES[Math.min(idx, maxIdx)].year, max);
    } else {
      onChange(min, nodeMaxYear(Math.max(idx, minIdx)));
    }
  };

  const onPointerUp = (e) => {
    // setPointerCapture prevents click events reaching child nodes,
    // so handle taps here instead of onClick on node divs.
    if (!didDrag.current) {
      const idx = xToIndex(e.clientX);
      if (idx < minIdx) onChange(DECADES_NODES[idx].year, max);
      else if (idx > maxIdx) onChange(min, nodeMaxYear(idx));
    }
    dragging.current = null;
  };

  return (
    <div
      className="relative select-none touch-pan-y"
      style={{ height: '44px' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Inner div — inset-x-[10px] so first/last node centers align with button edges */}
      <div ref={trackRef} className="absolute inset-x-[10px] top-0 bottom-0">
        {/* Track background */}
        <div
          className="absolute inset-x-0 rounded-full bg-border/40"
          style={{ height: '1px', top: '10px', transform: 'translateY(-50%)' }}
        />
        {/* Active gradient segment */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            height: '1px',
            top: '10px',
            transform: 'translateY(-50%)',
            background: 'linear-gradient(90deg, #08AF9A, #7D3BED)',
            left: `${(minIdx / last) * 100}%`,
            width: `${((maxIdx - minIdx) / last) * 100}%`,
          }}
        />
        {/* Nodes */}
        {DECADES_NODES.map((node, idx) => {
          const isMin = idx === minIdx;
          const isMax = idx === maxIdx;
          const isHandle = isMin || isMax;
          const isInner = idx > minIdx && idx < maxIdx;
          return (
            <div
              key={node.year}
              className="absolute flex flex-col items-center"
              style={{ left: `${(idx / last) * 100}%`, transform: 'translateX(-50%)', top: 0 }}
            >
              {/* Centering wrapper: always h-5, keeps circle center at 10px from top */}
              <div className="h-5 w-5 flex items-center justify-center">
                <div
                  className={`rounded-full border-2 bg-background transition-all ${
                    isInner
                      ? 'w-3 h-3 opacity-0 pointer-events-none'
                      : isHandle
                      ? 'w-5 h-5 cursor-grab active:cursor-grabbing'
                      : 'w-4 h-4 cursor-pointer'
                  }`}
                  style={{
                    borderColor: isMin ? '#08AF9A' : isMax ? '#7D3BED' : 'hsl(var(--border) / 0.5)',
                    ...(isHandle && {
                      boxShadow: `0 0 0 3px ${isMin ? 'rgba(8,175,154,0.2)' : 'rgba(125,59,237,0.2)'}`,
                    }),
                  }}
                />
              </div>
              {(isMin || isMax) && (
                <span
                  className="absolute text-[10px] font-medium text-foreground/70 whitespace-nowrap"
                  style={{ top: '22px' }}
                >
                  {node.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  const [showSpotifyConfirm, setShowSpotifyConfirm] = useState(false);

  const handleFullPlayModeToggle = () => {
    const newValue = !isFullPlayMode;

    // If disabling, just turn it off
    if (!newValue) {
      setFullPlayMode(false);
      return;
    }

    // If enabling, show confirmation first
    setShowSpotifyConfirm(true);
  };

  const confirmSpotifyEnable = () => {
    setShowSpotifyConfirm(false);
    if (!localStorage.getItem('access_token')) {
      console.log('[GameSettings] Use Spotify Account enabled, triggering Spotify auth');
      localStorage.setItem('pending_full_play_mode', 'true');
      window.location.href = `${API_BASE_URL}/login`;
    } else {
      setFullPlayMode(true);
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

  const availableGenres = [
    { id: 'pop', label: 'Pop', emoji: '🌟' },
    { id: 'indie', label: 'Indie', emoji: '🎸' },
    { id: 'rock', label: 'Rock', emoji: '🤘' },
    { id: 'electronic', label: 'Electronic', emoji: '🎛️' },
    { id: 'hip-hop', label: 'Hip-Hop', emoji: '🎤' },
  ];

  const isAdvanced = localSettings.difficulty === 'advanced';

  return (
    <>
    <div className="space-y-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 30px)" }}>
      {/* Difficulty */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Difficulty</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'easy', label: 'Easy' },
            { value: 'advanced', label: 'Advanced' }
          ].map(({ value, label }) => (
            <Button
              key={value}
              variant={localSettings.difficulty === value ? "default" : "ghost"}
              size="sm"
              className="h-10 touch-button setting-button border border-border"
              onClick={() => handleChange('difficulty', value)}
            >
              <span className="font-semibold">{label}</span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center pt-1">
          {localSettings.difficulty === 'easy'
            ? <><strong>Easy mode</strong> pulls from popular chart hits — great for casual play and mixed groups where everyone can join in.</>
            : <><strong>Advanced</strong> unlocks the full song catalogue across all genres, including deeper cuts.</>}
        </p>
      </div>

      {/* Music Selection - visible in both modes */}
      {(() => {
        const currentMarkets = localSettings.musicPreferences.markets || [];
        const activeMusicMode = (() => {
          if (currentMarkets.length === 1 && currentMarkets.includes('SE')) return 'se';
          if (currentMarkets.includes('SE') && (currentMarkets.includes('international') || currentMarkets.includes('INTL'))) return 'intl-se';
          return 'international';
        })();
        const musicDescriptions = {
          international: <><strong>Internationally</strong> charting hits — songs that made Billboard Hot 100, UK charts, and other global charts.</>,
          'intl-se': <>A <strong>blend</strong> of international chart hits and Swedish chart favourites.</>,
          se: <><strong>Swedish artists only</strong> — songs by acts originating from Sweden, from pop exports to homegrown classics.</>,
        };
        return (
          <div className="space-y-3">
            <Label className="text-xl font-semibold text-foreground">Music Selection</Label>
            <div className="px-8 grid grid-cols-3 gap-4">
              {[
                { code: 'international', name: 'International', img: '/img/intl.svg' },
                { code: 'intl-se', name: 'Mix', img: '/img/mix.svg' },
                { code: 'se', name: 'Swedish Only', img: '/img/se.svg' }
              ].map(mode => {
                const isActive = mode.code === activeMusicMode;
                return (
                  <button
                    key={mode.code}
                    style={{ aspectRatio: '4/3' }}
                    className="relative overflow-hidden rounded-md touch-button setting-button w-full"
                    onClick={() => {
                      let newMarkets;
                      if (mode.code === 'se') newMarkets = ['SE'];
                      else if (mode.code === 'international') newMarkets = ['international'];
                      else if (mode.code === 'intl-se') newMarkets = ['SE', 'international'];
                      handleMusicPreferenceChange('markets', newMarkets);
                    }}
                  >
                    <img src={mode.img} alt={mode.name} className={`absolute inset-0 w-full h-full object-cover transition-opacity ${isActive ? 'opacity-100' : 'opacity-20'}`} />
                    {isActive && (
                      <span className="absolute inset-0 rounded-md pointer-events-none" style={{
                        background: 'linear-gradient(90deg, #08AF9A, #7D3BED)',
                        padding: '3px',
                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude'
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground text-center pt-1">
              {musicDescriptions[activeMusicMode]}
            </p>
          </div>
        );
      })()}

      {/* Decades */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Decades</Label>
        <div className="pt-[10px]">
          <DecadesTimeline
            min={localSettings.musicPreferences.yearRange.min}
            max={localSettings.musicPreferences.yearRange.max}
            onChange={(min, max) => handleMusicPreferenceChange('yearRange', { min, max })}
          />
        </div>
        <p className="text-xs text-muted-foreground text-center pt-1">
          Drag the handles to set which era of songs to include
        </p>
      </div>

      {/* Genre Selection - Advanced mode only */}
      {isAdvanced && (
        <div className="space-y-3">
          <Label className="text-xl font-semibold text-foreground">Music Genres</Label>
          <div className="grid grid-cols-2 gap-2">
            {availableGenres.map(({ id, label, emoji }) => (
              <Button
                key={id}
                variant={localSettings.musicPreferences.genres.includes(id) ? "default" : "ghost"}
                className={`h-auto py-2 text-sm justify-start touch-button setting-button border border-border ${
                  !localSettings.musicPreferences.genres.includes(id) ? 'focus:ring-0 focus:bg-transparent' : ''
                }`}
                onClick={() => handleGenreToggle(id)}
              >
                <span className="text-2xl mr-2">{emoji}</span>
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Hits to Win - always last before Spotify/Reset */}
      <div className="space-y-3">
        <Label className="text-xl font-semibold text-foreground">Hits to Win</Label>
        <div className="grid grid-cols-3 gap-2">
          {[8, 10, 12].map(count => (
            <Button
              key={count}
              variant={(localSettings.winCondition ?? 10) === count ? "default" : "ghost"}
              size="sm"
              className="h-10 touch-button border border-border"
              onClick={() => {
                const updated = { ...localSettings, winCondition: count };
                setLocalSettings(updated);
                onUpdate(updated);
              }}
            >
              {count} hits
            </Button>
          ))}
        </div>
      </div>

      {/* Use Spotify Account - de-emphasised, invite-only */}
      <div className="rounded-lg border border-border/50 bg-white/5 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium text-foreground/70">Use Spotify account</Label>
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
        <p className="text-xs text-muted-foreground/70">
          Enables full-length tracks and playback on other devices. Requires an invite from the Game Developer and login with your Spotify account.
        </p>
      </div>

      {/* Reset to Defaults (inline text action) */}
      <div className="flex justify-center pt-6">
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
    {/* Spotify confirmation modal */}
    {showSpotifyConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setShowSpotifyConfirm(false)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative bg-background border border-border rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
          <h2 className="text-lg font-semibold text-foreground">Enable Spotify?</h2>
          <p className="text-sm text-muted-foreground">
            This feature requires an invite from the Game Developer and a Spotify Premium account. It enables full-length tracks and playback on other devices.
          </p>
          <p className="text-sm text-muted-foreground">
            You'll be redirected to log in with Spotify.
          </p>
          <div className="flex gap-3 pt-1">
            <Button className="flex-1" onClick={confirmSpotifyEnable}>Yes, continue</Button>
            <Button variant="ghost" className="flex-1 border border-border" onClick={() => setShowSpotifyConfirm(false)}>No, cancel</Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default GameSettings;
