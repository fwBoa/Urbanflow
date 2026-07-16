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
        <div className="space-y-3">
          {favorites.length === 0 ? (
            <div className="text-center py-12">
              <Heart size={40} className="mx-auto mb-3 text-[var(--color-border)]" />
              <p className="text-sm text-[var(--color-text-tertiary)] mb-1">
                Aucun favori enregistré
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Recherchez un itinéraire et ajoutez-le en favori
              </p>
              <button
                onClick={() => router.push("/search")}
                className="mt-4 px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--cta-radius)] text-sm font-medium hover:bg-[var(--color-primary-dark)] transition-colors"
              >
                Rechercher un trajet
              </button>
            </div>
          ) : (
            favorites.map((fav) => (
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
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-favorite-red)] transition-colors p-1"
                  aria-label="Ajouter aux favoris"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await addFavorite({
                      from: item.from,
                      to: item.to,
                      mode: item.mode,
                      modeColor: item.modeColor,
                      duration: item.duration,
                      co2: item.co2,
                    });
                    setFavorites(await getFavorites());
                  }}
                >
                  <Heart size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
