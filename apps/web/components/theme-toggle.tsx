'use client';

import { useTheme } from '@/components/theme-provider';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-options">
      <button className={`theme-option ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>
        <span className="theme-swatch dark" />
        <span>Dark Mode</span>
      </button>
      <button className={`theme-option ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>
        <span className="theme-swatch light" />
        <span>Light Mode</span>
      </button>
    </div>
  );
}
