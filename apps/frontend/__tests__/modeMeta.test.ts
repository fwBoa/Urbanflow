import { formatModeLabel, getModeLabel } from "@/lib/modeMeta";
import { normalizeHexColor, getContrastColor } from "@/lib/colors";

describe("normalizeHexColor (bug pastilles blanches)", () => {
  it("normalise les couleurs réseau sans #", () => {
    expect(normalizeHexColor("eb2132")).toBe("#EB2132");
    expect(normalizeHexColor("ffbe00")).toBe("#FFBE00");
  });

  it("tolère les couleurs déjà préfixées (favoris historiques)", () => {
    expect(normalizeHexColor("#eb2132")).toBe("#EB2132");
    // Le cas du bug : double préfixe ne doit JAMAIS ressortir en CSS.
    expect(normalizeHexColor("##eb2132")).toBe("#EB2132");
  });

  it("étend le format court et rejette l'invalide", () => {
    expect(normalizeHexColor("#abc")).toBe("#AABBCC");
    expect(normalizeHexColor("pasuncouleur")).toBe("#2E7D9B");
    expect(normalizeHexColor(undefined)).toBe("#2E7D9B");
  });

  it("chaîne complète pastille : bg valide + contraste lisible", () => {
    // Reproduction du bug : modeColor stocké AVEC # + affichage qui
    // préfixait un second # → fond invalide, texte blanc invisible.
    const stored = "#eb2132"; // RER A
    const bg = normalizeHexColor(stored);
    expect(bg).toMatch(/^#[0-9A-F]{6}$/);
    expect(getContrastColor(bg)).toBe("#FFFFFF"); // fond foncé → texte blanc lisible
  });
});

describe("getModeLabel", () => {
  it("retourne le libellé français du mode", () => {
    expect(getModeLabel("metro")).toBe("Métro");
    expect(getModeLabel("walking")).toBe("Marche");
    expect(getModeLabel("velib")).toBe("Vélib'");
  });

  it("compose mode + ligne pour rer/metro/tram", () => {
    expect(getModeLabel("rer", "A")).toBe("RER A");
    expect(getModeLabel("metro", "1")).toBe("Métro 1");
  });
});

describe("formatModeLabel", () => {
  it("formate les modes canoniques vers un libellé FR", () => {
    expect(formatModeLabel("rer")).toBe("RER");
    expect(formatModeLabel("marche")).toBe("Marche");
    expect(formatModeLabel("velib")).toBe("Vélib'");
    expect(formatModeLabel("metro")).toBe("Métro");
  });

  it("reconstitue le libellé complet depuis un nom de ligne", () => {
    // Valeurs réellement stockées en base (historique recherche).
    expect(formatModeLabel("RER A")).toBe("RER A");
    expect(formatModeLabel("Métro 1")).toBe("Métro 1");
  });

  it("formate les libellés composés (correspondances)", () => {
    expect(formatModeLabel("RER A + Métro 1")).toBe("RER A + Métro 1");
    expect(formatModeLabel("rer + marche")).toBe("RER + Marche");
  });

  it("retourne une valeur neutre pour un mode vide ou inconnu", () => {
    expect(formatModeLabel(undefined)).toBe("Trajet");
    expect(formatModeLabel("")).toBe("Trajet");
    expect(formatModeLabel("ChoseInconnue")).toBe("ChoseInconnue");
  });
});