import React from 'react';

function CardPlaceholder({ className = "" }) {
  return (
    <div
      className={`bg-transparent border-2 border-dashed border-gray-500 p-3 rounded-lg w-24 text-center select-none opacity-30 ${className}`}
      style={{ 
        minHeight: 48,
      }}
    >
      <div className="font-bold text-xl text-gray-500">?</div>
    </div>
  );
}

export default CardPlaceholder;
