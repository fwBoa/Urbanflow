import { formatModeLabel, getModeLabel } from "@/lib/modeMeta";

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