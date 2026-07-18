import React, { useState } from 'react';
import NodeLabel from './NodeLabel';
import { NODE_SIZE, NODE_CORNER_RADIUS } from './timelineLayout';

const COLORS = {
  correct: { outline: '#22C55E', rgb: '34, 197, 94' },
  incorrect: { outline: '#EF4444', rgb: '239, 68, 68' },
};

// Revealed card on the timeline (iOS ArtNode): 40px album-art tile with a
// subtle white outline; green/red 3px outline + glow on reveal, with a
// double expanding ripple ring for correct placements only.
function ArtNode({ card, colorState = 'normal', label, onClick }) {
  const [imgFailed, setImgFailed] = useState(false);
  const result = COLORS[colorState];
  const artUrl = card.album_art || card.albumArt;

  const border = result
    ? `3px solid ${result.outline}`
    : '1.5px solid rgba(255, 255, 255, 0.25)';
  const glow = result
    ? `0 0 5px rgba(${result.rgb}, 0.7), 0 0 12px rgba(${result.rgb}, 0.3)`
    : 'none';

  return (
    <div
      className="absolute"
      style={{
        left: -NODE_SIZE / 2,
        top: -NODE_SIZE / 2,
        width: NODE_SIZE,
        height: NODE_SIZE,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      {colorState === 'correct' && (
        <>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: NODE_CORNER_RADIUS,
              border: '2.5px solid #22C55E',
              animation: 'beat-ripple 2.5s ease-out 0.05s infinite',
              opacity: 0,
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: NODE_CORNER_RADIUS,
              border: '2px solid #22C55E',
              animation: 'beat-ripple 2.5s ease-out 0.9s infinite',
              opacity: 0,
            }}
          />
        </>
      )}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          borderRadius: NODE_CORNER_RADIUS,
          border,
          boxShadow: glow,
          backgroundColor: '#3A3B58',
        }}
      >
        {artUrl && !imgFailed && (
          <img
            src={artUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        )}
      </div>
      {label != null && <NodeLabel text={label} />}
    </div>
  );
}

export default ArtNode;
