import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'syncaxis_theme';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function resolveEffective(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
  return mode;
}

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

interface ThemeContextValue {
  mode: ThemeMode;
  effective: 'light' | 'dark';
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Default is "system" - the app follows the browser/OS preference until the
// user explicitly overrides it via the theme button, which then persists.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);
  const [effective, setEffective] = useState<'light' | 'dark'>(() => resolveEffective(readStoredMode()));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effective);
  }, [effective]);

  useEffect(() => {
    setEffective(resolveEffective(mode));
    if (mode !== 'system') return;

    // Only listen for OS/browser theme changes while following the system
    // setting - an explicit light/dark choice should stay put regardless.
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = () => setEffective(resolveEffective('system'));
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [mode]);

  function cycleTheme() {
    setMode((current) => {
      const next: ThemeMode = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return <ThemeContext.Provider value={{ mode, effective, cycleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
