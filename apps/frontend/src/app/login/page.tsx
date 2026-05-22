"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Mail, Lock, ArrowRight, UserPlus } from "lucide-react";

export default function LoginPage() {
  const { login, error: authError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      router.push("/profile");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--color-background)]">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚇</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            UrbanFlow
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Mobilité multimodale Paris
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {(error || authError) && (
            <div className="bg-[var(--color-favorite-red)]/10 border border-[var(--color-favorite-red)]/30 rounded-[var(--card-radius)] px-4 py-3 text-sm text-[var(--color-favorite-red)]">
              {error || authError}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.fr"
                required
                className="w-full pl-10 pr-4 py-3 rounded-[var(--card-radius)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" aria-hidden="true" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full pl-10 pr-4 py-3 rounded-[var(--card-radius)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-[var(--card-radius)] bg-[var(--color-primary)] text-white font-semibold hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Se connecter
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Register link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Pas encore de compte ?{" "}
            <button
              onClick={() => router.push("/register")}
              className="text-[var(--color-primary)] font-semibold hover:underline inline-flex items-center gap-1"
            >
              Créer un compte
              <UserPlus size={14} />
            </button>
          </p>
        </div>

        {/* Guest access */}
        <div className="mt-4 text-center">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Continuer sans compte →
          </button>
        </div>
      </div>
    </div>
  );
}