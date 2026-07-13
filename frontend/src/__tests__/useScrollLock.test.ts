import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useScrollLock } from '../hooks/useScrollLock.js';

describe('useScrollLock hook', () => {
  let originalOverflow: string;
  let originalPaddingRight: string;

  beforeEach(() => {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;
  });

  afterEach(() => {
    // Reset body style and restore spies
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;
    vi.restoreAllMocks();
  });

  it('should not lock scroll by default if locked is false', () => {
    renderHook(() => useScrollLock(false));

    expect(document.body.style.overflow).toBe(originalOverflow);
    expect(document.body.style.paddingRight).toBe(originalPaddingRight);
  });

  it('should lock scroll when locked is true', () => {
    // Mock clientWidth to simulate scrollbar presence
    const clientWidthSpy = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
    const innerWidthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1015); // 15px scrollbar

    renderHook(() => useScrollLock(true));

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.paddingRight).toBe('15px');

    clientWidthSpy.mockRestore();
    innerWidthSpy.mockRestore();
  });

  it('should restore original styles when unmounted', () => {
    const clientWidthSpy = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
    const innerWidthSpy = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1015);

    const { unmount } = renderHook(() => useScrollLock(true));

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe(originalOverflow);
    expect(document.body.style.paddingRight).toBe(originalPaddingRight);

    clientWidthSpy.mockRestore();
    innerWidthSpy.mockRestore();
  });
});
