"use client";

import { useTheme } from "@/contexts/ThemeContext";

/**
 * Hook pour gérer le mode sombre.
 * - Wrap de useTheme pour compatibilité avec le reste de l'application.
 */
export function useDarkMode() {
  const { isDark, toggleDarkMode } = useTheme();
  return { isDark, toggleDarkMode };
}