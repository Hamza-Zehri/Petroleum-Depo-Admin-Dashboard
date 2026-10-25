import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark";

interface ThemeCtx {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = "pd_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", theme === "dark" ? "dark" : "light");
    }
  }, [theme]);

  const setTheme = (t: ThemeMode) => setThemeState(t);
  const toggle = () => setThemeState((prev) => (prev === "dark" ? "light" : "dark"));

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}