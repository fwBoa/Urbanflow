"use client";

import { useState } from "react";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { forgotPassword } from "@/services/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const result = await forgotPassword(email);
      setMessage(result.message);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la demande");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Mot de passe oublié">
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
              <Mail size={24} className="text-[var(--color-primary)]" />
            </div>
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Mot de passe oublié
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] text-center mt-1">
              Saisissez votre adresse email pour recevoir un lien de réinitialisation.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
              >
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="exemple@email.com"
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
              disabled={loading || !email}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                "Envoyer le lien"
              )}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
