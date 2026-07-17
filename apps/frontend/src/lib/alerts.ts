import type { RealtimeAlert } from "@/services/api";

/**
 * Normalise un nom de ligne pour le matching d'alertes.
 * Doit rester synchronisé avec la logique côté backend :
 * `transport.controller.ts::matchAlertsForJourney`.
 */
export function normalizeLineName(s: string): string {
  return s.toUpperCase().replace(/\s+/g, " ").trim().replace(/[-_]/g, " ");
}

/**
 * Extrait le mode de transport depuis un nom de ligne normalisé.
 * Retourne undefined si aucun mode explicite n'est détecté.
 */
function detectMode(name: string): string | undefined {
  const n = normalizeLineName(name);
  if (n.includes("METRO") || n.includes("MÉTRO")) return "metro";
  if (n.includes("RER")) return "rer";
  if (n.includes("TRAM")) return "tram";
  if (n.includes("BUS")) return "bus";
  if (n.includes("TRANSILIEN") || n.includes("TRAIN")) return "transilien";
  return undefined;
}

/**
 * Extrait le code de ligne (dernier token alphanumérique).
 * Exemples : "RER A" → "A", "Métro 1" → "1", "Bus 72" → "72".
 */
function extractLineCode(name: string): string {
  const tokens = normalizeLineName(name).split(" ").filter(Boolean);
  return tokens[tokens.length - 1] ?? "";
}

/**
 * Vérifie si une alerte concerne une ligne donnée.
 * Le matching se base sur le code de ligne exact et, quand il est disponible,
 * sur le mode de transport, afin d'éviter les faux positifs
 * (ex. RER A vs Tram T3a, Métro 1 vs Bus 1).
 *
 * @param alert    Alerte temps réel à tester.
 * @param lineName Nom de la ligne empruntée (ex. "RER A").
 * @param lineMode Mode de transport connu du segment (ex. "rer"). Optionnel.
 */
export function alertMatchesLine(
  alert: RealtimeAlert,
  lineName: string,
  lineMode?: string,
  lineId?: string,
): boolean {
  if (lineId && alert.lineId && lineId === alert.lineId) return true;
  if (!lineName) return false;

  const normalizedLine = normalizeLineName(lineName);
  const lineCode = extractLineCode(normalizedLine);
  const lineModeHint = lineMode || detectMode(normalizedLine);

  return alert.affectedRoutes.some((route) => {
    const normalizedRoute = normalizeLineName(route);
    if (!normalizedRoute) return false;

    // Correspondance exacte sur le nom complet normalisé.
    if (normalizedRoute === normalizedLine) return true;

    const routeCode = extractLineCode(normalizedRoute);
    const routeMode = detectMode(normalizedRoute);

    // Correspondance par code de ligne exact.
    if (lineCode && routeCode && lineCode === routeCode) {
      // Si les deux côtés expriment un mode, ils doivent coïncider.
      if (lineModeHint && routeMode) {
        return lineModeHint === routeMode;
      }
      // Sans mode explicite, on exige un code d'au moins 2 caractères
      // pour éviter les collisions sur des codes trop courts (ex. "A").
      return lineCode.length >= 2;
    }

    // Fallback sous-chaîne : uniquement pour des termes d'au moins 3 caractères.
    if (normalizedLine.length >= 3 && normalizedRoute.length >= 3) {
      return (
        normalizedLine.includes(normalizedRoute) ||
        normalizedRoute.includes(normalizedLine)
      );
    }

    return false;
  });
}

/**
 * Filtre les alertes pertinentes pour un trajet (toutes lignes confondues).
 *
 * @param alerts    Liste des alertes temps réel.
 * @param lineNames Noms de lignes empruntées.
 * @param modes     Modes de transport correspondants (optionnels, même ordre).
 */
export function filterAlertsForJourney(
  alerts: RealtimeAlert[],
  lineNames: string[],
  modes?: string[],
): RealtimeAlert[] {
  if (lineNames.length === 0) return [];
  return alerts.filter((alert) =>
    lineNames.some((line, i) => alertMatchesLine(alert, line, modes?.[i])),
  );
}
