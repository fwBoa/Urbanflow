# Améliorations Kaizen — UrbanFlow Mobility

Méthode : Observer → Analyser → Agir → Vérifier → Standardiser

## Bloc 1 — Geocoding autocomplete fusionné
- Autocomplete unifié : arrêts PRIM + adresses data.gouv.fr
- Sections visuelles "🚉 Arrêts" / "📍 Adresses"
- Fallback housenumber → tous types

## Bloc 2 — Mode transport deep-linking
- Paramètre URL `?mode=metro|bus|rer|tram|velib|trottinette`
- Badge mode transport sur la page recherche

## Bloc 3 — Navigation mode (chrono)
- Chronomètre avec pause/reprise/arrêt
- Segment actif mis en surbrillance
- Barre de progression visuelle

## Bloc 4 — Géolocalisation
- Hook `useGeolocation` avec `getCurrentPosition`
- Marqueur utilisateur (point bleu)
- Bouton "Ma position"

## Bloc 5 — Détails trajet enrichis
- Direction (terminus), quai/voie, temps d'attente
- Données réalistes Paris

## Bloc 6 — Carte interactive avancée
- **watchPosition GPS continu** : suivi temps réel, toggle GPS, cercle de précision, mode follow
- **Clic carte + reverse geocoding** : clic → adresse, auto-remplit départ/destination
- **Fix zoom/dézoom** : suppression du `setView` parasite, `doubleClickZoom` désactivé, `maximumAge: 0`

## Bloc 7 — Routing réel OSRM
- **Problème** : ligne droite entre deux points, imprécise
- **Solution** : intégration OSRM (OpenStreetMap Routing Machine)
- **Endpoint** : `GET /api/transport/route?originLat=...&originLon=...&destLat=...&destLon=...&profile=foot|bike|car`
- **Résultat** : polyline suivant les rues réelles, distance et durée exactes
- **Stack** : API publique OSRM (router.project-osrm.org), compatible OSM
