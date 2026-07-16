import type { RealtimeAlert } from "@/services/api";

/**
 * Normalise un nom de ligne pour le matching d'alertes.
 * Doit rester synchronisé avec la logique côté backend :
 * `transport.controller.ts::matchAlertsForJourney`.
 */
export function normalizeLineName(s: string): string {
  return s
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[-_]/g, " ");
}

/**
 * Vérifie si une alerte concerne une ligne donnée.
 * Utilise un matching bidirectionnel normalisé (ex. "RER A" ↔ "rer a" ↔ "A").
 */
export function alertMatchesLine(
  alert: RealtimeAlert,
  lineName: string,
): boolean {
  if (!lineName) return false;
  const normalizedLine = normalizeLineName(lineName);
  return alert.affectedRoutes.some((route) => {
    const normalizedRoute = normalizeLineName(route);
    if (!normalizedRoute || !normalizedLine) return false;
    return (
      normalizedLine.includes(normalizedRoute) ||
      normalizedRoute.includes(normalizedLine)
    );
  });
}

/**
 * Filtre les alertes pertinentes pour un trajet (toutes lignes confondues).
 */
export function filterAlertsForJourney(
  alerts: RealtimeAlert[],
  lineNames: string[],
): RealtimeAlert[] {
  if (lineNames.length === 0) return [];
  return alerts.filter((alert) =>
    lineNames.some((line) => alertMatchesLine(alert, line)),
  );
}
