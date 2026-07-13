import React, { type SelectHTMLAttributes, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';
import { ChevronDown, Check } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className, id, children, value, disabled, ...props }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuHeight, setMenuHeight] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Parse children options to render custom lists
  const options = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && child.type === 'option') {
      const optEl = child as React.ReactElement<{ value?: any; children?: React.ReactNode; disabled?: boolean }>;
      return {
        value: String(optEl.props.value ?? ''),
        label: String(optEl.props.children ?? ''),
        disabled: Boolean(optEl.props.disabled),
      };
    }
    return null;
  })?.filter(Boolean) || [];

  // Find selected option or fallback to first option
  const selectedOption = options.find((opt) => String(opt.value) === String(value)) || options[0];
  const displayLabel = selectedOption ? selectedOption.label : 'Select...';

  // Close dropdown on click outside trigger or portal menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedInsideTrigger = containerRef.current && containerRef.current.contains(target);
      const clickedInsideMenu = menuRef.current && menuRef.current.contains(target);

      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine open direction and update coordinates relative to viewport
  const updatePosition = () => {
    if (!containerRef.current) return;
    const triggerRect = containerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;

    // Use measured menuHeight if available, otherwise default to 200px
    const currentMenuHeight = menuRef.current ? menuRef.current.getBoundingClientRect().height : 200;

    let direction: 'above' | 'below' = 'below';
    if (spaceBelow < currentMenuHeight && spaceAbove > spaceBelow) {
      direction = 'above';
    }

    let top = 0;
    if (direction === 'below') {
      top = triggerRect.bottom + scrollY + 4;
    } else {
      top = triggerRect.top + scrollY - currentMenuHeight - 4;
    }

    setCoords({
      top,
      left: triggerRect.left + scrollX,
      width: triggerRect.width,
    });
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handle = requestAnimationFrame(() => {
        updatePosition();
      });
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        cancelAnimationFrame(handle);
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    } else {
      setCoords({ top: 0, left: 0, width: 0 });
    }
  }, [isOpen, menuHeight]);

  const menuRefCallback = (node: HTMLDivElement | null) => {
    menuRef.current = node;
    if (node) {
      const height = node.getBoundingClientRect().height;
      if (height !== menuHeight) {
        setMenuHeight(height);
      }
    }
  };

  const handleOptionClick = (val: string) => {
    if (disabled) return;
    if (selectRef.current) {
      // Programmatically set native select value so React registers the change event
      const nativeSelectProto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      if (nativeSelectProto && nativeSelectProto.set) {
        nativeSelectProto.set.call(selectRef.current, val);
      } else {
        selectRef.current.value = val;
      }
      const event = new Event('change', { bubbles: true });
      selectRef.current.dispatchEvent(event);
    }
    setIsOpen(false);
  };

  return (
    <div className="flex flex-col gap-1 relative w-full" ref={containerRef}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-pip-secondary uppercase tracking-wide">
          {label}
        </label>
      )}

      {/* Hidden native select for form support & automated testing compatibility */}
      <select
        id={id}
        ref={selectRef}
        value={value}
        disabled={disabled}
        className="sr-only"
        {...props}
      >
        {children}
      </select>

      {/* Custom Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'select-trigger-btn w-full flex items-center justify-between rounded-lg border border-pip-border bg-surface-1 px-3 py-2 text-sm text-pip-text transition-all duration-200 text-left',
          'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
          disabled && 'opacity-50 cursor-not-allowed bg-surface-2',
          error && 'border-err-text',
          isOpen && 'border-accent shadow-sm',
          className
        )}
      >
        <span className="truncate pr-2">{displayLabel}</span>
        <ChevronDown
          size={16}
          className={cn(
            'text-pip-muted transition-transform duration-200 flex-shrink-0',
            isOpen && 'transform rotate-180 text-accent'
          )}
        />
      </button>

      {/* Custom Floating Dropdown Menu (via Portal) */}
      {isOpen && !disabled &&
        createPortal(
          <div
            ref={menuRefCallback}
            style={
              coords.width === 0
                ? {
                    position: 'absolute',
                    top: '-9999px',
                    left: '-9999px',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: 9999,
                  }
                : {
                    position: 'absolute',
                    top: `${coords.top}px`,
                    left: `${coords.left}px`,
                    width: `${coords.width}px`,
                    zIndex: 9999,
                  }
            }
            className="bg-surface-1 border border-pip-border rounded-xl shadow-xl py-1.5 max-h-60 overflow-y-auto"
          >
            {options.map((opt) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleOptionClick(opt.value)}
                  className={cn(
                    'dropdown-option w-full text-left px-3.5 py-2 text-sm text-pip-text flex items-center justify-between',
                    isSelected ? 'bg-accent/5 text-accent font-semibold' : '',
                    opt.disabled && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check size={14} className="text-accent flex-shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}

      {error && <span className="text-xs text-err-text">{error}</span>}
    </div>
  );
}
