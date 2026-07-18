import { useState, useEffect, useRef } from "react";

// iOS-parity settings primitives (LobbyView.swift BeatSegmentPicker / SettingRow).
function SettingCard({ label, children }) {
  return (
    <div
      className="p-3.5"
      style={{ backgroundColor: '#141128', borderRadius: 10, border: '1px solid hsl(var(--border))' }}
    >
      {label && (
        <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{label}</div>
      )}
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            onTouchEnd={(e) => e.currentTarget.blur()}
            className="px-4 py-2.5 rounded-full text-sm font-semibold transition-all no-focus-outline"
            style={{
              background: selected ? 'linear-gradient(90deg, #08AF9A, #7D3BED)' : '#1E1B34',
              color: selected ? '#fff' : '#8888AA',
              border: `1px solid ${selected ? '#08AF9A' : 'hsl(var(--border))'}`,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function GuestRow({ label, value }) {
  return (
    <div
      className="flex items-center justify-between px-3.5 py-2.5 text-sm"
      style={{ backgroundColor: '#141128', borderRadius: 10, border: '1px solid hsl(var(--border))' }}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

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

function GameSettings({ settings, onUpdate, readOnly = false }) {
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
  const yearRange = localSettings.musicPreferences.yearRange;

  const currentMarkets = localSettings.musicPreferences.markets || [];
  const marketMode = (() => {
    if (currentMarkets.length === 1 && currentMarkets.includes('SE')) return 'se';
    if (currentMarkets.includes('SE') && (currentMarkets.includes('international') || currentMarkets.includes('INTL'))) return 'mix';
    return 'international';
  })();
  const marketLabel = { international: 'International', mix: 'Mix', se: 'Swedish' }[marketMode];
  const applyMarket = (mode) => {
    const markets = mode === 'se' ? ['SE'] : mode === 'mix' ? ['SE', 'international'] : ['international'];
    handleMusicPreferenceChange('markets', markets);
  };

  // ── Read-only view for guests (iOS GuestSettingsPanel) ──
  if (readOnly) {
    return (
      <div className="space-y-2.5">
        <GuestRow label="Hits to Win" value={String(localSettings.winCondition ?? 10)} />
        <GuestRow label="Market" value={marketLabel} />
        <GuestRow label="Difficulty" value={isAdvanced ? 'Advanced' : 'Easy'} />
        <GuestRow label="Years" value={`${yearRange.min} – ${yearRange.max}`} />
        {isAdvanced && localSettings.musicPreferences.genres.length > 0 && (
          <GuestRow
            label="Genres"
            value={localSettings.musicPreferences.genres
              .map((g) => (availableGenres.find((a) => a.id === g)?.label || g))
              .join(', ')}
          />
        )}
      </div>
    );
  }

  // ── Editable view for the host (iOS CreatorSettingsPanel) ──
  return (
    <div className="space-y-2.5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}>
      <SettingCard label="Hits to Win">
        <Segmented
          options={[{ label: '8', value: 8 }, { label: '10', value: 10 }, { label: '12', value: 12 }]}
          value={localSettings.winCondition ?? 10}
          onChange={(v) => handleChange('winCondition', v)}
        />
      </SettingCard>

      <SettingCard label="Market">
        <Segmented
          options={[
            { label: 'International', value: 'international' },
            { label: 'Mix', value: 'mix' },
            { label: 'Swedish', value: 'se' },
          ]}
          value={marketMode}
          onChange={applyMarket}
        />
      </SettingCard>

      <SettingCard label="Difficulty">
        <Segmented
          options={[{ label: 'Easy', value: 'easy' }, { label: 'Advanced', value: 'advanced' }]}
          value={localSettings.difficulty}
          onChange={(v) => handleChange('difficulty', v)}
        />
      </SettingCard>

      <SettingCard label={`Year Range · ${yearRange.min} – ${yearRange.max}`}>
        <div className="pt-[10px]">
          <DecadesTimeline
            min={yearRange.min}
            max={yearRange.max}
            onChange={(min, max) => handleMusicPreferenceChange('yearRange', { min, max })}
          />
        </div>
      </SettingCard>

      {isAdvanced && (
        <SettingCard label="Genres">
          <div className="flex gap-1.5 flex-wrap">
            {availableGenres.map(({ id, label }) => {
              const sel = localSettings.musicPreferences.genres.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => handleGenreToggle(id)}
                  onTouchEnd={(e) => e.currentTarget.blur()}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all no-focus-outline"
                  style={{
                    background: sel ? 'linear-gradient(90deg, #08AF9A, #7D3BED)' : '#1E1B34',
                    color: sel ? '#fff' : '#8888AA',
                    border: `1px solid ${sel ? '#08AF9A' : 'hsl(var(--border))'}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </SettingCard>
      )}

      <div className="flex justify-center pt-2">
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
          className="text-muted-foreground bg-transparent underline font-semibold text-sm p-2 -m-2 hover:text-foreground focus:outline-none"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

export default GameSettings;
