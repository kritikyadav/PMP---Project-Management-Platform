import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ content, children, placement = 'bottom', className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    let top = 0;
    let left = 0;

    if (placement === 'top') {
      top = triggerRect.top + scrollY - tooltipRect.height - 8;
      left = triggerRect.left + scrollX + (triggerRect.width - tooltipRect.width) / 2;
    } else if (placement === 'bottom') {
      top = triggerRect.bottom + scrollY + 8;
      left = triggerRect.left + scrollX + (triggerRect.width - tooltipRect.width) / 2;
    } else if (placement === 'left') {
      top = triggerRect.top + scrollY + (triggerRect.height - tooltipRect.height) / 2;
      left = triggerRect.left + scrollX - tooltipRect.width - 8;
    } else if (placement === 'right') {
      top = triggerRect.top + scrollY + (triggerRect.height - tooltipRect.height) / 2;
      left = triggerRect.right + scrollX + 8;
    }

    // Keep within window bounds
    const padding = 8;
    if (left < padding) left = padding;
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding;
    }

    setCoords({ top, left });
  };

  useEffect(() => {
    if (visible) {
      // Small timeout to allow target layout/styles to settle before calculating
      const timeoutId = setTimeout(updatePosition, 0);
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [visible]);

  return (
    <>
      <div
        ref={triggerRef}
        className={`inline-block max-w-full truncate ${className}`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        {children}
      </div>
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: 'absolute',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 9999,
            }}
            className="tooltip-content pointer-events-none px-3 py-1.5 text-xs font-medium text-pip-text bg-surface-2 border border-pip-border shadow-lg rounded-md max-w-xs transition-opacity duration-150"
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
