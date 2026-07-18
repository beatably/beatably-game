import React from 'react';

// Start-of-game speech bubble (iOS StartHintCallout): soft dark bubble with a
// downward tail, shown once above the round-one starter node. Parent positions
// it (bottom anchored just above the node) and handles dismissal.
function StartHintCallout({ text }) {
  return (
    <div className="flex flex-col items-center pointer-events-none" style={{ maxWidth: 240 }}>
      <div
        className="text-center"
        style={{
          backgroundColor: 'rgba(30, 27, 52, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: 16,
          padding: '14px 18px',
          fontSize: 16,
          fontWeight: 500,
          color: '#F8F8FC',
          boxShadow: '0 5px 14px rgba(0, 0, 0, 0.45)',
        }}
      >
        {text}
      </div>
      <svg width="26" height="16" viewBox="0 0 26 16" style={{ marginTop: -1 }}>
        <path
          d="M 0 0 Q 10 3 13 16 Q 16 3 26 0 Z"
          fill="rgba(30, 27, 52, 0.96)"
          stroke="rgba(255, 255, 255, 0.14)"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}

export default StartHintCallout;
