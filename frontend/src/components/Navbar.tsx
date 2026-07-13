import { useState } from 'react';
import { Button, Tooltip, ThemeToggle } from './ui/index.js';
import { logout } from '../api/auth.js';

interface NavbarProps {
  title: string;
  userEmail?: string;
}

export function Navbar({ title, userEmail }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    window.location.href = '/login';
  }

  return (
    <nav className="sticky top-0 z-40 bg-base/80 backdrop-blur-md border-b border-pip-border">
      <div className="max-w-[1400px] mx-auto flex items-center justify-between px-4 sm:px-8 py-4">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
            <span className="font-sora text-lg font-bold text-inverted">P</span>
          </div>
          <span className="font-sora text-base font-bold text-pip-text">{title}</span>
        </div>

        {/* Desktop right */}
        <div className="hidden md:flex items-center gap-6">
          <ThemeToggle />
          {userEmail && (
            <Tooltip content={userEmail} className="text-sm text-pip-secondary max-w-[250px]">
              {userEmail}
            </Tooltip>
          )}
          <Button variant="secondary" onClick={handleLogout} size="sm">
            Logout
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-pip-secondary text-xl focus:outline-none"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-pip-border bg-base px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-pip-secondary font-medium">Theme</span>
            <ThemeToggle />
          </div>
          {userEmail && <span className="text-sm text-pip-secondary">{userEmail}</span>}
          <Button variant="secondary" onClick={handleLogout} className="self-start">
            Logout
          </Button>
        </div>
      )}
    </nav>
  );
}
