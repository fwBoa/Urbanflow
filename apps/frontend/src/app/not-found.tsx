"use client";

import { useRouter } from "next/navigation";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <div className="w-16 h-16 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mb-6">
        <UrbanFlowIcon type="status" name="alert" size={32} className="text-[var(--color-primary)]" />
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mb-2">
        Erreur 404
      </p>
      <h1 className="text-xl font-semibold mb-2">Page introuvable</h1>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mb-8">
        Cette page n&apos;existe pas ou a été déplacée. Le trajet que tu
        cherches a peut-être expiré.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--card-radius)] bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-dark)] transition-colors"
        >
          Retour à l&apos;accueil
        </button>
        <button
          type="button"
          onClick={() => router.push("/search")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--card-radius)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] font-medium hover:bg-[var(--color-border)]/40 transition-colors"
        >
          Chercher un itinéraire
        </button>
      </div>
    </div>
  );
}