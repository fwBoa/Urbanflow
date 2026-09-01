/**
 * Tests de la résolution de saisie libre au submit (chantier C2 — Kaizen).
 *
 * Contexte (retours utilisateurs) : « Oui, après quelques essais » ×3 —
 * valider une adresse tapée sans cliquer une suggestion ne faisait rien.
 * Le submit doit maintenant géocoder le texte libre.
 *
 * On teste le composant SearchPage via un rendu light : la logique de
 * résolution est asynchrone et dépend de `apiService.searchStops` /
 * `apiService.geocode`. On mocke le module api et on vérifie le
 * comportement de bout en bout sur l'état de l'UI.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SearchPage from "@/app/search/page";

// ─── Mocks ──────────────────────────────────────────────────────────

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/search",
}));

// AppShell et DynamicMap sont lourds et inutiles pour ce test : on les
// stub pour éviter le rendu Leaflet en jsdom.
jest.mock("@/components/AppShell", () => {
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="app-shell">{children}</div>
    ),
  };
});

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
    searchStops: jest.fn(),
    geocode: jest.fn(),
    searchJourney: jest.fn().mockResolvedValue([]),
    getNearbyStops: jest.fn().mockResolvedValue({ stops: [] }),
    getNearbyVelibStations: jest.fn().mockResolvedValue({ stations: [] }),
    getLinesByMode: jest.fn().mockResolvedValue({}),
    getRoute: jest.fn().mockResolvedValue([]),
    getRealtimeAlerts: jest.fn().mockResolvedValue([]),
    getStopTimes: jest.fn().mockResolvedValue({ departures: [] }),
    getShape: jest.fn().mockResolvedValue([]),
    getVelibStations: jest.fn().mockResolvedValue({ results: [] }),
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

import { apiService } from "@/services/api";

const mockedSearchStops = apiService.searchStops as jest.Mock;
const mockedGeocode = apiService.geocode as jest.Mock;

// ─── Helpers ────────────────────────────────────────────────────────

function typeAndSubmit(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  // Enter dans l'input déclenche le onSubmit du SearchBar (saisie libre)
  fireEvent.keyDown(input, { key: "Enter" });
}

function getInputByPlaceholder(part: string): HTMLInputElement {
  // SearchBar rend l'input en role="combobox" quand aria-controls est défini
  const inputs = screen
    .getAllByRole("combobox")
    .filter((el) => el.getAttribute("placeholder")?.includes(part));
  if (inputs.length === 0) throw new Error(`Input non trouvé pour "${part}"`);
  return inputs[0] as HTMLInputElement;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("SearchPage — saisie libre résolue au submit (C2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("résout un arrêt GTFS en priorité quand le texte libre est soumis", async () => {
    mockedSearchStops.mockResolvedValue({
      results: [
        {
          arrid: "STOP_1",
          arrname: "Châtelet",
          arrgeopoint: { lat: 48.858, lon: 2.346 },
        },
      ],
    });

    render(<SearchPage />);
    const destInput = getInputByPlaceholder("Où allez-vous");
    typeAndSubmit(destInput, "Châtelet");

    // Attente : le label est normalisé et le champ destination rempli
    await waitFor(() => {
      expect(destInput).toHaveValue("Châtelet");
    });
    expect(mockedSearchStops).toHaveBeenCalledWith("Châtelet", 5);
  });

  it("résout une adresse quand aucun arrêt GTFS ne correspond", async () => {
    mockedSearchStops.mockResolvedValue({ results: [] });
    mockedGeocode.mockResolvedValue({
      results: [
        {
          label: "10 Rue de Rivoli, 75004 Paris",
          geometry: { coordinates: [2.36, 48.85] },
        },
      ],
    });

    render(<SearchPage />);
    const destInput = getInputByPlaceholder("Où allez-vous");
    typeAndSubmit(destInput, "10 rue de rivoli");

    await waitFor(() => {
      expect(destInput).toHaveValue("10 Rue de Rivoli, 75004 Paris");
    });
    expect(mockedGeocode).toHaveBeenCalledWith("10 rue de rivoli", 1);
  });

  it("affiche une erreur explicite quand la saisie ne résout rien", async () => {
    mockedSearchStops.mockResolvedValue({ results: [] });
    mockedGeocode.mockResolvedValue({ results: [] });

    render(<SearchPage />);
    const destInput = getInputByPlaceholder("Où allez-vous");
    typeAndSubmit(destInput, "zzzzzzzz");

    await waitFor(() => {
      expect(
        screen.getByText(/Aucun résultat pour « zzzzzzzz »/),
      ).toBeInTheDocument();
    });
    // Le champ reste vide (aucune sélection) et l'erreur est affichée
    expect(destInput).toHaveValue("zzzzzzzz");
  });

  it("n'appelle pas l'API si le texte fait moins de 3 caractères", async () => {
    render(<SearchPage />);
    const destInput = getInputByPlaceholder("Où allez-vous");
    typeAndSubmit(destInput, "ab");

    await waitFor(() => {
      expect(screen.getByText(/au moins 3 caractères/)).toBeInTheDocument();
    });
    expect(mockedSearchStops).not.toHaveBeenCalled();
    expect(mockedGeocode).not.toHaveBeenCalled();
  });
});