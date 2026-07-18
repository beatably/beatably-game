import React from 'react';
import { GAP_CIRCLE_SIZE } from './timelineLayout';

// Tappable placement slot (iOS GapCircle): 24px muted circle with a subtle
// drop shadow. Only rendered for the acting player when a placement is legal.
function GapCircle({ nodeIndex, onSelect }) {
  return (
    <button
      type="button"
      data-node-index={nodeIndex}
      onClick={() => onSelect(nodeIndex)}
      className="absolute press-scale no-focus-outline force-no-outline"
      style={{
        left: -GAP_CIRCLE_SIZE / 2 - 8,
        top: -GAP_CIRCLE_SIZE / 2 - 8,
        width: GAP_CIRCLE_SIZE + 16, // padded 44px-ish touch target
        height: GAP_CIRCLE_SIZE + 16,
        padding: 8,
        background: 'transparent',
        border: 'none',
        minHeight: 0,
        minWidth: 0,
      }}
      aria-label={`Place at position ${nodeIndex}`}
    >
      <span
        className="block rounded-full"
        style={{
          width: GAP_CIRCLE_SIZE,
          height: GAP_CIRCLE_SIZE,
          backgroundColor: '#3A3B58',
          border: '1.5px solid #5A5B7A',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.4)',
        }}
      />
    </button>
  );
}

export default GapCircle;
