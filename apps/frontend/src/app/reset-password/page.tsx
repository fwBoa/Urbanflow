"use client";

import { useState, Suspense } from "react";
import { Lock, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { resetPassword } from "@/services/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword, confirmPassword);
      setMessage("Mot de passe réinitialisé avec succès. Redirection...");
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la réinitialisation");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] border border-[var(--color-border)] p-6">
        <p className="text-sm text-[var(--color-favorite-red)]">
          Lien de réinitialisation invalide. Veuillez refaire une demande.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="newPassword"
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          Nouveau mot de passe
        </label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-3 py-2.5 rounded-lg bg-background border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          placeholder="Minimum 8 caractères"
        />
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
        >
          Confirmer le mot de passe
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full px-3 py-2.5 rounded-lg bg-background border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          placeholder="Répétez le mot de passe"
        />
      </div>

      {message && (
        <p className="text-sm text-[var(--color-eco-green)] bg-[var(--color-eco-green)]/10 rounded-lg p-3">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-[var(--color-favorite-red)] bg-[var(--color-favorite-red)]/10 rounded-lg p-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !newPassword || !confirmPassword}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Réinitialisation...
          </>
        ) : (
          "Réinitialiser le mot de passe"
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AppShell title="Réinitialisation du mot de passe">
      <div className="max-w-md mx-auto mt-8">
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] mb-6"
        >
          <ArrowLeft size={16} />
          Retour à la connexion
        </Link>

        <div className="bg-[var(--color-surface)] rounded-[var(--card-radius)] border border-[var(--color-border)] p-6">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center mb-3">
              <Lock size={24} className="text-[var(--color-primary)]" />
            </div>
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Nouveau mot de passe
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1">
              Choisissez un nouveau mot de passe pour votre compte.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </AppShell>
  );
}
