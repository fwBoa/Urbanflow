"use client";

import { useEffect } from "react";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";

/**
 * Boundary d'erreur runtime (App Router) — attrape les exceptions de rendu
 * d'un segment et propose une reprise propre, dans le design system.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Journalise côté client pour le support (digest utilisable en ticket).
    console.error("[App] Erreur de rendu:", error);
  }, [error]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <div className="w-16 h-16 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-6">
        <UrbanFlowIcon type="status" name="alert" size={32} className="text-[var(--color-mobility-orange)]" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-2">
        Une erreur est survenue
      </p>
      <h1 className="text-xl font-semibold mb-2">Quelque chose a mal tourné</h1>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mb-8">
        Une erreur inattendue s&apos;est produite. Tu peux réessayer — si le
        problème persiste, recharge la page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--card-radius)] bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-dark)] transition-colors"
      >
        Réessayer
      </button>
    </div>
  );
}