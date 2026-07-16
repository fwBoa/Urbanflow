import {
  alertMatchesLine,
  filterAlertsForJourney,
  normalizeLineName,
} from "@/lib/alerts";
import type { RealtimeAlert } from "@/services/api";

function makeAlert(affectedRoutes: string[]): RealtimeAlert {
  return {
    id: "alert-1",
    headerText: "Perturbation",
    severity: "warning",
    affectedRoutes,
  };
}

describe("normalizeLineName", () => {
  it("normalise casse, espaces et tirets", () => {
    expect(normalizeLineName("rer-a")).toBe("RER A");
    expect(normalizeLineName("  Métro  1 ")).toBe("MÉTRO 1");
    expect(normalizeLineName("BUS_72")).toBe("BUS 72");
  });
});

describe("alertMatchesLine", () => {
  it("match exact sur le nom normalisé", () => {
    expect(alertMatchesLine(makeAlert(["RER A"]), "RER A")).toBe(true);
    expect(alertMatchesLine(makeAlert(["rer a"]), "RER A")).toBe(true);
  });

  it("match par code de ligne exact", () => {
    expect(alertMatchesLine(makeAlert(["RER A"]), "A", "rer")).toBe(true);
  });

  it("rejette RER A vs Tram T3a (collision sur 'A')", () => {
    expect(alertMatchesLine(makeAlert(["Tram T3a"]), "RER A")).toBe(false);
  });

  it("rejette Métro 1 vs Bus 1 (même code, mode différent)", () => {
    expect(alertMatchesLine(makeAlert(["Bus 1"]), "Métro 1", "metro")).toBe(
      false,
    );
  });

  it("accepte Métro 1 vs METRO 1", () => {
    expect(alertMatchesLine(makeAlert(["METRO 1"]), "Métro 1", "metro")).toBe(
      true,
    );
  });

  it("rejette les codes courts sans mode explicite", () => {
    expect(alertMatchesLine(makeAlert(["Tram T3a"]), "A")).toBe(false);
  });

  it("accepte le fallback sous-chaîne pour des noms longs", () => {
    expect(alertMatchesLine(makeAlert(["RER A — Incident"]), "RER A")).toBe(
      true,
    );
  });
});

describe("filterAlertsForJourney", () => {
  it("ne garde que les alertes pertinentes", () => {
    const alerts = [
      makeAlert(["RER A"]),
      makeAlert(["Tram T3a"]),
      makeAlert(["Métro 1"]),
    ];
    const result = filterAlertsForJourney(
      alerts,
      ["RER A", "Métro 1"],
      ["rer", "metro"],
    );
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.affectedRoutes[0])).toEqual([
      "RER A",
      "Métro 1",
    ]);
  });
});
