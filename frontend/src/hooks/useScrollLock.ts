import { useEffect } from 'react';

/**
 * Hook to lock background scrolling when a drawer or modal is open.
 * Handles desktop layout shifts by compensating scrollbar width.
 * Highly optimized and uses native browser APIs to avoid event listeners.
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    // Get current scrollbar width to prevent layout shifts
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    // Save original styles
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    // Apply styles to body
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [locked]);
}
