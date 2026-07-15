"use client";

import { useEffect, useState, useCallback } from "react";

export interface DeviceHeadingState {
  /** Cap en degrés, 0 = Nord, sens horaire (0-360). Null si non disponible. */
  heading: number | null;
  /** Permission accordée / refusée / inconnue. */
  permission: "granted" | "denied" | "prompt" | "unsupported";
  /** Demande explicite de permission (iOS 13+). */
  requestPermission: () => Promise<void>;
}

interface DeviceOrientationEventWithPermission
  extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

interface DeviceOrientationStaticWithPermission {
  requestPermission?: () => Promise<"granted" | "denied">;
}

function getInitialPermission(): DeviceHeadingState["permission"] {
  if (typeof window === "undefined") return "unsupported";
  if (!window.DeviceOrientationEvent) return "unsupported";
  const DO = window.DeviceOrientationEvent as DeviceOrientationStaticWithPermission;
  return typeof DO.requestPermission === "function" ? "prompt" : "granted";
}

/**
 * Hook qui expose le cap de l'appareil via l'événement `deviceorientation`.
 *
 * - iOS Safari : utilise `webkitCompassHeading` (cap magnétique absolu).
 * - Android/Chrome : utilise `alpha` compensé par l'orientation de l'écran.
 *
 * Le fallback est utile car `position.coords.heading` du GPS est souvent null
 * sur les navigateurs mobiles, en particulier à l'arrêt ou en marche lente.
 */
export function useDeviceHeading(): DeviceHeadingState {
  const [heading, setHeading] = useState<number | null>(null);
  const [permission, setPermission] =
    useState<DeviceHeadingState["permission"]>(getInitialPermission);

  const requestPermission = useCallback(async () => {
    const DO = window.DeviceOrientationEvent as
      | DeviceOrientationStaticWithPermission
      | undefined;
    if (!DO || typeof DO.requestPermission !== "function") {
      setPermission("unsupported");
      return;
    }
    try {
      const result = await DO.requestPermission();
      setPermission(result);
    } catch {
      setPermission("denied");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.DeviceOrientationEvent) {
      return;
    }

    const handler = (event: DeviceOrientationEvent) => {
      const e = event as DeviceOrientationEventWithPermission;
      let cap: number | null = null;

      if (
        typeof e.webkitCompassHeading === "number" &&
        !Number.isNaN(e.webkitCompassHeading)
      ) {
        // iOS Safari : heading magnétique absolu (0 = Nord, clockwise).
        cap = e.webkitCompassHeading % 360;
      } else if (typeof e.alpha === "number" && !Number.isNaN(e.alpha)) {
        // Android/Chrome : alpha = 0 quand le haut du téléphone pointe au Nord.
        // On inverse le sens et on compense la rotation de l'écran.
        const screenAngle =
          typeof window.screen !== "undefined" &&
          window.screen.orientation &&
          typeof window.screen.orientation.angle === "number"
            ? window.screen.orientation.angle
            : 0;
        cap = (360 - e.alpha + screenAngle) % 360;
      }

      if (cap !== null) {
        setHeading(cap);
        setPermission((prev) => (prev === "granted" ? prev : "granted"));
      }
    };

    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, []);

  return { heading, permission, requestPermission };
}
