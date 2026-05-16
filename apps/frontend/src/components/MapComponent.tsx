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
  userPosition?: { lat: number; lon: number } | null;
  onLocateUser?: () => void;
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
}: MapProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    const mapInstance = L.map("urbanflow-map", {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true,
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

  // Update center when props change
  useEffect(() => {
    if (map) {
      map.setView(center, zoom);
    }
  }, [map, center, zoom]);

  // Add markers
  useEffect(() => {
    if (!map) return;

    // Clear existing markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.removeLayer(layer);
      }
    });

    // Add regular markers
    markers.forEach((m) => {
      const markerColor = m.color || "var(--color-primary)";

      if (m.color || m.label) {
        // Custom colored marker using divIcon
        const icon = L.divIcon({
          className: "custom-marker",
          html: `<div style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: ${markerColor};
            border: 3px solid white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: 600;
          ">${m.label ? m.label.charAt(0) : ""}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker(m.position, { icon }).addTo(map).bindPopup(m.label || "");
      } else {
        L.marker(m.position).addTo(map);
      }
    });

    // Add Vélib' stations
    if (showVelib && velibStations.length > 0) {
      velibStations.forEach((station) => {
        const ratio =
          station.available_bike_stands > 0
            ? station.available_bikes /
              (station.available_bikes + station.available_bike_stands)
            : 0;

        const color =
          ratio > 0.5
            ? "var(--color-eco-green)"
            : ratio > 0.2
            ? "var(--color-mobility-orange)"
            : "var(--color-favorite-red)";

        const icon = L.divIcon({
          className: "velib-marker",
          html: `<div style="
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: ${color};
            border: 2px solid white;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 10px;
            font-weight: 700;
          ">🚲</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        L.marker([station.position.lat, station.position.lon], { icon })
          .addTo(map)
          .bindPopup(
            `<strong>${station.name}</strong><br/>🚲 ${station.available_bikes} vélos disponibles<br/>🅿️ ${station.available_bike_stands} places libres`
          );
      });
    }
  }, [map, markers, showVelib, velibStations]);

  // Add polyline (route)
  useEffect(() => {
    if (!map || polyline.length < 2) return;

    // Clear existing polylines
    map.eachLayer((layer) => {
      if (layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    L.polyline(polyline, {
      color: "var(--color-primary)",
      weight: 4,
      opacity: 0.8,
      dashArray: undefined,
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

  // ─── User position marker ──────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    // Remove old user marker
    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    if (userPosition) {
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

      // Center map on user if no polyline
      if (polyline.length < 2) {
        map.setView([userPosition.lat, userPosition.lon], 15);
      }
    }
  }, [map, userPosition, polyline]);

  return (
    <div className="relative w-full h-full">
      <div
        id="urbanflow-map"
        className={`w-full h-full rounded-[var(--card-radius)] overflow-hidden ${className}`}
        style={{ minHeight: "200px" }}
      />
      {/* Locate me button */}
      {onLocateUser && (
        <button
          onClick={onLocateUser}
          className="absolute bottom-3 right-3 z-[500] w-10 h-10 rounded-full bg-white shadow-lg border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-surface)] transition-colors"
          aria-label="Ma position"
          title="Ma position"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E7D9B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>
      )}
    </div>
  );
}