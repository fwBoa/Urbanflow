# Urban Flow Mobility — Frontend (Next.js)

Interface web PWA pour la plateforme de mobilité multimodale Urban Flow Mobility.

> **État au 2026-07-06** : Next.js 16 + React 19 + TypeScript 5 + Tailwind v4 + Leaflet.
> Refonte majeure récente (`7b8988e`) : dark mode no-FOUC, a11y `prefers-reduced-motion`, AbortController sur fetches, composants `SearchAutocomplete` / `NearbyStopDrawer` / `Switch` / `CO2Comparison`, source unique couleurs modes.
> Immersion trajet turn-by-turn (`dea244c`) : banner directionnel (`TurnByTurnBanner`), reroutage réel (8s/30m, AbortController, bouton recalculer), rotation au cap via `leaflet-rotate` + zoom auto sur segment actif.
> **PWA offline + Web Push** (`ea42742`) : page `/offline` (fallback réseau), `usePushNotifications` (subscribe/unsubscribe), SW enrichi (push/notificationclick/install + cache v2 + skip dev HMR), bouton push dans `/profile`, opt-in dans `ConsentBanner`.

## Stack

- **Next.js 16.2.6** (App Router, Turbopack, standalone prod build, `use client`)
- **React 19** + **TypeScript 5**
- **Tailwind CSS v4** + CSS Variables (design tokens)
- **Leaflet** + OpenStreetMap (cartographie, `next/dynamic` SSR off)
- **leaflet-rotate** (rotation au cap programmatique via `map.setBearing()` — activé en nav, `touchRotate` désactivé)
- **lucide-react** (icônes SVG)
- **Framer Motion** (animations, désactivées si `prefers-reduced-motion`)
- PWA (manifest.json + service worker, installable)

## Pages (6 écrans)

| Page | Route | Description |
|---|---|---|
| Accueil | `/` | Recherche rapide, modes de transport, lignes PRIM temps réel, trajets récents |
| Recherche | `/search` | O/D + filtres modes + autocomplete arrêts/adresses (`SearchAutocomplete`) + géoloc + clic carte |
| Détail itinéraire | `/trip/[id]` | Timeline segmentée, `CO2Comparison` (vs voiture ADEME 170 g/km), carte, navigation GPS immersive, **turn-by-turn** (banner directionnel + reroutage auto sur hors-trajet) |
| Hors ligne | `/offline` | ⭐ Page fallback servie par le SW quand le réseau est coupé (`CloudOff` + bouton « Réessayer ») |
| Favoris | `/favorites` | Onglets Favoris/Historique, cartes trajet, badges CO2 |
| Profil | `/profile` | Avatar, stats, badges gamification, économie CO2, dark mode, RGPD |
| Admin | `/admin` | Dashboard (users, trips, GTFS load), users, trips, broadcast, reload GTFS |

## Composants (17+)

