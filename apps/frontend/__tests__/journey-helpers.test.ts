import {
  journeyToSegments,
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
