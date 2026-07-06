"use client";

import { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// leaflet-rotate : import à effet de bord qui patche L.Map (ajoute setBearing +
// handler `rotate`). Compatible Leaflet 1.9. On instancie la carte en impératif
// (L.map), pas via MapContainer/useMap, donc pas de souci d'intégration RL.
// Pas de CSS à importer — la rotation est appliquée via transform JS par le plugin.
import "leaflet-rotate";

let iconsFixed = false;

function fixLeafletIcons() {
  if (iconsFixed || typeof window === "undefined") return;
  iconsFixed = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

export interface MapProps {
  center?: [number, number];
  zoom?: number;
  markers?: Array<{
    position: [number, number];
    label?: string;
    color?: string;
  }>;
  polyline?: Array<[number, number]>;
  className?: string;
  showVelib?: boolean;
  velibStations?: Array<{
    position: { lon: number; lat: number };
    name: string;
    available_bikes: number;
    available_bike_stands: number;
  }>;
  onMapClick?: (lat: number, lng: number) => void;
  userPosition?: { lat: number; lon: number; accuracy?: number; heading?: number | null } | null;
  onLocateUser?: () => void;
  isWatching?: boolean;
  onToggleWatch?: () => void;
  followUser?: boolean;
  shapePolylines?: Array<{ points: [number, number][]; color: string; weight?: number }>;
  /** Callback appelé quand l'instance Leaflet est créée (pour JourneyLine externe) */
  onMapReady?: (map: L.Map) => void;
  /**
   * Cap de la carte en degrés (0 = nord en haut). Pendant la navigation, on passe
   * le heading/device ou le bearing vers le prochain manœuvre pour orienter la
   * carte dans le sens de marche. Hors nav → 0. Utilise `map.setBearing()` du
   * plugin leaflet-rotate.
   */
  bearing?: number;
  /**
   * Zone à ajuster (fit) — typiquement [userPosition, prochainManoeuvre] pendant
   * la nav pour zoomer sur l'étape active. Le fit n'est déclenché qu'au changement
   * de `fitBoundsKey` (évite le jitter à chaque tick GPS).
   */
  fitBounds?: Array<[number, number]>;
  fitBoundsKey?: string;
}

export default function MapComponent({
  center = [48.8566, 2.3522],
  zoom = 13,
  markers = [],
  polyline = [],
  className = "",
  showVelib = false,
  velibStations = [],
  onMapClick,
  userPosition,
  onLocateUser,
  isWatching = false,
  onToggleWatch,
  followUser = false,
  shapePolylines = [],
  onMapReady,
  bearing,
  fitBounds,
  fitBoundsKey,
}: MapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const prevUserPosRef = useRef<{ lat: number; lon: number } | null>(null);

  const initialCenterRef = useRef(center);
  const initialZoomRef = useRef(zoom);

  // Initialize map
  useEffect(() => {
    fixLeafletIcons();
    // Expose L globally so JourneyLine (chargé dynamiquement) peut y accéder
    // sans avoir à importer leaflet (ce qui casserait le SSR)
    if (typeof window !== "undefined") {
      (window as unknown as { L?: typeof L }).L = L;
    }
    // Options leaflet-rotate (`rotate`, `touchRotate`) ne sont pas dans les types
    // @types/leaflet → on type l'objet en `any` pour les passer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapOptions: any = {
      center: initialCenterRef.current,
      zoom: initialZoomRef.current,
      zoomControl: true,
      attributionControl: true,
      doubleClickZoom: onMapClick ? false : true,
      // leaflet-rotate : active le handler `rotate` (rend setBearing disponible).
      rotate: true,
      // On ne veut pas que l'utilisateur pivote la carte au doigt — seulement
      // la rotation programmatique (setBearing). Désactive le geste tactile.
      touchRotate: false,
    };
    const mapInstance = L.map("urbanflow-map", mapOptions);

    // Ceinture : si le handler tactile existe quand même, on le coupe.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyMap = mapInstance as any;
    if (anyMap.touchRotate && typeof anyMap.touchRotate.disable === "function") {
      anyMap.touchRotate.disable();
    }

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapInstance);

    setMap(mapInstance);
    if (onMapReady) onMapReady(mapInstance);

    return () => {
      mapInstance.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter map when center prop changes
  const prevCenterRef = useRef(center);
  useEffect(() => {
    if (!map) return;
    const prev = prevCenterRef.current;
    const latDiff = Math.abs(center[0] - prev[0]);
    const lonDiff = Math.abs(center[1] - prev[1]);
    if (latDiff > 0.001 || lonDiff > 0.001) {
      map.panTo(center);
      prevCenterRef.current = center;
    }
  }, [map, center]);

  const routeMarkersRef = useRef<L.Marker[]>([]);
  const velibMarkersRef = useRef<L.Marker[]>([]);

  // Add markers
  useEffect(() => {
    if (!map) return;
    routeMarkersRef.current.forEach((m) => map.removeLayer(m));
    routeMarkersRef.current = [];

    markers.forEach((m) => {
      const markerColor = m.color || "var(--color-primary)";
      if (m.color || m.label) {
        const icon = L.divIcon({
          className: "custom-marker",
          html: `<div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: ${markerColor}; border: 3px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 12px; font-weight: 600;
          ">${m.label ? m.label.charAt(0) : ""}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const marker = L.marker(m.position, { icon }).addTo(map).bindPopup(m.label || "");
        routeMarkersRef.current.push(marker);
      } else {
        const marker = L.marker(m.position).addTo(map);
        routeMarkersRef.current.push(marker);
      }
    });
  }, [map, markers]);

  // Vélib' stations
  useEffect(() => {
    if (!map) return;
    velibMarkersRef.current.forEach((m) => map.removeLayer(m));
    velibMarkersRef.current = [];

    if (showVelib && velibStations.length > 0) {
      velibStations.forEach((station) => {
        const icon = L.divIcon({
          className: "velib-marker",
          html: `<div style="
            width: 22px; height: 22px; border-radius: 50%;
            background: var(--color-primary); border: 2px solid white;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            color: white; font-size: 10px; font-weight: 700;
          ">🚲</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const marker = L.marker([station.position.lat, station.position.lon], { icon })
          .addTo(map)
          .bindPopup(`<strong>${station.name}</strong>`);
        velibMarkersRef.current.push(marker);
      });
    }
  }, [map, showVelib, velibStations]);

  const polylineRef = useRef<L.Polyline | null>(null);
  const shapePolylinesRef = useRef<L.Polyline[]>([]);

  // Polyline simple
  useEffect(() => {
    if (!map || polyline.length < 2) return;
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    polylineRef.current = L.polyline(polyline, {
      color: "var(--color-primary)",
      weight: 4,
      opacity: 0.8,
    }).addTo(map);
    // N'ajuste la vue sur toute la polyline que hors navigation — pendant la nav,
    // c'est `fitBounds` (zoom segment actif) qui pilote, sinon les deux se battent.
    if (!followUser) {
      const bounds = L.latLngBounds(polyline);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, polyline, followUser]);

  // Shape polylines
  useEffect(() => {
    if (!map) return;
    shapePolylinesRef.current.forEach((p) => map.removeLayer(p));
    shapePolylinesRef.current = [];
    shapePolylines.forEach((sp) => {
      if (sp.points.length < 2) return;
      const poly = L.polyline(sp.points, {
        color: sp.color || "#E53935",
        weight: sp.weight || 5,
        opacity: 0.9,
      }).addTo(map);
      shapePolylinesRef.current.push(poly);
    });
  }, [map, shapePolylines]);

  // Map clicks
  useEffect(() => {
    if (!map || !onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onMapClick]);

  // User position
  useEffect(() => {
    if (!map || !userPosition) return;

    if (prevUserPosRef.current) {
      const dLat = Math.abs(userPosition.lat - prevUserPosRef.current.lat);
      const dLon = Math.abs(userPosition.lon - prevUserPosRef.current.lon);
      if (dLat < 0.000045 && dLon < 0.000045) return;
    }
    prevUserPosRef.current = { lat: userPosition.lat, lon: userPosition.lon };

    if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
    if (accuracyCircleRef.current) map.removeLayer(accuracyCircleRef.current);

    const icon = L.divIcon({
      className: "user-position-marker",
      html: `<div style="
        width: 16px; height: 16px; border-radius: 50%;
        background: #2E7D9B; border: 3px solid white;
        box-shadow: 0 0 0 4px rgba(46,125,155,0.3), 0 2px 6px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    userMarkerRef.current = L.marker([userPosition.lat, userPosition.lon], {
      icon,
      zIndexOffset: 1000,
    })
      .addTo(map)
      .bindPopup("📍 Votre position");

    if (userPosition.accuracy && userPosition.accuracy > 0) {
      accuracyCircleRef.current = L.circle([userPosition.lat, userPosition.lon], {
        radius: userPosition.accuracy,
        color: "#2E7D9B",
        fillColor: "rgba(46,125,155,0.1)",
        fillOpacity: 0.3,
        weight: 1,
      }).addTo(map);
    }

    if (followUser) map.panTo([userPosition.lat, userPosition.lon]);
  }, [map, userPosition, followUser]);

  // ─── Rotation au cap (leaflet-rotate) ───────────────────────────────
  // bearing en degrés (0 = nord en haut). Pendant la nav on passe le heading
  // device (ou le bearing vers le prochain manœuvre) pour orienter la carte
  // dans le sens de marche.
  useEffect(() => {
    if (!map || bearing === undefined) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyMap = map as any;
    if (typeof anyMap.setBearing === "function") {
      try {
        anyMap.setBearing(bearing);
      } catch {
        // best-effort — si le plugin n'est pas chargé, no-op
      }
    }
  }, [map, bearing]);

  // ─── Zoom segment actif (fit) ───────────────────────────────────────
  // Ne re-fit qu'au changement de `fitBoundsKey` (typiquement l'index du segment
  // actif) pour éviter le jitter à chaque tick GPS. Entre deux fits, le panTo
  // de suivi utilisateur garde l'utilisateur centré.
  const prevFitKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!map || !fitBounds || fitBounds.length < 2 || !fitBoundsKey) return;
    if (prevFitKeyRef.current === fitBoundsKey) return;
    prevFitKeyRef.current = fitBoundsKey;
    try {
      const bounds = L.latLngBounds(fitBounds);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    } catch {
      // best-effort
    }
  }, [map, fitBounds, fitBoundsKey]);

  return (
    <div className="relative w-full h-full">
      <div
        id="urbanflow-map"
        className={`w-full h-full rounded-[var(--card-radius)] overflow-hidden ${className}`}
        style={{ minHeight: "200px" }}
      />

      {/* Map toolbar */}
      <div className="absolute bottom-3 right-3 z-[500] flex flex-col gap-2">
        {onLocateUser && (
          <button
            onClick={onLocateUser}
            className="w-10 h-10 rounded-full bg-white shadow-lg border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-surface)] transition-colors"
            aria-label="Ma position"
            title="Ma position"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E7D9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </button>
        )}
        {onToggleWatch && (
          <button
            onClick={onToggleWatch}
            className={`w-10 h-10 rounded-full shadow-lg border flex items-center justify-center transition-colors ${
              isWatching
                ? "bg-[#2E7D9B] border-[#2E7D9B] text-white"
                : "bg-white border-[var(--color-border)] hover:bg-[var(--color-surface)]"
            }`}
            aria-label={isWatching ? "Arrêter le suivi GPS" : "Suivi GPS continu"}
            title={isWatching ? "Arrêter le suivi GPS" : "Suivi GPS continu"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isWatching ? "white" : "#2E7D9B"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
              {isWatching && (
                <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="3s" repeatCount="indefinite" />
              )}
            </svg>
          </button>
        )}
      </div>

      {isWatching && (
        <div className="absolute top-3 left-3 z-[500] px-3 py-1.5 rounded-full bg-[#2E7D9B] text-white text-xs font-medium shadow-lg flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          GPS actif
          {userPosition?.accuracy && (
            <span className="opacity-75">±{Math.round(userPosition.accuracy)}m</span>
          )}
        </div>
      )}
    </div>
  );
}