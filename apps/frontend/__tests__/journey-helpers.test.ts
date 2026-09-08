import {
  journeyToSegments,
  shouldShowNightClosedBanner,
  MODE_COLORS,
} from "@/components/journey-helpers";

describe("journeyToSegments", () => {
  it("converts geojson [lon, lat] to [lat, lon] points", () => {
    const result = journeyToSegments(
      {
        segments: [
          {
            type: "transit",
            mode: "RER A",
            lineName: "RER A",
            lineColor: "#E2231A",
            geojson: [
              [2.35, 48.86],
              [2.36, 48.87],
              [2.37, 48.88],
            ],
          },
        ],
      },
      48.85,
      2.34,
      48.89,
      2.38,
    );

    expect(result).toHaveLength(1);
    expect(result[0].points).toEqual([
      [48.86, 2.35],
      [48.87, 2.36],
      [48.88, 2.37],
    ]);
    expect(result[0].color).toBe("#E2231A");
    expect(result[0].dashed).toBe(false);
  });

  it("uses walking style (dashed + grey) for walking segments", () => {
    const result = journeyToSegments(
      {
        segments: [
          {
            type: "walking",
            mode: "marche",
            fromLat: 48.85,
            fromLon: 2.34,
            toLat: 48.86,
            toLon: 2.35,
          },
        ],
      },
      48.85,
      2.34,
      48.89,
      2.38,
    );

    expect(result).toHaveLength(1);
    expect(result[0].dashed).toBe(true);
    expect(result[0].color).toBe(MODE_COLORS.marche);
    expect(result[0].points).toEqual([
      [48.85, 2.34],
      [48.86, 2.35],
    ]);
  });

  it("connects missing endpoints to the next segment, not the final destination", () => {
    const result = journeyToSegments(
      {
        segments: [
          {
            type: "walking",
            mode: "marche",
            // no from/to
          },
          {
            type: "transit",
            mode: "metro",
            lineName: "M1",
            lineColor: "#003CA0",
            fromLat: 48.86,
            fromLon: 2.35,
            toLat: 48.87,
            toLon: 2.36,
          },
          {
            type: "walking",
            mode: "marche",
            // no from/to
          },
        ],
      },
      48.85,
      2.34,
      48.89,
      2.38,
    );

    expect(result).toHaveLength(3);
    // First walking segment should go from origin to M1 departure
    expect(result[0].points).toEqual([
      [48.85, 2.34],
      [48.86, 2.35],
    ]);
    // Transit segment uses its own endpoints
    expect(result[1].points).toEqual([
      [48.86, 2.35],
      [48.87, 2.36],
    ]);
    // Last walking segment should go from M1 arrival to destination
    expect(result[2].points).toEqual([
      [48.87, 2.36],
      [48.89, 2.38],
    ]);
  });

  it("falls back to default line color when none provided", () => {
    const result = journeyToSegments(
      {
        segments: [
          {
            type: "transit",
            mode: "bus",
            lineName: "Bus 42",
            fromLat: 48.86,
            fromLon: 2.35,
            toLat: 48.87,
            toLon: 2.36,
          },
        ],
      },
      48.85,
      2.34,
      48.89,
      2.38,
    );

    expect(result[0].color).toBe(MODE_COLORS.bus);
  });

  it("skips zero-length segments", () => {
    const result = journeyToSegments(
      {
        segments: [
          {
            type: "walking",
            mode: "marche",
            fromLat: 48.86,
            fromLon: 2.35,
            toLat: 48.86,
            toLon: 2.35,
          },
        ],
      },
      48.85,
      2.34,
      48.89,
      2.38,
    );

    expect(result).toHaveLength(0);
  });

  it("uses destination as final endpoint when last segment has no to", () => {
    const result = journeyToSegments(
      {
        segments: [
          {
            type: "transit",
            mode: "rer",
            lineName: "RER A",
            lineColor: "#E2231A",
            fromLat: 48.86,
            fromLon: 2.35,
            // no to
          },
        ],
      },
      48.85,
      2.34,
      48.89,
      2.38,
    );

    expect(result).toHaveLength(1);
    expect(result[0].points).toEqual([
      [48.86, 2.35],
      [48.89, 2.38],
    ]);
  });
});

describe("shouldShowNightClosedBanner", () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 8, h, m);
  const busJourney = { segments: [{ mode: "Bus" }, { mode: "marche" }] };
  const metroJourney = {
    segments: [{ mode: "Métro" }, { mode: "marche" }],
  };

  it("shows banner at 02:30 when only bus journeys are returned (no mode filter)", () => {
    // Cas Opéra → Châtelet à 2h du matin : bus nocturnes uniquement.
    expect(shouldShowNightClosedBanner(at(2), [busJourney])).toBe(true);
  });

  it("shows banner at 02:30 even with no results (all modes closed)", () => {
    expect(shouldShowNightClosedBanner(at(2, 30), [])).toBe(true);
  });

  it("hides banner at 10:00 (network open, métro returned)", () => {
    expect(shouldShowNightClosedBanner(at(10), [metroJourney])).toBe(false);
  });

  it("hides banner at 10:00 even if only bus returned (daytime = métro not closed)", () => {
    // De jour, un résultat sans ferré ne signifie pas « réseau fermé ».
    expect(shouldShowNightClosedBanner(at(10), [busJourney])).toBe(false);
  });

  it("hides banner at 05:45 (network reopened)", () => {
    expect(shouldShowNightClosedBanner(at(5, 45), [busJourney])).toBe(false);
  });

  it("hides banner at 01:00 (last métros still running)", () => {
    expect(shouldShowNightClosedBanner(at(1), [busJourney])).toBe(false);
  });

  it("shows banner when user explicitly filters on métro only at night", () => {
    expect(
      shouldShowNightClosedBanner(at(2), [busJourney], ["métro"]),
    ).toBe(true);
  });

  it("hides banner when user filters on bus only at night (what they asked is running)", () => {
    expect(
      shouldShowNightClosedBanner(at(2), [busJourney], ["bus"]),
    ).toBe(false);
  });

  it("handles mixed filter (métro + bus) at night: banner if no métro in results", () => {
    expect(
      shouldShowNightClosedBanner(at(2), [busJourney], ["métro", "bus"]),
    ).toBe(true);
    expect(
      shouldShowNightClosedBanner(at(2), [metroJourney], ["métro", "bus"]),
    ).toBe(false);
  });

  it("handles case variations (METRO, Métro, rer)", () => {
    const upper = { segments: [{ mode: "METRO" }] };
    expect(shouldShowNightClosedBanner(at(3), [upper])).toBe(false);
    const rer = { segments: [{ mode: "rer" }] };
    expect(shouldShowNightClosedBanner(at(3), [busJourney], ["rer"])).toBe(true);
  });

  it("returns false for null departure date (defensive)", () => {
    expect(shouldShowNightClosedBanner(null, [busJourney])).toBe(false);
  });
});
