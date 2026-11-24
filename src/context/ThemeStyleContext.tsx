import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeStyle = 'v2_editorial' | 'classic';

interface ThemeStyleContextValue {
  themeStyle: ThemeStyle;
  setThemeStyle: (style: ThemeStyle) => void;
  toggleThemeStyle: () => void;
  isV2: boolean;
}

const ThemeStyleContext = createContext<ThemeStyleContextValue>({
  themeStyle: 'v2_editorial',
  setThemeStyle: () => {},
  toggleThemeStyle: () => {},
  isV2: true,
});

const STORAGE_KEY = 'radarnba_style_version';

export function ThemeStyleProvider({ children }: { children: ReactNode }) {
  const [themeStyle, setThemeStyleState] = useState<ThemeStyle>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'classic' || stored === 'v2_editorial') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'v2_editorial';
  });

  const setThemeStyle = (newStyle: ThemeStyle) => {
    setThemeStyleState(newStyle);
    try {
      localStorage.setItem(STORAGE_KEY, newStyle);
    } catch {
      // ignore
    }
  };

  const toggleThemeStyle = () => {
    setThemeStyle(themeStyle === 'v2_editorial' ? 'classic' : 'v2_editorial');
  };

  useEffect(() => {
    const root = document.documentElement;
    if (themeStyle === 'v2_editorial') {
      root.classList.add('theme-v2');
      root.classList.remove('theme-classic');
    } else {
      root.classList.add('theme-classic');
      root.classList.remove('theme-v2');
    }
  }, [themeStyle]);

  return (
    <ThemeStyleContext.Provider
      value={{
        themeStyle,
        setThemeStyle,
        toggleThemeStyle,
        isV2: themeStyle === 'v2_editorial',
      }}
    >
      {children}
    </ThemeStyleContext.Provider>
  );
}

export function useThemeStyle() {
  return useContext(ThemeStyleContext);
}
