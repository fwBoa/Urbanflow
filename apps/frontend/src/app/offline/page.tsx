"use client";

import { CloudOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <div className="w-16 h-16 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-6">
        <CloudOff size={32} className="text-[var(--color-primary)]" />
      </div>
      <h1 className="text-xl font-semibold mb-2">Vous êtes hors ligne</h1>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mb-8">
        Vérifiez votre connexion, puis réessayez pour accéder à UrbanFlow.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--card-radius)] bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-dark)] transition-colors"
      >
        <RefreshCw size={18} />
        Réessayer
      </button>
    </div>
  );
}
