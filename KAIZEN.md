# Améliorations Kaizen — UrbanFlow Mobility

Méthode : Observer → Analyser → Agir → Vérifier → Standardiser

## Bloc 1 — Geocoding autocomplete fusionné
- **Problème** : L'autocomplete ne proposait que les arrêts PRIM. Les utilisateurs voulaient aussi chercher par adresse.
- **Origine** : L'API PRIM ne fournit pas de géocodage d'adresses. Il fallait une source complémentaire.
- **Solution** : Fusion des résultats PRIM (arrêts) + data.gouv.fr (adresses) dans un seul dropdown. Fallback housenumber → tous types si aucun résultat. Centrage sur Paris (48.8566, 2.3522).

## Bloc 2 — Mode transport deep-linking
- **Problème** : Impossible de pré-sélectionner un mode de transport depuis la page d'accueil.
- **Origine** : La page recherche n'acceptait aucun paramètre d'initialisation.
- **Solution** : Paramètre URL `?mode=metro|bus|rer|tram|velib|trottinette`. Badge mode affiché, placeholder adapté, filtre actif dès l'arrivée.

## Bloc 3 — Navigation mode (chrono)
- **Problème** : La page trajet affichait un itinéraire statique sans guidage temps réel.
- **Origine** : Aucun système de suivi de progression pendant le trajet.
- **Solution** : Mode navigation avec chronomètre (start/pause/stop), segment actif mis en surbrillance, barre de progression visuelle, temps écoulé.

## Bloc 4 — Géolocalisation
- **Problème** : L'utilisateur devait saisir manuellement sa position de départ.
- **Origine** : Aucun accès au GPS du navigateur.
- **Solution** : Hook `useGeolocation` avec `getCurrentPosition`. Marqueur utilisateur (point bleu) sur la carte. Bouton "Ma position" (crosshair). Auto-localisation si permission déjà accordée.

## Bloc 5 — Détails trajet enrichis
- **Problème** : Les segments de trajet manquaient d'informations pratiques (direction, quai, attente).
- **Origine** : Le fallback journey ne générait que des données basiques.
- **Solution** : Enrichissement des segments avec direction (terminus), platform (quai/voie), headsign, waitTimeMinutes. Données réalistes Paris (lignes, directions, quais).

## Bloc 6 — Carte interactive avancée
- **Problème** : La carte ne faisait que zoomer/dézoomer, pas d'interaction, GPS peu précis.
- **Origine** : `setView` parasite à chaque render, double-clic zoom de Leaflet, `maximumAge: 60000` (positions vieilles), marqueurs supprimés en bloc.
- **Solution** :
  - watchPosition GPS continu : `startWatch()`/`stopWatch()`, toggle GPS, cercle de précision, mode follow
  - Clic carte + reverse geocoding : clic → adresse, auto-remplit départ/destination
  - Fix zoom : suppression du `setView` parasite, `doubleClickZoom` désactivé, `maximumAge: 0`, `panTo` en follow, seuil 5m pour mise à jour marqueur, marqueurs route/Vélib/user séparés

## Bloc 7 — Routing réel OSRM
- **Problème** : L'itinéraire affiché était une ligne droite entre deux points, imprécise et irréaliste.
- **Origine** : Aucun service de routing n'était intégré. La polyline était calculée à vol d'oiseau.
- **Solution** : Intégration OSRM (OpenStreetMap Routing Machine). Endpoint `GET /api/transport/route`. Polyline suivant les rues réelles avec distance et durée exactes. Stack : API publique OSRM (router.project-osrm.org), compatible OSM.

## Bloc 8 — Modes de transport dynamiques
- **Problème** : Les cartes de modes de transport affichaient des sous-titres statiques codés en dur ("16 lignes", "350+ lignes", "1 400 stations", etc.). Aucune donnée temps réel.
- **Origine** : Les `transportModes` étaient un tableau statique dans `page.tsx` avec des chiffres approximatifs. Aucun appel API pour les compteurs réels.
- **Solution** :
  - Backend : nouvel endpoint `GET /api/transport/modes` qui agrège les lignes par mode (Métro, RER, Tram, Bus, Transilien) depuis le référentiel PRIM. Chaque mode retourne `count`, `activeCount`, et les 8 premières lignes avec leur couleur.
  - Frontend : hook `useTransportModes()` pour fetch les données dynamiques. `TransportCard` enrichi avec badge de statut (✅ Normal), sous-titre dynamique ("16 lignes", "2 062 lignes", "1 400 stations"), et expansion au clic pour afficher les lignes du mode.
  - Vélib' ajouté manuellement (pas dans le référentiel lignes PRIM).
  - Ordre d'affichage : Métro → RER → Tram → Bus → Vélib' → Transilien.
  - Fallback sur données statiques si l'API est indisponible.
- **Vérification** : Cartes affichent les compteurs réels (Métro 16, RER 5, Tram 15, Bus 2 062, Vélib' 1 400 stations, Transilien 9). Clic sur Métro affiche les lignes 2, 13, 1, 14 avec leurs couleurs. Badge ✅ Normal visible.
