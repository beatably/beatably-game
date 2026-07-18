import React from 'react';
import NodeLabel from './NodeLabel';
import { NODE_SIZE, NODE_CORNER_RADIUS } from './timelineLayout';

// Solid magenta "?" node (iOS MysteryNode): pending placements, the hidden
// just-placed card during song-guess/challenge-window, and challenge markers.
// Two staggered ripple rings expand forever; dual magenta glow.
function MysteryNode({ size = NODE_SIZE, label, onClick }) {
  const cornerRadius = NODE_CORNER_RADIUS * (size / NODE_SIZE);
  return (
    <div
      className="absolute"
      style={{
        left: -size / 2,
        top: -size / 2,
        width: size,
        height: size,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: cornerRadius,
          border: '2px solid #FF1493',
          animation: 'beat-ripple 2.2s ease-out 0.05s infinite',
          opacity: 0,
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: cornerRadius,
          border: '1.5px solid #FF1493',
          animation: 'beat-ripple 2.2s ease-out 0.9s infinite',
          opacity: 0,
        }}
      />
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          borderRadius: cornerRadius,
          backgroundColor: '#FF1493',
          border: '1.5px solid rgba(255, 255, 255, 0.25)',
          boxShadow: '0 0 6px rgba(255, 20, 147, 0.75), 0 0 14px rgba(255, 20, 147, 0.35)',
        }}
      >
        <span
          style={{
            fontSize: size * 0.42,
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1,
          }}
        >
          ?
        </span>
      </div>
      {label != null && <NodeLabel text={label} />}
    </div>
  );
}

export default MysteryNode;
