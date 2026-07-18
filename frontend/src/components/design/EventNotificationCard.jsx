import React from "react";
import { createPortal } from "react-dom";
import useMountTransition from "./useMountTransition";

// Port of iOS EventNotificationCard (ios/Beatably/Views/GameView.swift:962):
// bottom slide-up surface card (r14) with a colored glowing icon and a
// colored/35 border. `accent` is an rgb triplet string, e.g. "255, 20, 147".
const SPRING = "cubic-bezier(0.34, 1.3, 0.64, 1)";

function EventNotificationCard({ open, accent = "153, 69, 255", icon, children, zIndex = 9500 }) {
  const { isMounted, isVisible } = useMountTransition(open, 300);

  if (!isMounted) return null;

  return createPortal(
    <div
      className="fixed left-4 right-4 pointer-events-none"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 16px)",
        zIndex,
        transform: isVisible ? "translateY(0)" : "translateY(120%)",
        opacity: isVisible ? 1 : 0,
        transition: `transform 0.3s ${SPRING}, opacity 0.3s ease-out`,
      }}
    >
      <div
        className="mx-auto max-w-sm bg-surface flex items-center gap-3 px-4 py-3"
        style={{
          borderRadius: "14px",
          border: `1px solid rgba(${accent}, 0.35)`,
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        }}
      >
        {icon && (
          <span
            className="flex-shrink-0 flex items-center justify-center"
            style={{
              color: `rgb(${accent})`,
              filter: `drop-shadow(0 0 6px rgba(${accent}, 0.7))`,
            }}
          >
            {icon}
          </span>
        )}
        <div className="text-sm text-foreground min-w-0">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export default EventNotificationCard;
