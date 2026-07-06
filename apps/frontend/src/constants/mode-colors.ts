/**
 * Source unique de vérité pour les couleurs des modes de transport.
 *
 * Deux palettes sont exposées :
 * - `MAP_MODE_COLORS` : couleurs officielles / cartographiques (IDFM, etc.)
 * - `UI_MODE_COLORS` : couleurs assombries pour une bonne lisibilité en badge UI
 *   (texte blanc sur fond coloré).
 */

export const MAP_MODE_COLORS: Record<string, string> = {
  marche: "#9E9E9E",
  metro: "#003CA0",
  rer: "#E2231A",
  bus: "#FFBE00",
  tram: "#7C2880",
  velib: "#7CB342",
  velib_electrique: "#7CB342",
  train: "#6E6E6E",
  transilien: "#6E6E6E",
  ferry: "#0099CC",
  car: "#333333",
};

export const UI_MODE_COLORS: Record<string, string> = {
  metro: "#1A5A73",
  rer: "#9C27B0",
  tram: "#7B1FA2",
  bus: "#0288D1",
  marche: "#455A64",
  velib: "#7CB342",
  train: "#1976D2",
  transilien: "#283593",
  ferry: "#00838F",
  car: "#424242",
};
