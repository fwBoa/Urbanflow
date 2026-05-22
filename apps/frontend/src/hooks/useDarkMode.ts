"use client";

import { useState, useEffect, useCallback } from "react";

const DARK_MODE_KEY = "urbanflow_darkMode";

/**
 * Hook pour gérer le mode sombre.
 * - Lit la préférence depuis localStorage
 * - Applique la classe "dark" sur <html>
 * - Synchronise avec le toggle du profil
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  // Initialiser depuis localStorage ou préférence système
  useEffect(() => {
    const stored = localStorage.getItem(DARK_MODE_KEY);
    if (stored !== null) {
      const dark = stored === "true";
      setIsDark(dark);
      document.documentElement.classList.toggle("dark", dark);
    } else {
      // Vérifier la préférence système
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(prefersDark);
      document.documentElement.classList.toggle("dark", prefersDark);
    }
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem(DARK_MODE_KEY, String(next));
      return next;
    });
  }, []);

  return { isDark, toggleDarkMode };
}