| Composant | Fichier | Rôle |
|---|---|---|
| `NavBar` | `components/NavBar.tsx` | Navigation basse (Home, Search, Heart, User) |
| `Header` | `components/Header.tsx` | En-tête (titre, retour, action droite) |
| `MapComponent` | `components/MapComponent.tsx` | Carte Leaflet interactive (marqueurs, polylignes, Vélib') |
| `SearchBar` | `components/SearchBar.tsx` | Champ de recherche avec icône (respecte `prefers-reduced-motion`) |
| `FilterChip` | `components/FilterChip.tsx` | Chips de filtre (Rapide/Éco/Économique) animées |
| `TripCard` | `components/TripCard.tsx` | Carte résultat trajet (Framer Motion spring stagger) |
| `VelibStationCard` | `components/VelibStationCard.tsx` | Carte station Vélib' |
| `NotificationBell` | `components/NotificationBell.tsx` | Cloche notifications + compteur non-lus |
| `ConsentBanner` | `components/ConsentBanner.tsx` | Bandeau consentement RGPD (geoloc/cookies/history) |
| `PwaInstallBanner` | `components/PwaInstallBanner.tsx` | Bandeau d'installation PWA |
| `ModeBadge` | `components/ModeBadge.tsx` | Badge mode (10 modes, couleurs IDFM depuis `mode-colors.ts`) |
| `journey-helpers` | `components/journey-helpers.ts` | Helpers construction timeline / format durée / CO2 |
| `SearchAutocomplete` | `components/SearchAutocomplete.tsx` | ⭐ Autocomplete fusion arrêts + adresses (AbortController) |
| `NearbyStopDrawer` | `components/NearbyStopDrawer.tsx` | ⭐ Drawer prochains départs quand on clique un arrêt proche |
| `Switch` | `components/Switch.tsx` | ⭐ Toggle UI atomique accessible (consent, profil, PWA) |
| `CO2Comparison` | (utilisé dans `trip/[id]`) | ⭐ Comparaison CO2 vs voiture ADEME 170 g/km (g + %) |
| `TurnByTurnBanner` | `components/TurnByTurnBanner.tsx` | ⭐ Bandeau overlay directionnel (gauche/droite/straight/board/alight/arrive) + distance + ETA, Framer Motion + `usePrefersReducedMotion` |
| `ServiceWorkerRegistration` | `components/ServiceWorkerRegistration.tsx` | ⭐ Enregistrement du SW `/sw.js` au layout, `displayMode: 'standalone'` pour install prompt PWA |

## Hooks (`hooks/`)

| Hook | Fichier | Rôle |
|---|---|---|
| `useTransport` | `useTransport.ts` | ⭐ Hooks API avec `AbortController` (annule fetches concurrents + en vol) |
| `useGeolocation` | (livré précedemment) | Géolocalisation navigateur (ponctuel + `watchPosition` continu) |
| `useNavigation` | `useNavigation.ts` | ⭐ Navigation GPS (segments, vibration, voix, wake lock, **turn-by-turn directionnel** via delta cap-bearing, `nextManeuverPoint` depuis `geojson` Navitia ou repli polyline, `distanceToManeuver` + ETA, `reroute()` avec AbortController) |
| `usePushNotifications` | `usePushNotifications.ts` | ⭐ Abonnement Web Push (VAPID) : `supported`, `permission`, `subscribed`, `subscribe()` / `unsubscribe()`, conversion VAPID base64url → Uint8Array, fallback gracieux si non supporté |
| `useDarkMode` | `useDarkMode.ts` | Dark mode (respecte `prefers-color-scheme`) |
| `usePrefersReducedMotion` | `usePrefersReducedMotion.ts` | ⭐ Détecte préférence OS, désactive animations Framer Motion |

## Contexts (`contexts/`)

| Context | Rôle |
|---|---|
| `AuthContext` | JWT, user courant, signup/login/logout, RGPD export/anonymize |
| `ThemeContext` | ⭐ Dark mode no-FOUC (script inline avant hydratation) |

## Constantes (`constants/`)

| Fichier | Rôle |
|---|---|
| `mode-colors.ts` | ⭐ `MAP_MODE_COLORS` (IDFM carte) + `UI_MODE_COLORS` (badges assombris) — source unique |

## Service API

`services/api.ts` — classe `ApiService` typée (méthodes : `getLines`, `getStops`, `searchStops`, `getNearbyStops`, `getJourney`, `getAlerts`, `getVelibStations`, `getElevatorStatus`, etc.).
`services/favorites.ts` — favoris, historique, stats, préférences.

Types partagés : `PrimLine`, `PrimStop`, `PrimVelibStation`, `JourneyResult`, `JourneySegment`, `RealtimeAlert`, `Favorite`, `UserProfile`, `ConsentState`, etc.

## Design tokens (`app/globals.css`)

20+ variables CSS :
- **Couleurs** : Primary (#2E7D9B), Eco Green, Mobility Orange, surfaces dark/light
- **Transport** : metro, bus, velo, rer, tram, train, voiture, marche (référencés aussi depuis `mode-colors.ts`)
- **Espacements** : header-height (60px), navbar-height (80px), card-radius, cta-radius
- **Typographie** : Inter, 10-32px

## a11y

- `prefers-reduced-motion` détecté via hook → animations Framer Motion désactivées (TripCard, SearchBar, ConsentBanner)
- `prefers-color-scheme` détecté via ThemeContext → dark mode no-FOUC (script inline avant hydratation React)
- Focus visible WCAG, safe-area insets iPhone (notch)
- Switch : `role="switch"`, `aria-checked`, focus visible
- `aria-label` / `aria-live` sur listes de résultats et compteur notifications

## Dev

```bash
npm install
npm run dev      # port 3001 (Turbopack)
npm run build    # standalone prod
npm run lint
```

## API Backend

- `NEXT_PUBLIC_API_URL=http://localhost:4000`
- Endpoints : `/api/transport/*`, `/api/auth/*`, `/api/favorites/*`, `/api/notifications/*`, `/api/admin/*`
- JWT httpOnly cookies + Bearer pour compat

## Licence

Projet académique — T6 CDSD Septembre 2026
