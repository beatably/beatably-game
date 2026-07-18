import React from "react";
import { createPortal } from "react-dom";
import useMountTransition from "./useMountTransition";

// Port of iOS BottomCard (ios/Beatably/Components/BottomCard.swift):
// edge-to-edge slide-up sheet with top-only corner radius 28, purple glow
// rising from the top edge, a 1px white/8 edge line, and a black/55 backdrop
// that fades separately from the card slide.
const SPRING = "cubic-bezier(0.34, 1.3, 0.64, 1)";

function BottomCard({ open, onClose, children, showClose = true, zIndex = 10000 }) {
  const { isMounted, isVisible } = useMountTransition(open, 350);

  if (!isMounted) return null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex }}>
      {/* Backdrop fades independently of the card slide */}
      <div
        className="absolute inset-0 bg-black"
        style={{
          opacity: isVisible ? 0.55 : 0,
          transition: "opacity 0.25s ease-in-out",
        }}
        onClick={onClose}
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-surface"
        style={{
          borderRadius: "28px 28px 0 0",
          transform: isVisible ? "translateY(0)" : "translateY(100%)",
          transition: `transform 0.35s ${SPRING}`,
          boxShadow:
            "0 -1px 32px rgba(153, 69, 255, 0.165), 0 -1px 60px rgba(153, 69, 255, 0.084)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* 1px white/8 top edge line */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{
            height: "1px",
            borderRadius: "28px 28px 0 0",
            background: "rgba(255, 255, 255, 0.08)",
          }}
        />
        {showClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-muted-foreground press-scale"
            style={{ border: "none", padding: 0, zIndex: 1 }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

export default BottomCard;
