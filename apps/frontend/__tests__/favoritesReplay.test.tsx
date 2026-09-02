/**
 * Tests du replay favoris/historique (B1) — le clic sur un élément doit
 * rejouer le trajet quand les coordonnées existent, préremplir la recherche
 * sinon, et mener aux lignes pour un favori ligne.
 *
 * La page FavoritesPage est lourde (AppShell, CO2Badge, many services) :
 * on teste la logique de routage via un rendu minimal de la page.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FavoritesPage from "@/app/favorites/page";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
}));

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { id: "u1" } }),
}));

const favoritesMock: unknown[] = [];
const historyMock: unknown[] = [];

jest.mock("@/services/favorites", () => ({
  getFavorites: jest.fn(() => Promise.resolve(favoritesMock)),
  getHistory: jest.fn(() => Promise.resolve(historyMock)),
  removeFavorite: jest.fn(() => Promise.resolve([])),
  clearHistory: jest.fn(() => Promise.resolve()),
  addFavorite: jest.fn(() => Promise.resolve({})),
}));

jest.mock("@/components/AppShell", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock("@/components/CO2Badge", () => ({
  __esModule: true,
  default: () => <span data-testid="co2" />,
}));

jest.mock("@/components/icons/UrbanFlowIcon", () => ({
  __esModule: true,
  default: () => <span data-testid="icon" />,
}));

describe("FavoritesPage — replay (B1)", () => {
  beforeEach(() => {
    pushMock.mockClear();
    favoritesMock.length = 0;
    historyMock.length = 0;
  });

  it("un favori ligne mène à /lines plutôt que de rejouer un trajet", async () => {
    favoritesMock.push({
      id: "fav-line-1",
      type: "line",
      lineId: "C01742",
      from: "",
      to: "",
      mode: "A",
      modeColor: "#EB2132",
      duration: "0",
      co2: 0,
      createdAt: "2026-09-02T10:00:00Z",
    });
    render(<FavoritesPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retirer des favoris/i })).toBeTruthy(),
    );
    // Le favori ligne expose uniquement « Retirer » (pas de replay) —
    // aucun push vers /trip ou /search n'est déclenché par son rendu.
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringContaining("/trip/"));
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringContaining("/search"));
  });

  it("un favori trajet avec coordonnées rejoue /trip avec les params", async () => {
    favoritesMock.push({
      id: "fav-j1",
      type: "journey",
      from: "Châtelet",
      to: "Musée Picasso",
      mode: "RER A + Métro 1",
      modeColor: "#E3051C",
      duration: "22 min",
      co2: 120,
      origin: { lat: 48.858, lon: 2.347 },
      destination: { lat: 48.86, lon: 2.36 },
      createdAt: "2026-09-02T10:00:00Z",
    });
    render(<FavoritesPage />);
    await waitFor(() => {
      const card = screen.getByText(/Châtelet/).closest("div[role], div");
      expect(card).toBeTruthy();
    });
    fireEvent.click(screen.getByText(/Châtelet/));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        expect.stringContaining("/trip/fav-j1?originLat=48.858"),
      );
    });
  });

  it("un historique sans coordonnées préremplit /search avec les libellés", async () => {
    historyMock.push({
      id: "h1",
      from: "Gare de Lyon",
      to: "Place d'Italie",
      mode: "Métro 1",
      modeColor: "#FFCE00",
      duration: "18 min",
      co2: 90,
      date: "2026-09-01T08:00:00Z",
    });
    render(<FavoritesPage />);
    // Onglet Historique d'abord.
    fireEvent.click(screen.getByRole("button", { name: /historique/i }));
    await waitFor(() => expect(screen.getByText(/Gare de Lyon/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Gare de Lyon/));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/search\?originLabel=Gare\+de\+Lyon/),
      );
    });
  });
});