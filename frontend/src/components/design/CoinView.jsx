import React from "react";

// Port of iOS CoinView (ios/Beatably/Views/GameView.swift:186):
// gold circle, #F5C842 -> #C8930A gradient (top-left to bottom-right),
// #E8B834 1px border, subtle dark-gold drop shadow.
export function CoinView({ size = 13, className = "" }) {
  return (
    <span
      className={`inline-block rounded-full ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: "linear-gradient(135deg, #F5C842 0%, #C8930A 100%)",
        border: "1px solid #E8B834",
        boxShadow: "0 1px 2px rgba(200, 147, 10, 0.5)",
      }}
    />
  );
}

// Port of iOS OverlappingCoins: overlapping stack, capped at 5 coins.
export function OverlappingCoins({ count, size = 13, className = "" }) {
  const shown = Math.min(Number(count) || 0, 5);
  if (shown <= 0) return null;
  const overlap = size - 5; // iOS HStack(spacing: -5)
  return (
    <span
      className={`inline-flex items-center relative ${className}`}
      style={{ width: `${size + overlap * (shown - 1)}px`, height: `${size}px` }}
    >
      {[...Array(shown)].map((_, i) => (
        <span
          key={i}
          className="absolute"
          style={{ left: `${i * overlap}px`, zIndex: shown - i }}
        >
          <CoinView size={size} />
        </span>
      ))}
    </span>
  );
}

export default CoinView;
