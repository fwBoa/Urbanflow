"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface UsePushNotificationsResult {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  loading: boolean;
  error: Error | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Gère l'abonnement Web Push côté client.
 * Auth cookie : toutes les requêtes backend partent avec credentials: "include".
 */
export function usePushNotifications(): UsePushNotificationsResult {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!isSupported()) {
      setSupported(false);
      setPermission("unsupported");
      return;
    }

    setSupported(true);
    setPermission(Notification.permission);

    let cancelled = false;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;
        registrationRef.current = registration;
        const existing = await registration.pushManager.getSubscription();
        setSubscribed(!!existing);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported || permission === "denied") return;
    setLoading(true);
    setError(null);

    try {
      const newPermission = await Notification.requestPermission();
      setPermission(newPermission);
      if (newPermission !== "granted") {
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      registrationRef.current = registration;

      if (!VAPID_PUBLIC_KEY) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured");
      }

      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json: PushSubscriptionJSON = pushSubscription.toJSON() as PushSubscriptionJSON;

      const res = await fetch(`${API_URL}/api/notifications/push/subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });

      if (!res.ok) {
        throw new Error(`Push subscribe failed: ${res.status}`);
      }

      setSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [supported, permission]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const endpoint = existing?.endpoint;

      if (existing) {
        await existing.unsubscribe();
      }

      if (endpoint) {
        await fetch(`${API_URL}/api/notifications/push/subscribe`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }

      setSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return {
    supported,
    permission,
    subscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}
