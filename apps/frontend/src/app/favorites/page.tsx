"use client";

import { useState } from "react";
import { Heart, Clock, MapPin, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import CO2Badge from "@/components/CO2Badge";

const mockFavorites = [
  { id: 1, from: "Maison", to: "Bureau", mode: "Métro 14", duration: "25 min", co2: 38, color: "#2E7D9B" },
  { id: 2, from: "Gare du Nord", to: "Châtelet", mode: "RER B", duration: "8 min", co2: 12, color: "#1A5A73" },
  { id: 3, from: "République", to: "Bastille", mode: "Vélib'", duration: "12 min", co2: 0, color: "#7CB342" },
];

const mockHistory = [
  { id: 4, from: "La Défense", to: "Opéra", mode: "RER A", duration: "18 min", co2: 28, color: "#1A5A73", date: "Hier" },
  { id: 5, from: "Saint-Lazare", to: "Gare de Lyon", mode: "Métro 14", duration: "10 min", co2: 15, color: "#2E7D9B", date: "Il y a 2j" },
];

export default function FavoritesPage() {
  const [activeTab, setActiveTab] = useState<"favorites" | "history">("favorites");

  return (
    <AppShell title="Favoris">
      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--color-surface)] rounded-[var(--chip-radius)] p-1 mb-4">
        <button
          onClick={() => setActiveTab("favorites")}
          className={`flex-1 py-2 text-sm font-medium rounded-[var(--chip-radius)] transition-colors ${
            activeTab === "favorites"
              ? "bg-white text-[var(--color-primary)] shadow-sm"
              : "text-[var(--color-text-tertiary)]"
          }`}
        >
          <Heart size={14} className="inline mr-1" />
          Favoris
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 text-sm font-medium rounded-[var(--chip-radius)] transition-colors ${
            activeTab === "history"
              ? "bg-white text-[var(--color-primary)] shadow-sm"
              : "text-[var(--color-text-tertiary)]"
          }`}
        >
          <Clock size={14} className="inline mr-1" />
          Historique
        </button>
      </div>

      {activeTab === "favorites" ? (
        <div className="space-y-3">
          {mockFavorites.map((fav) => (
            <div
              key={fav.id}
              className="bg-white rounded-[var(--card-radius)] p-4 border border-[var(--color-border)] hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                      style={{ backgroundColor: fav.color }}
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
                >
                  <Heart size={20} fill="currentColor" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {mockHistory.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-[var(--card-radius)] p-4 border border-[var(--color-border)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                      style={{ backgroundColor: item.color }}
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
                    {item.duration} · {item.date}
                  </p>
                </div>
                <button
                  className="text-[var(--color-text-tertiary)] hover:text-[var(--color-favorite-red)] transition-colors p-1"
                  aria-label="Ajouter aux favoris"
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