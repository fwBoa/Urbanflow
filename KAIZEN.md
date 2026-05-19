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

## Bloc 9 — Lignes en temps réel par mode
- **Problème** : La section "Lignes en temps réel" affichait 4 bus aléatoires sans pertinence, avec un statut "Normal" codé en dur. Aucun filtrage par mode de transport.
- **Origine** : Le hook `useLines(6)` retournait les 6 premières lignes du référentiel (toutes des bus), sans distinction de mode ni statut réel.
- **Solution** :
  - Backend : nouvel endpoint `GET /api/transport/lines-by-mode` qui retourne les lignes groupées par mode (Métro, RER, Tram, Transilien), triées par `shortname_line`, avec couleur et statut.
  - Frontend : hook `useLinesByMode()` pour fetch les données. Section "Lignes en temps réel" remplacée par des onglets (Métro, RER, Tram, Transilien) avec compteur par mode.
  - Chaque ligne affiche son badge coloré (ex: 1 jaune, A rouge, T1 bleu), un ✅ vert pour "active" ou un ⚠️ orange pour "prochainement active" (ex: ligne 18, T1a, T1b).
  - Les onglets sont cliquables et changent dynamiquement l'affichage des lignes.
- **Vérification** : Onglet Métro affiche 17 lignes (1-14 + 7B, 3B, 18). Ligne 18 en "prochainement active" avec badge orange. Onglet RER affiche A, B, C, D, E avec leurs couleurs.

## Bloc 10 — Vélib' proches (F4)
- **Problème** : Aucune station Vélib' à proximité n'était affichée sur la page d'accueil. L'utilisateur devait chercher manuellement.
- **Origine** : Le dataset JCDecaux (`jcdecaux-bike-stations-data`) de l'API PRIM contient 2 890 stations dans le monde entier, mais aucune station Paris intra-muros (75). Les stations Vélib' de Paris sont gérées par Vélib' Métropole et ne figurent pas dans ce dataset.
- **Solution** :
  - Backend : nouvel endpoint `GET /api/transport/velib-nearby?lat=...&lon=...&radius=2&limit=10` qui interroge l'API Open Data Paris (`opendata.paris.fr`) avec `geofilter.distance` pour les stations Vélib' Métropole Paris intra-muros. Retourne : nom, position, vélos disponibles (total + électriques + mécaniques), places libres, capacité, statut location/retour, distance en mètres, arrondissement.
  - Frontend API : méthode `getNearbyVelibStations(lat, lon, radiusKm, limit)` avec type `NearbyVelibStation`.
  - Frontend Hook : `useNearbyVelib(lat, lon, radiusKm, limit)` avec géolocalisation automatique via `navigator.geolocation.getCurrentPosition`.
  - Frontend UI : section "Vélib' proches" sur la page d'accueil avec :
    - Géolocalisation automatique au chargement de la page
    - Bouton "Localiser" si la permission n'est pas accordée
    - Cartes de stations avec : distance (m/km), nom, vélos disponibles (🚲 total + ⚡ électriques + 🔋 places), badge coloré (vert > 5, orange 1-5, rouge 0)
    - Carte centrée sur la position utilisateur avec marqueur bleu
  - Périmètre : Paris intra-muros (75) uniquement, via l'API Open Data Paris.
- **Vérification** : `curl /api/transport/velib-nearby?lat=48.8566&lon=2.3522&radius=1&limit=5` retourne 5 stations triées par distance (ex: "Place de l'Hôtel de Ville" à 98m, "Arcole - Notre-Dame" à 366m). La page d'accueil affiche les stations proches avec vélos électriques et mécaniques séparés.
