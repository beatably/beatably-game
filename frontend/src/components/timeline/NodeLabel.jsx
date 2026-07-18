import React from 'react';
import { NODE_LABEL_OFFSET } from './timelineLayout';

// Year / player-name label under a timeline node (iOS NodeLabel):
// 13px black-weight white with a purple glow shadow, centered 33px below
// the node's center. Rendered inside the node wrapper so it travels with
// the node during slide animations.
function NodeLabel({ text }) {
  return (
    <div
      className="absolute left-1/2 pointer-events-none text-center"
      style={{
        top: '50%',
        transform: `translate(-50%, calc(${NODE_LABEL_OFFSET}px - 50%))`,
        maxWidth: 84,
        fontSize: 13,
        fontWeight: 900,
        color: '#fff',
        textShadow: '0 0 4px rgba(153, 69, 255, 0.8), 0 0 8px rgba(153, 69, 255, 0.5)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        lineHeight: 1.2,
      }}
    >
      {text}
    </div>
  );
}

export default NodeLabel;
