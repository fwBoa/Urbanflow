"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, MapPin, Cookie, BarChart3, X } from "lucide-react";

const CONSENT_KEY = "urbanflow_consent";
const CONSENT_VERSION = "1.0";

export interface ConsentState {
  necessary: boolean; // Always true
  geoloc: boolean;
  cookies: boolean;
  analytics: boolean; // Always false by default
  date: string | null;
  version: string | null;
}

export const defaultConsent: ConsentState = {
  necessary: true,
  geoloc: false,
  cookies: false,
  analytics: false,
  date: null,
  version: null,
};

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return defaultConsent;
  try {
    const data = localStorage.getItem(CONSENT_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      // If version mismatch, re-ask consent
      if (parsed.version !== CONSENT_VERSION) return defaultConsent;
      return parsed;
    }
  } catch {
    // ignore
  }
  return defaultConsent;
}

export function saveConsent(consent: ConsentState): void {
  consent.date = new Date().toISOString();
  consent.version = CONSENT_VERSION;
  localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
}

export function hasGeolocConsent(): boolean {
  return getConsent().geoloc === true;
}

export function hasConsentBeenAsked(): boolean {
  const c = getConsent();
  return c.date !== null;
}

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [consent, setConsent] = useState<ConsentState>(defaultConsent);

  useEffect(() => {
    const current = getConsent();
    if (!current.date) {
      setVisible(true);
    }
    setConsent(current);
  }, []);

  const acceptAll = useCallback(() => {
    const all: ConsentState = {
      necessary: true,
      geoloc: true,
      cookies: true,
      analytics: false, // Analytics disabled by default per RGPD
      date: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    saveConsent(all);
    setConsent(all);
    setVisible(false);
    // Notify backend if user is logged in
    syncConsentToBackend(all);
  }, []);

  const acceptNecessary = useCallback(() => {
    const min: ConsentState = {
      ...defaultConsent,
      date: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    saveConsent(min);
    setConsent(min);
    setVisible(false);
    syncConsentToBackend(min);
  }, []);

  const acceptCustom = useCallback(() => {
    const custom: ConsentState = {
      ...consent,
      necessary: true,
      analytics: false,
      date: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    saveConsent(custom);
    setConsent(custom);
    setVisible(false);
    syncConsentToBackend(custom);
  }, [consent]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4 animate-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Shield className="text-[var(--color-primary)]" size={24} />
            <h3 id="consent-title" className="text-lg font-semibold text-[var(--color-text-primary)]">
              Protection de vos données
            </h3>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="p-2.5 rounded-full hover:bg-[var(--color-surface)]"
            aria-label="Fermer la bannière de consentement"
          >
            <X size={18} className="text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-[var(--color-text-secondary)]">
          UrbanFlow Mobility utilise des données pour calculer vos itinéraires et améliorer votre expérience.
          Conformément au RGPD, vous choisissez ce que vous acceptez.
        </p>

        {/* Toggle details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-[var(--color-primary)] underline"
        >
          {showDetails ? "Masquer les détails" : "Personnaliser mes choix"}
        </button>

        {/* Detailed choices */}
        {showDetails && (
          <div className="space-y-3">
            {/* Necessary - always on */}
            <label className="flex items-start gap-3 cursor-not-allowed opacity-70" aria-disabled="true">
              <input type="checkbox" checked disabled aria-disabled="true" className="mt-1 accent-[var(--color-primary)]" />
              <div>
                <div className="flex items-center gap-1 text-sm font-medium">
                  <Cookie size={14} /> Nécessaires
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Session de connexion. Requis pour le fonctionnement.
                </p>
              </div>
            </label>

            {/* Geolocation */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent.geoloc}
                onChange={(e) => setConsent({ ...consent, geoloc: e.target.checked })}
                className="mt-1 accent-[var(--color-primary)]"
              />
              <div>
                <div className="flex items-center gap-1 text-sm font-medium">
                  <MapPin size={14} /> Géolocalisation
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Position pour calcul d&apos;itinéraire. Non stockée en base.
                </p>
              </div>
            </label>

            {/* Cookies */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent.cookies}
                onChange={(e) => setConsent({ ...consent, cookies: e.target.checked })}
                className="mt-1 accent-[var(--color-primary)]"
              />
              <div>
                <div className="flex items-center gap-1 text-sm font-medium">
                  <Cookie size={14} /> Cookies fonctionnels
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Préférences (mode sombre, mode de transport).
                </p>
              </div>
            </label>

            {/* Analytics - always off */}
            <label className="flex items-start gap-3 cursor-not-allowed opacity-50">
              <input type="checkbox" checked={false} disabled className="mt-1" />
              <div>
                <div className="flex items-center gap-1 text-sm font-medium">
                  <BarChart3 size={14} /> Analytiques
                </div>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  Désactivés par défaut. Non utilisés actuellement.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={acceptAll}
            className="w-full py-3 rounded-full bg-[var(--color-primary)] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Tout accepter
          </button>
          <div className="flex gap-2">
            <button
              onClick={acceptNecessary}
              className="flex-1 py-2.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm font-medium hover:bg-[var(--color-surface)] transition-colors"
            >
              Refuser
            </button>
            {showDetails && (
              <button
                onClick={acceptCustom}
                className="flex-1 py-2.5 rounded-full border border-[var(--color-primary)] text-[var(--color-primary)] text-sm font-medium hover:bg-[var(--color-surface)] transition-colors"
              >
                Enregistrer mes choix
              </button>
            )}
          </div>
        </div>

        {/* Legal link */}
        <p className="text-xs text-center text-[var(--color-text-tertiary)]">
          En continuant, vous acceptez notre{" "}
          <a href="/privacy" className="text-[var(--color-primary)] underline">
            politique de confidentialité
          </a>.
        </p>
      </div>
    </div>
  );
}

// ─── Sync consent to backend if logged in (cookie-based auth) ───
async function syncConsentToBackend(consent: ConsentState) {
  try {
    // Only sync if user is authenticated (session flag)
    if (sessionStorage.getItem("urbanflow_authenticated") !== "true") return;

    await fetch("/api/auth/consent", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        consentGeoloc: consent.geoloc,
        consentCookies: consent.cookies,
        consentHistory: false,
        consentVersion: consent.version,
      }),
    });
  } catch {
    // Silently fail — consent is stored locally regardless
  }
}