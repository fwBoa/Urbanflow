"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Heart, Clock } from "lucide-react";
import AppShell from "@/components/AppShell";
import CO2Badge from "@/components/CO2Badge";
import {
  getFavorites,
  getHistory,
  removeFavorite,
  clearHistory,
  addFavorite,
  type FavoriteJourney,
  type HistoryJourney,
} from "@/services/favorites";
import { useAuth } from "@/contexts/AuthContext";

export default function FavoritesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"favorites" | "history">("favorites");
  const [favorites, setFavorites] = useState<FavoriteJourney[]>([]);
  const [history, setHistory] = useState<HistoryJourney[]>([]);

  const favoriteLines = favorites.filter((f) => f.type === "line");
  const favoriteJourneys = favorites.filter((f) => f.type !== "line");

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login?redirect=/favorites");
    }
  }, [isAuthenticated, router]);

  // Load from backend only (no localStorage fallback for anonymous)
  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadData() {
      const [favs, hist] = await Promise.all([getFavorites(), getHistory()]);
      setFavorites(favs);
      setHistory(hist);
    }
    loadData();
  }, [isAuthenticated]);

  const handleRemoveFavorite = async (id: string) => {
    const updated = await removeFavorite(id);
    setFavorites(updated);
  };

  const findFavoriteForHistoryItem = (item: HistoryJourney): FavoriteJourney | undefined =>
    favorites.find(
      (f) => f.from === item.from && f.to === item.to && f.mode === item.mode,
    );

  const isHistoryItemFavorite = (item: HistoryJourney): boolean =>
    !!findFavoriteForHistoryItem(item);

  const handleToggleFavoriteFromHistory = async (item: HistoryJourney) => {
    const existing = findFavoriteForHistoryItem(item);
    if (existing) {
      const updated = await removeFavorite(existing.id);
      setFavorites(updated);
    } else {
      const fav = await addFavorite({
        from: item.from,
        to: item.to,
        mode: item.mode,
        modeColor: item.modeColor,
        duration: item.duration,
        co2: item.co2,
        origin: item.origin,
        destination: item.destination,
      });
      setFavorites((prev) => [fav, ...prev]);
    }
  };

  const handleClearHistory = async () => {
    await clearHistory();
    setHistory([]);
  };

  const handleReplay = (item: FavoriteJourney | HistoryJourney) => {
    const hasOrigin = "origin" in item && item.origin;
    const hasDest = "destination" in item && item.destination;
    if (hasOrigin && hasDest) {
      const id = typeof item.id === "string" ? item.id : "replay";
      const query = new URLSearchParams({
        originLat: String(item.origin!.lat),
        originLon: String(item.origin!.lon),
        destLat: String(item.destination!.lat),
        destLon: String(item.destination!.lon),
      });
      router.push(`/trip/${id}?${query.toString()}`);
    } else {
      router.push("/search");
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  return (
    <AppShell title="Favoris">
      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] rounded-[var(--chip-radius)] p-1 mb-4">
        <button
          onClick={() => setActiveTab("favorites")}
          className={`flex-1 py-2 text-sm font-medium rounded-[var(--chip-radius)] transition-colors ${
            activeTab === "favorites"
              ? "bg-background text-[var(--color-primary)] shadow-sm"
              : "text-[var(--color-text-tertiary)]"
          }`}
        >
          <Heart size={14} className="inline mr-1" />
          Favoris
          {favorites.length > 0 && (
            <span className="ml-1 text-[11px] bg-[var(--color-primary)] text-white px-1.5 rounded-full">
              {favorites.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 text-sm font-medium rounded-[var(--chip-radius)] transition-colors ${
            activeTab === "history"
              ? "bg-background text-[var(--color-primary)] shadow-sm"
              : "text-[var(--color-text-tertiary)]"
          }`}
        >
          <Clock size={14} className="inline mr-1" />
          Historique
          {history.length > 0 && (
            <span className="ml-1 text-[11px] bg-[var(--color-text-tertiary)] text-white px-1.5 rounded-full">
              {history.length}
            </span>
          )}
        </button>
      </div>

      {/* Loading state */}
      {!isAuthenticated ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-[var(--color-text-tertiary)]">Redirection vers la connexion...</p>
        </div>
      ) : activeTab === "favorites" ? (
        <div className="space-y-4">
          {/* Lignes suivies */}
          {favoriteLines.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                Lignes suivies
              </h3>
              <div className="flex flex-wrap gap-2">
                {favoriteLines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
                  >
                    <span
                      className="inline-flex items-center justify-center min-w-[28px] h-[22px] px-1 rounded text-[11px] font-bold text-white"
                      style={{ backgroundColor: `#${line.modeColor}` }}
                    >
                      {line.mode}
                    </span>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {line.lineId}
                    </span>
                    <button
                      className="text-[var(--color-favorite-red)] hover:scale-110 transition-transform p-0.5"
                      aria-label="Retirer des favoris"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFavorite(line.id);
                      }}
                    >
                      <Heart size={14} fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trajets favoris */}
          {favoriteJourneys.length === 0 && favoriteLines.length === 0 ? (
            <div className="text-center py-12">
              <Heart size={40} className="mx-auto mb-3 text-[var(--color-border)]" />
              <p className="text-sm text-[var(--color-text-tertiary)] mb-1">
                Aucun favori enregistré
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Recherchez un itinéraire ou ajoutez une ligne en favori
              </p>
              <div className="flex gap-2 justify-center mt-4">
                <button
                  onClick={() => router.push("/search")}
                  className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--cta-radius)] text-sm font-medium hover:bg-[var(--color-primary-dark)] transition-colors"
                >
                  Rechercher un trajet
                </button>
                <button
                  onClick={() => router.push("/lines")}
                  className="px-4 py-2 bg-[var(--color-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-[var(--cta-radius)] text-sm font-medium hover:bg-[var(--color-border)] transition-colors"
                >
                  Voir les lignes
                </button>
              </div>
            </div>
          ) : (
            favoriteJourneys.map((fav) => (
              <div
                key={fav.id}
                className="bg-surface rounded-[var(--card-radius)] p-4 border border-[var(--color-border)] hover:shadow-md transition-all cursor-pointer"
                onClick={() => handleReplay(fav)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                        style={{ backgroundColor: fav.modeColor }}
                      >
                        {fav.mode}
                      </span>
                      <CO2Badge grams={fav.co2} />
                    </div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      {fav.from} → {fav.to}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-1 mt-0.5">
                      <Clock size={11} />
                      {fav.duration}
                    </p>
                  </div>
                  <button
                    className="text-[var(--color-favorite-red)] hover:scale-110 transition-transform p-1"
                    aria-label="Supprimer des favoris"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFavorite(fav.id);
                    }}
                  >
                    <Heart size={20} fill="currentColor" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={handleClearHistory}
              className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-favorite-red)] transition-colors"
            >
              Effacer l&apos;historique
            </button>
          </div>
          {history.map((item) => (
            <div
              key={item.id}
              className="bg-surface rounded-[var(--card-radius)] p-4 border border-[var(--color-border)] hover:shadow-md transition-all cursor-pointer"
              onClick={() => handleReplay(item)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                      style={{ backgroundColor: item.modeColor }}
                    >
                      {item.mode}
                    </span>
                    <CO2Badge grams={item.co2} />
                  </div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    {item.from} → {item.to}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-1 mt-0.5">
                    <Clock size={11} />
                    {item.duration} · {formatDate(item.date)}
                  </p>
                </div>
                <button
                  className={`transition-colors p-1 ${
                    isHistoryItemFavorite(item)
                      ? "text-[var(--color-favorite-red)]"
                      : "text-[var(--color-text-tertiary)] hover:text-[var(--color-favorite-red)]"
                  }`}
                  aria-label={
                    isHistoryItemFavorite(item)
                      ? "Retirer des favoris"
                      : "Ajouter aux favoris"
                  }
                  aria-pressed={isHistoryItemFavorite(item)}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleToggleFavoriteFromHistory(item);
                  }}
                >
                  <Heart
                    size={18}
                    fill={isHistoryItemFavorite(item) ? "currentColor" : "none"}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
