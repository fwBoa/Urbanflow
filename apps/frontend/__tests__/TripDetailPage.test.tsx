import { render, screen, waitFor } from "@testing-library/react";
import TripDetailPage from "@/app/trip/[id]/page";
import { apiService } from "@/services/api";

// ─── Mocks ──────────────────────────────────────────────────────────────────
jest.mock("next/navigation", () => ({
  useParams: jest.fn(),
  useSearchParams: jest.fn(),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock("@/components/AppShell", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

jest.mock("@/components/DynamicMap", () => ({
  __esModule: true,
  default: () => <div data-testid="dynamic-map" />,
}));

jest.mock("@/components/CO2Badge", () => ({
  __esModule: true,
  default: ({ grams }: { grams: number }) => <span data-testid="co2-badge">{grams}g</span>,
}));

jest.mock("@/components/ModeBadge", () => ({
  __esModule: true,
  default: ({ lineName, mode }: { lineName?: string; mode?: string }) => (
    <span data-testid="mode-badge">{lineName || mode}</span>
  ),
}));

jest.mock("@/components/TurnByTurnBanner", () => ({
  __esModule: true,
  default: ({ instruction }: { instruction: string }) => (
    <div data-testid="turn-banner">{instruction}</div>
  ),
}));

jest.mock("@/hooks/useTransport", () => ({
  useRoute: () => ({ fetchRoute: jest.fn().mockResolvedValue([]) }),
}));

jest.mock("@/hooks/useNavigation", () => ({
  useNavigation: () => ({
    isNavigating: false,
    isPaused: false,
    activeSegment: 0,
    elapsedSeconds: 0,
    arrived: false,
    offRoute: false,
    userPosition: null,
    currentSpeed: 0,
    remainingDistance: 0,
    remainingTime: 0,
    instruction: null,
    nextManeuverPoint: null,
    nextBearing: null,
    heading: null,
    startNavigation: jest.fn(),
    pauseNavigation: jest.fn(),
    resumeNavigation: jest.fn(),
    stopNavigation: jest.fn(),
    accuracy: null,
  }),
}));

jest.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

jest.mock("@/services/api", () => ({
  apiService: {
    searchJourney: jest.fn(),
    getShape: jest.fn(),
  },
}));

import { useParams, useSearchParams } from "next/navigation";

const mockedUseParams = useParams as jest.Mock;
const mockedUseSearchParams = useSearchParams as jest.Mock;
const mockedSearchJourney = apiService.searchJourney as jest.Mock;

describe("TripDetailPage", () => {
  beforeEach(() => {
    mockedUseParams.mockReturnValue({ id: "0" });
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  const makeSearchParams = (coords?: {
    originLat: string;
    originLon: string;
    destLat: string;
    destLon: string;
  }) => {
    const sp = new URLSearchParams();
    if (coords) {
      sp.set("originLat", coords.originLat);
      sp.set("originLon", coords.originLon);
      sp.set("destLat", coords.destLat);
      sp.set("destLon", coords.destLon);
    }
    return sp;
  };

  it("affiche le trajet stocké en sessionStorage", () => {
    const journey = {
      durationMinutes: 35,
      co2Ggrams: 56,
      transfers: 1,
      segments: [
        {
          type: "walking",
          mode: "marche",
          fromStop: "Départ",
          toStop: "République",
          durationMinutes: 5,
          instruction: "Marcher jusqu'à République",
        },
        {
          type: "transit",
          mode: "metro",
          lineName: "5",
          lineColor: "#FFCE00",
          fromStop: "République",
          toStop: "Bastille",
          durationMinutes: 20,
          numStops: 6,
          instruction: "Métro 5 direction Place d'Italie",
        },
        {
          type: "walking",
          mode: "marche",
          fromStop: "Bastille",
          toStop: "Arrivée",
          durationMinutes: 10,
          instruction: "Marcher jusqu'à destination",
        },
      ],
    };
    sessionStorage.setItem("uf:trip:0", JSON.stringify(journey));
    mockedUseSearchParams.mockReturnValue(makeSearchParams());

    render(<TripDetailPage />);

    expect(screen.getByText("République → Bastille", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("35 min", { selector: "p.text-2xl" })).toBeInTheDocument();
    expect(screen.getByText("1 correspondance")).toBeInTheDocument();
  });

  it("recalcule le trajet depuis l'API quand sessionStorage est vide", async () => {
    const journey = {
      durationMinutes: 28,
      co2Ggrams: 42,
      transfers: 0,
      segments: [
        {
          type: "walking",
          mode: "marche",
          fromStop: "Départ",
          toStop: "Nation",
          durationMinutes: 8,
          instruction: "Marcher jusqu'à Nation",
        },
        {
          type: "transit",
          mode: "rer",
          lineName: "A",
          lineColor: "#E3051C",
          fromStop: "Nation",
          toStop: "Vincennes",
          durationMinutes: 12,
          numStops: 2,
          instruction: "RER A direction Boissy-Saint-Léger",
        },
        {
          type: "walking",
          mode: "marche",
          fromStop: "Vincennes",
          toStop: "Arrivée",
          durationMinutes: 8,
          instruction: "Marcher jusqu'à destination",
        },
      ],
    };
    mockedSearchJourney.mockResolvedValue([journey]);
    mockedUseSearchParams.mockReturnValue(
      makeSearchParams({
        originLat: "48.8566",
        originLon: "2.3522",
        destLat: "48.8474",
        destLon: "2.4358",
      }),
    );

    render(<TripDetailPage />);

    expect(screen.getByText(/Recalcul de l'itinéraire/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Nation → Vincennes", { selector: "p" })).toBeInTheDocument(),
    );
    expect(mockedSearchJourney).toHaveBeenCalledWith(
      {
        originLat: 48.8566,
        originLon: 2.3522,
        destLat: 48.8474,
        destLon: 2.4358,
        modes: "metro,rer,tram,bus,transilien",
      },
      expect.any(AbortSignal),
    );
  });

  it("affiche le fallback quand il n'y a ni sessionStorage ni coordonnées", () => {
    mockedUseSearchParams.mockReturnValue(makeSearchParams());

    render(<TripDetailPage />);

    expect(screen.getByText("Châtelet → La Défense", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
  });
});
