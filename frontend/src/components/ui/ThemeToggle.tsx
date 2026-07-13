import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(d => !d)}
      className="p-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-pip-border text-pip-text transition-all duration-200 hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer shadow-sm"
      aria-label="Toggle theme"
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? <Sun size={18} className="text-pip-accent animate-pulse" /> : <Moon size={18} className="text-pip-secondary" />}
    </button>
  );
}
