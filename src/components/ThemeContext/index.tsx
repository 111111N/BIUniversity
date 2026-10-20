import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Theme = "dark" | "light";
type ThemeContextValue = { theme: Theme; toggleTheme(): void };

const STORAGE_KEY = "bi-university-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

const readTheme = (): Theme => {
  try { return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(STORAGE_KEY, theme); }
    catch { /* Переключатель работает до перезагрузки даже без доступа к хранилищу. */ }
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    toggleTheme: () => {
      const next = theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    },
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
};
