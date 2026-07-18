"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Mail, Lock, User, LogIn } from "lucide-react";
import UrbanFlowIcon from "@/components/icons/UrbanFlowIcon";

export default function RegisterPage() {
  const { register, error: authError } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }

    setLoading(true);

    try {
      await register(email, password, displayName || undefined);
      router.push("/profile");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--color-background)]">
      <div className="w-full max-w-sm">
        {/* Logo UrbanFlow */}
        <div className="text-center mb-8">
          <Image
            src="/assets/urbanflow/brand/urbanflow-pictogramme.svg"
            alt="UrbanFlow"
            width={80}
            height={80}
            priority
            className="mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Créer un compte
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Rejoignez UrbanFlow Mobility
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
            <label htmlFor="register-name" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
              Nom d&apos;utilisateur <span className="text-[var(--color-text-tertiary)]">(optionnel)</span>
            </label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" aria-hidden="true" />
              <input
                id="register-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Votre nom"
                className="w-full pl-10 pr-4 py-3 rounded-[var(--card-radius)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-email" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" aria-hidden="true" />
              <input
                id="register-email"
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
            <label htmlFor="register-password" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" aria-hidden="true" />
              <input
                id="register-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 caractères"
                required
                minLength={8}
                className="w-full pl-10 pr-4 py-3 rounded-[var(--card-radius)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-confirm-password" className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" aria-hidden="true" />
              <input
                id="register-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre mot de passe"
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
                Créer mon compte
                <UrbanFlowIcon type="action" name="arrow-right" size={18} />
              </>
            )}
          </button>
        </form>

        {/* Login link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">
            Déjà un compte ?{" "}
            <button
              onClick={() => router.push("/login")}
              className="text-[var(--color-primary)] font-semibold hover:underline inline-flex items-center gap-1"
            >
              Se connecter
              <LogIn size={14} />
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
