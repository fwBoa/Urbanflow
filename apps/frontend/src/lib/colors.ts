/**
 * Utilities for color contrast and manipulation.
 */

/**
 * Convert an hex color (with or without leading `#`) to an RGB luminance
 * using the WCAG relative luminance formula.
 */
function hexToLuminance(hex: string): number {
  const sanitized = hex.replace(/^#/, "");
  const r = parseInt(sanitized.substring(0, 2), 16) / 255;
  const g = parseInt(sanitized.substring(2, 4), 16) / 255;
  const b = parseInt(sanitized.substring(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Return a text color that is readable on top of the given background color.
 * Black (`#000000`) for light backgrounds, white (`#FFFFFF`) for dark ones.
 */
export function getContrastColor(backgroundColor: string): string {
  const hex = backgroundColor.replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return "#FFFFFF";
  }
  return hexToLuminance(hex) > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * Normalise une couleur hexadécimale vers la forme « #RRGGBB », quelle que
 * soit la convention de la source : le référentiel réseau IDFM renvoie les
 * couleurs sans « # » (« eb2132 ») tandis que les segments de trajet et les
 * favoris historiques les stockent avec (« #eb2132 »). Sans normalisation,
 * préfixer un `#` à une valeur déjà préfixée produit un CSS invalide
 * (« ##eb2132 » → fond transparent, texte illisible — bug constaté sur les
 * chips « Lignes suivies » de /favorites). Tolère aussi les formats 3 et
 * 8 digits ; fallback bleu UrbanFlow si la valeur est inexploitable.
 */
export function normalizeHexColor(color?: string | null): string {
  if (!color) return "#2E7D9B";
  // Retire TOUS les dièses initiaux : certaines entrées historiques stockent
  // un double préfixe (« ##eb2132 ») — la faute du bug des pastilles blanches.
  let hex = color.trim().replace(/^#+/, "");
  // Format court (#abc → #aabbcc)
  if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  return "#2E7D9B";
}
