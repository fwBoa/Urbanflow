/**
 * Tests du préremplissage de /search depuis les query params (C3b).
 *
 * Contexte : clic sur une station Vélib' → /search?destLat=…&destLon=…&destLabel=…
 * La destination doit être préremplie (✓ Arrivée définie), il ne reste
 * que le départ à saisir — l'utilisateur ne retape jamais le nom de la station.
 */
import { render, screen, waitFor } from "@testing-library/react";
import SearchPage from "@/app/search/page";

const mockSearchParams = new URLSearchParams("");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/search",
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

jest.mock("@/components/JourneyLineLoader", () => ({
  __esModule: true,
  default: () => <div data-testid="journey-line" />,
}));

jest.mock("@/services/api", () => ({
  apiService: {
    searchStops: jest.fn().mockResolvedValue({ results: [] }),
    geocode: jest.fn().mockResolvedValue({ results: [] }),
    searchJourney: jest.fn().mockResolvedValue([]),
    reverseGeocode: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("@/services/favorites", () => ({
  addToHistory: jest.fn(),
  getHistory: jest.fn().mockResolvedValue([]),
  getPreferences: jest.fn().mockReturnValue({}),
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

jest.mock("@/hooks/useTransport", () => ({
  useStopSearch: () => ({ stops: [], loading: false }),
  useGeocode: () => ({ results: [], loading: false, error: null }),
  useJourney: () => ({ journeys: [], loading: false, error: null }),
  useReverseGeocode: () => ({ reverseGeocode: jest.fn(), loading: false }),
  useRoute: () => ({ fetchRoute: jest.fn().mockResolvedValue([]), loading: false }),
  useNearbyStops: () => ({ stops: [], loading: false }),
  useStopTimes: () => ({ departures: [], loading: false }),
}));

jest.mock("@/hooks/useGeolocation", () => ({
  useGeolocation: () => ({
    lat: null,
    lon: null,
    accuracy: null,
    watching: false,
    locate: jest.fn(),
    startWatch: jest.fn(),
    stopWatch: jest.fn(),
  }),
}));

describe("SearchPage — préremplissage Vélib' (C3b)", () => {
  beforeEach(() => {
    mockSearchParams.delete("destLat");
    mockSearchParams.delete("destLon");
    mockSearchParams.delete("destLabel");
  });

  it("préremplit la destination depuis destLat/destLon/destLabel", async () => {
    mockSearchParams.set("destLat", "48.858");
    mockSearchParams.set("destLon", "2.346");
    mockSearchParams.set("destLabel", "Vélib' 08042 - Rivoli");

    render(<SearchPage />);

    // Le champ destination affiche le label de la station (préremplissage)
    const destInput = screen
      .getAllByRole("combobox")
      .find((el) => el.getAttribute("placeholder")?.includes("Où allez-vous"));
    await waitFor(() => {
      expect(destInput).toHaveValue("Vélib' 08042 - Rivoli");
    });
  });

  it("ignore des coordonnées invalides sans crash", async () => {
    mockSearchParams.set("destLat", "abc");
    mockSearchParams.set("destLon", "2.346");

    render(<SearchPage />);

    // Coordonnées invalides → champ destination vide, pas de crash
    const destInput = screen
      .getAllByRole("combobox")
      .find((el) => el.getAttribute("placeholder")?.includes("Où allez-vous"));
    await waitFor(() => {
      expect(destInput).toHaveValue("");
    });
  });

  it("sans query params, la page démarre vierge (non-régression)", async () => {
    render(<SearchPage />);

    const inputs = screen.getAllByRole("combobox");
    await waitFor(() => {
      expect(inputs[0]).toHaveValue("");
      expect(inputs[1]).toHaveValue("");
    });
  });
});