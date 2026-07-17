"use client";

import { useCallback, useEffect, useState } from "react";
import UrbanFlowIcon from "./icons/UrbanFlowIcon";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  addFavoriteLine,
  getFavoriteLines,
  removeFavoriteLine,
} from "@/services/favorites";

interface AddFavoriteLineButtonProps {
  lineId?: string;
  lineName?: string;
  mode?: string;
  lineColor?: string;
  /** Taille du bouton. */
  size?: "sm" | "md";
  /** Appelé après ajout/suppression. */
  onToggle?: (isFavorite: boolean) => void;
}

/**
 * CTA favori ligne sur un segment de transport en commun.
 * Gère l'état favori, l'ajout/suppression, et la redirection connexion
 * pour les utilisateurs anonymes.
 */
export default function AddFavoriteLineButton({
  lineId,
  lineName,
  mode,
  lineColor,
  size = "sm",
  onToggle,
}: AddFavoriteLineButtonProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  const canFavorite = !!lineId && !!lineName;

  useEffect(() => {
    if (!isAuthenticated || !canFavorite) return;
    let cancelled = false;
    getFavoriteLines()
      .then((favs) => {
        if (cancelled) return;
        setIsFavorite(favs.some((f) => f.lineId === lineId));
      })
      .catch(() => {
        if (cancelled) return;
        setIsFavorite(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, lineId, canFavorite]);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canFavorite) return;

      if (!isAuthenticated) {
        router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
        return;
      }

      setLoading(true);
      try {
        if (isFavorite) {
          await removeFavoriteLine(lineId);
          setIsFavorite(false);
          onToggle?.(false);
        } else {
          await addFavoriteLine({
            lineId,
            lineName,
            mode: mode || lineName,
            modeColor: lineColor || "#2E7D9B",
          });
          setIsFavorite(true);
          onToggle?.(true);
        }
      } catch (error) {
        console.error("Failed to toggle favorite line:", error);
      } finally {
        setLoading(false);
      }
    },
    [canFavorite, isAuthenticated, isFavorite, lineId, lineName, lineColor, mode, onToggle, router],
  );

  if (!canFavorite) return null;

  const iconSize = size === "sm" ? 12 : 14;
  const label = isFavorite
    ? `Retirer ${lineName} des favoris`
    : `Ajouter ${lineName} aux favoris`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      aria-label={label}
      title={label}
      className={`
        inline-flex items-center justify-center rounded-full transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]
        ${
          isFavorite
            ? "text-amber-500 hover:text-amber-600"
            : "text-[var(--color-text-tertiary)] hover:text-amber-500"
        }
        ${loading ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <UrbanFlowIcon
        type="action"
        name="bookmark"
        size={iconSize}
        ariaHidden={true}
        className={isFavorite ? "fill-current stroke-current" : "fill-none stroke-current"}
      />
      <span className="sr-only">{label}</span>
    </button>
  );
}
