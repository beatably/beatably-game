import { useEffect, useRef, useState } from "react";

// Keeps a component mounted during its exit transition (CSS replacement for
// framer-motion's AnimatePresence).
//
// Usage:
//   const { isMounted, isVisible } = useMountTransition(open, 350);
//   if (!isMounted) return null;
//   // apply "entered" styles when isVisible, "exited" styles otherwise
export default function useMountTransition(isOpen, unmountDelayMs = 350) {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    if (isOpen) {
      setIsMounted(true);
      // Two rAFs so the initial (hidden) styles paint before transitioning in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      setIsVisible(false);
      timeoutRef.current = setTimeout(() => setIsMounted(false), unmountDelayMs);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [isOpen, unmountDelayMs]);

  return { isMounted, isVisible };
}
