"use client";

import { useSyncExternalStore, useCallback } from "react";
import { Bell } from "lucide-react";
import UrbanFlowIcon from "./icons/UrbanFlowIcon";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Bannière douce invitant l'utilisateur à activer les notifications push.
 *
 * S'affiche uniquement :
 *  - en mode standalone / PWA (iOS ne supporte le web push qu'en PWA installée) ;
 *  - si le navigateur supporte le web push ;
 *  - si la permission n'a jamais été demandée ("default") ;
 *  - si l'utilisateur ne l'a pas fermée localement.
 *
 * Le bouton principal appelle l'abonnement complet (permission + souscription
 * au backend) via le hook `usePushNotifications`.
 */

const noopSubscribe = () => () => {};

function getClientSnapshot() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error navigator.standalone est spécifique iOS
    navigator.standalone === true
  );
}

function getServerSnapshot() {
  return false;
}

function getDismissedSnapshot() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("urbanflow-push-banner-dismissed") === "1";
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem("urbanflow-push-banner-dismissed", "1");
  } catch {
    /* ignore */
  }
}

export default function PushNotificationBanner() {
  const isStandalone = useSyncExternalStore(
    noopSubscribe,
    getClientSnapshot,
    getServerSnapshot,
  );
  const dismissed = useSyncExternalStore(
    noopSubscribe,
    getDismissedSnapshot,
    getServerSnapshot,
  );

  const {
    supported,
    permission,
    loading,
    error,
    subscribe,
  } = usePushNotifications();

  const handleDismiss = useCallback(() => {
    setDismissed();
    // Force un re-render immédiat : useSyncExternalStore ne détecte pas le
    // changement localStorage seul (pas d'événement). On rafraîchit via le
    // gestionnaire d'événement storage dans une vraie implémentation, ici on
    // recharge la page pour rester simple.
    window.location.reload();
  }, []);

  const handleSubscribe = useCallback(async () => {
    try {
      await subscribe();
      if (Notification.permission === "granted") {
        handleDismiss();
      }
    } catch {
      // L'erreur est déjà stockée dans `error` du hook.
    }
  }, [subscribe, handleDismiss]);

  if (!isStandalone) return null;
  if (!supported) return null;
  if (permission !== "default") return null;
  if (dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-[var(--color-surface)] text-[var(--color-text-primary)] p-4 rounded-xl shadow-lg border border-[var(--color-border)] z-[60] flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[var(--color-primary)]/10 rounded-full">
            <Bell size={18} className="text-[var(--color-primary)]" />
          </div>
          <p className="text-sm font-medium">Alertes trafic en direct</p>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 hover:bg-[var(--color-border)] rounded-full transition-colors shrink-0"
          aria-label="Fermer"
        >
          <UrbanFlowIcon type="action" name="close" size={16} />
        </button>
      </div>

      <p className="text-sm text-[var(--color-text-secondary)]">
        Activez les notifications pour être prévenu instantanément des
        perturbations sur vos lignes et trajets favoris.
      </p>

      {error && (
        <p className="text-xs text-[var(--color-favorite-red)]">
          Impossible d&apos;activer les notifications : {error.message}
        </p>
      )}

      <div className="flex items-center justify-end">
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? "Activation…" : "Activer"}
        </button>
      </div>
    </div>
  );
}
