'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
});

const STORAGE_KEY = 'vetos-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always start with 'system' on both server and client — blocking script in
  // layout.tsx handles the dark class BEFORE React hydrates, so there's no FOUC.
  const [theme, setThemeState] = useState<Theme>('system');

  // Read saved preference after mount (post-hydration) — safe to call setState here
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    } catch { /* ignore */ }
  }, []);

  // Apply dark class whenever theme state changes
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
      return;
    }

    if (theme === 'light') {
      root.classList.remove('dark');
      return;
    }

    // system — follow OS preference and watch for changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    root.classList.toggle('dark', mq.matches);

    const onChange = (e: MediaQueryListEvent) =>
      document.documentElement.classList.toggle('dark', e.matches);

    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  function setTheme(t: Theme) {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
