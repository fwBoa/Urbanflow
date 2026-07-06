"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getPreferences, savePreferences } from "@/services/favorites";

interface ThemeContextType {
  isDark: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // Read preferences on mount
    const prefs = getPreferences();
    let dark = prefs.darkMode;
    if (dark === undefined) {
      dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggleDarkMode = () => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      savePreferences({ darkMode: next });
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
