"use client";

import { useEffect, useState, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon paths (broken with bundlers)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

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
  isWatching?: boolean;           // watchPosition actif
  onToggleWatch?: () => void;     // toggle suivi continu
  followUser?: boolean;           // centrer la carte sur l'utilisateur
}

export default function MapComponent({
  center = [48.8566, 2.3522], // Paris
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
}: MapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const prevUserPosRef = useRef<{ lat: number; lon: number } | null>(null);

  const initialCenterRef = useRef(center);
  const initialZoomRef = useRef(zoom);

  // Initialize map
  useEffect(() => {
    const mapInstance = L.map("urbanflow-map", {
      center: initialCenterRef.current,
      zoom: initialZoomRef.current,
      zoomControl: true,
      attributionControl: true,
      // Désactiver le double-clic-zoom si on a un handler clic
      doubleClickZoom: onMapClick ? false : true,
    });

    // OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapInstance);

    setMap(mapInstance);

    return () => {
      mapInstance.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter map when center prop changes (but not on initial mount)
  const prevCenterRef = useRef(center);
  useEffect(() => {
    if (!map) return;
    const prev = prevCenterRef.current;
    const latDiff = Math.abs(center[0] - prev[0]);
    const lonDiff = Math.abs(center[1] - prev[1]);
    // Only recenter if significant change (> 0.001° ≈ 100m)
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

    // Clear only route markers (not user marker)
    routeMarkersRef.current.forEach((m) => map.removeLayer(m));
    routeMarkersRef.current = [];

    // Add regular markers
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

  // Add Vélib' stations
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

  // Add polyline (route)
  useEffect(() => {
    if (!map || polyline.length < 2) return;

    // Remove old polyline only
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    polylineRef.current = L.polyline(polyline, {
      color: "var(--color-primary)",
      weight: 4,
      opacity: 0.8,
    }).addTo(map);

    // Fit map to polyline bounds
    const bounds = L.latLngBounds(polyline);
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, polyline]);

  // Handle map clicks
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

  // ─── User position marker + accuracy circle ────────────────────────
  useEffect(() => {
    if (!map || !userPosition) return;

    // Skip update if position hasn't changed significantly (< 5m)
    if (prevUserPosRef.current) {
      const dLat = Math.abs(userPosition.lat - prevUserPosRef.current.lat);
      const dLon = Math.abs(userPosition.lon - prevUserPosRef.current.lon);
      // ~5m ≈ 0.000045°
      if (dLat < 0.000045 && dLon < 0.000045) return;
    }
    prevUserPosRef.current = { lat: userPosition.lat, lon: userPosition.lon };

    // Remove old user marker + accuracy circle
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
    if (accuracyCircleRef.current) {
      map.removeLayer(accuracyCircleRef.current);
      accuracyCircleRef.current = null;
    }

    const icon = L.divIcon({
      className: "user-position-marker",
      html: `<div style="
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #2E7D9B;
        border: 3px solid white;
        box-shadow: 0 0 0 4px rgba(46,125,155,0.3), 0 2px 6px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    userMarkerRef.current = L.marker(
      [userPosition.lat, userPosition.lon],
      { icon, zIndexOffset: 1000 }
    )
      .addTo(map)
      .bindPopup("📍 Votre position");

    // Accuracy circle
    if (userPosition.accuracy && userPosition.accuracy > 0) {
      accuracyCircleRef.current = L.circle(
        [userPosition.lat, userPosition.lon],
        {
          radius: userPosition.accuracy,
          color: "#2E7D9B",
          fillColor: "rgba(46,125,155,0.1)",
          fillOpacity: 0.3,
          weight: 1,
        }
      ).addTo(map);
    }

    // Center map on user ONLY in follow mode (not when polyline < 2)
    if (followUser) {
      map.panTo([userPosition.lat, userPosition.lon]);
    }
  }, [map, userPosition, followUser]);

  return (
    <div className="relative w-full h-full">
      <div
        id="urbanflow-map"
        className={`w-full h-full rounded-[var(--card-radius)] overflow-hidden ${className}`}
        style={{ minHeight: "200px" }}
      />
      {/* Map toolbar */}
      <div className="absolute bottom-3 right-3 z-[500] flex flex-col gap-2">
        {/* Locate me button */}
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
        {/* Watch GPS toggle button */}
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
      {/* GPS status indicator */}
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