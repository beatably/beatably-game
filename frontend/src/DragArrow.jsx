import React from 'react';

function DragArrow({ className = "" }) {
  return (
    <div className={`pointer-events-none ${className}`}>
      <img 
        src="/img/arrow.svg" 
        alt="Arrow pointing to timeline"
        className="opacity-10 w-24 h-24"
        style={{ 
          filter: 'brightness(0) invert(1)' // Make it white
        }}
      />
    </div>
  );
}

export default DragArrow;
