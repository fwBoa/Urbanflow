# Urban Flow Mobility — Frontend (Next.js)

Interface web PWA pour la plateforme de mobilité multimodale Urban Flow Mobility.

## Stack

- Next.js 16.2.6 (App Router, TypeScript)
- Tailwind CSS v4 + CSS Variables (design tokens)
- Leaflet + OpenStreetMap (cartographie)
- lucide-react (icônes SVG)
- PWA (manifest.json, service worker à venir)

## Pages (5 écrans Figma)

| Page | Route | Description |
|---|---|---|
| Accueil | `/` | Barre de recherche, 6 modes de transport, lignes PRIM temps réel, trajets récents |
| Recherche | `/search` | Origine/destination, filtres (Rapide/Éco/Économique), résultats trajet |
| Détail itinéraire | `/trip/[id]` | Timeline visuelle, comparaison CO2, carte, CTA |
| Favoris | `/favorites` | Onglets Favoris/Historique, cartes trajet, badges CO2 |
| Profil | `/profile` | Avatar, stats, menu paramètres, toggle mode sombre |

## Composants (10)

| Composant | Fichier | Rôle |
|---|---|---|
| NavBar | `components/NavBar.tsx` | Navigation basse (Home, Search, Heart, User) |
| Header | `components/Header.tsx` | En-tête avec titre, bouton retour, action droite |
| AppShell | `components/AppShell.tsx` | Layout wrapper (Header + contenu + NavBar) |
| TransportCard | `components/TransportCard.tsx` | Carte mode de transport avec bordure colorée |
| CO2Badge | `components/CO2Badge.tsx` | Badge émissions CO2 (icône Leaf, g/kg) |
| TripCard | `components/TripCard.tsx` | Carte résultat trajet (mode, durée, CO2) |
| SearchBar | `components/SearchBar.tsx` | Champ de recherche avec icône |
| FilterChip | `components/FilterChip.tsx` | Chips de filtre (Rapide/Éco/Économique) |
| MapComponent | `components/MapComponent.tsx` | Carte Leaflet interactive (marqueurs, polylignes, Vélib') |
| DynamicMap | `components/DynamicMap.tsx` | Wrapper next/dynamic (SSR désactivé) + état de chargement |

## Hooks React (`hooks/useTransport.ts`)

| Hook | Données | Source API |
|---|---|---|
| `useLines(limit)` | Lignes de transport | `GET /api/transport/lines` |
| `useStopSearch(query)` | Recherche d'arrêts (debounce 300ms) | `GET /api/transport/stops?where=search(...)` |
| `useVelibStations(limit)` | Stations Vélib' ouvertes (Paris) | `GET /api/transport/velib` |
| `useTrafficMessages(limit)` | Perturbations trafic | `GET /api/transport/traffic` |
| `useHealthCheck()` | État de l'API PRIM | `GET /api/transport/health` |

## Service API

`services/api.ts` — Classe `ApiService` avec méthodes typées pour les 8 endpoints PRIM :
- `healthCheck()`, `getLines()`, `getStops()`, `searchStops()`, `getStopLines()`, `getTrafficMessages()`, `getVelibStations()`, `getElevatorStatus()`, `getGtfsUrls()`

Types exportés : `PrimLine`, `PrimStop`, `PrimVelibStation`, `JourneyResult`, `JourneySegment`, etc.

## Design tokens (CSS Variables)

20+ variables dans `globals.css` :

| Catégorie | Tokens |
|---|---|
| Couleurs | Primary (#2E7D9B), Eco Green (#7CB342), Mobility Orange (#FF6B35), etc. |
| Transport | metro, bus, velo, rer, tram, trottinette, voiture, marche |
| Espacements | header-height (60px), navbar-height (80px), card-radius (12px), cta-radius (26px) |
| Typographie | font-family Inter, tailles 10-32px |

## Design

5 écrans réalisés sur Figma :
1. Accueil — Barre de recherche, cartes transport, zone carte
2. Résultats — Filtres (Rapide/Eco/Économique), cartes trajet avec badges CO2
3. Détail — Timeline itinéraire, carte, badge CO2, CTA "Démarrer le trajet"
4. Favoris — Cartes favoris, historique trajets
5. Profil — Avatar, infos utilisateur, paramètres

**Lien Figma :** https://www.figma.com/design/JEcRNJTv6EnI4IAWTnIRO8/T6

**Améliorations UI par rapport au Figma :**
- Icônes lucide-react (SVG) au lieu d'emojis
- CO2Badge réutilisable avec tailles sm/md/lg
- FilterChip avec état actif/inactif animé
- AppShell comme layout wrapper commun
- Safe-area insets pour iPhone (notch)
- Focus visible pour accessibilité WCAG
- Carte Leaflet interactive avec stations Vélib' en temps réel
- Hooks React pour connexion API avec debounce et gestion d'erreurs

## Développement

```bash
npm install
npm run dev
```

Le frontend tourne sur le port 3001.

## API Backend

Le frontend communique avec le backend NestJS sur le port 4000 :
- Variable `NEXT_PUBLIC_API_URL=http://localhost:4000`
- Endpoints transport : `/api/transport/*`

## Licence

Projet académique — T6 CDSD Septembre 2026