import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeStyle = 'v3_broadcast' | 'v2_editorial' | 'classic';

interface ThemeStyleContextValue {
  themeStyle: ThemeStyle;
  setThemeStyle: (style: ThemeStyle) => void;
  toggleThemeStyle: () => void;
  isV2: boolean;
  isV3: boolean;
}

const ThemeStyleContext = createContext<ThemeStyleContextValue>({
  themeStyle: 'v3_broadcast',
  setThemeStyle: () => {},
  toggleThemeStyle: () => {},
  isV2: false,
  isV3: true,
});

const STORAGE_KEY = 'radarnba_style_version';

export function ThemeStyleProvider({ children }: { children: ReactNode }) {
  const [themeStyle, setThemeStyleState] = useState<ThemeStyle>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'classic' || stored === 'v2_editorial' || stored === 'v3_broadcast') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'v3_broadcast';
  });

  const setThemeStyle = useCallback((newStyle: ThemeStyle) => {
    setThemeStyleState(newStyle);
    try {
      localStorage.setItem(STORAGE_KEY, newStyle);
    } catch {
      // ignore
    }
  }, []);

  const toggleThemeStyle = useCallback(() => {
    setThemeStyleState((prev) => {
      const next: ThemeStyle =
        prev === 'v3_broadcast'
          ? 'v2_editorial'
          : prev === 'v2_editorial'
          ? 'classic'
          : 'v3_broadcast';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-v3', 'theme-v2', 'theme-classic');
    if (themeStyle === 'v3_broadcast') {
      root.classList.add('theme-v3');
    } else if (themeStyle === 'v2_editorial') {
      root.classList.add('theme-v2');
    } else {
      root.classList.add('theme-classic');
    }
  }, [themeStyle]);

  return (
    <ThemeStyleContext.Provider
      value={{
        themeStyle,
        setThemeStyle,
        toggleThemeStyle,
        isV2: themeStyle === 'v2_editorial',
        isV3: themeStyle === 'v3_broadcast',
      }}
    >
      {children}
    </ThemeStyleContext.Provider>
  );
}

export function useThemeStyle() {
  return useContext(ThemeStyleContext);
}
