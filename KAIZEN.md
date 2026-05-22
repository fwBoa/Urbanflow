# Améliorations Kaizen — UrbanFlow Mobility

Méthode : Observer → Analyser → Agir → Vérifier → Standardiser

## Fonctionnalités Obligatoires

### F1 — Inscription/connexion et profils de mobilité personnalisés ✅
- **Backend (NestJS)** : Module Auth complet avec JWT
  - `POST /api/auth/register` : Inscription avec email, mot de passe (bcrypt, 12 rounds), displayName optionnel, avatar par défaut 🚇
  - `POST /api/auth/login` : Connexion avec email/mot de passe, retourne JWT + profil utilisateur
  - `GET /api/auth/me` : Profil utilisateur authentifié (JWT Bearer token)
  - `PUT /api/auth/me` : Mise à jour profil (displayName, avatar, preferredMode, accessibilityNeeds)
  - Entity `User` : id (UUID), email (unique), passwordHash, displayName, preferredMode, accessibilityNeeds, avatar, timestamps
  - JWT Strategy + AuthGuard pour routes protégées
  - PostgreSQL via Docker Compose (postgres:16-alpine)
- **Frontend (Next.js)** :
  - Pages `/login` et `/register` avec formulaires validés
  - `AuthContext` + `useAuth()` hook : login, register, logout, refreshProfile, isAuthenticated, user
  - Service `auth.ts` : register, login, getProfile, updateProfile, logout, token management (localStorage)
  - Page profil intégrée : avatar/nom/email éditables, badges, mode sombre, stats CO₂
  - Si connecté : profil synchronisé avec le backend (nom, avatar, mode préféré, accessibilité)
  - Si non connecté : profil local (localStorage) avec bouton "Se connecter"
  - Bouton "Se déconnecter" quand authentifié
  - Badge "Connecté" visible sur le profil
- **Vérification** : `curl POST /api/auth/register` → JWT + profil, `curl POST /api/auth/login` → JWT + profil, `curl GET /api/auth/me -H "Authorization: Bearer <token>"` → profil, page login → connexion → redirection vers profil avec données backend

### F2 — Planificateur d'itinéraires multimodal avec géolocalisation temps réel 🔄
- **Existant (~85%)** :
  - Backend : Journey endpoint, OSRM routing, GTFS parser, carbon calculator, geocoding, Vélib nearby, PRIM API
  - Frontend : Search page (autocomplete, geolocation, map click), trip detail (segments, CO₂, navigation GPS), hooks (useGeolocation, useNavigation, useJourney, useRoute)
  - **GTFS auto-load** : `GtfsParserService` implémente `OnModuleInit`, télécharge automatiquement le ZIP GTFS au démarrage (sources multiples : PRIM API + Data portal), cache local 8h, fallback gracieux si indisponible
  - **Endpoints GTFS** : `GET /api/transport/gtfs-status` (statut du chargement), `POST /api/transport/gtfs-reload` (rechargement manuel)
  - **Filtrage calendar** : `getActiveServiceIds()` filtre les trips par jour de service (calendar.txt + calendar_dates.txt exceptions)
  - **Mode filtering** : `filterByModes()` filtre les résultats par modes de transport (metro, rer, bus, tram, velib, marche)
  - **Vélib routing** : `computeNonTransitJourney()` génère des trajets marche→Vélib→marche avec segments détaillés
  - **Mode selection UI** : Chips de sélection des modes de transport sur la page recherche (Métro, RER, Bus, Tram, Vélib', Marche)
  - **Déduplication améliorée** : Les trajets non-transit (marche, vélib) ne sont plus dédupliqués entre eux
  - Navigation GPS temps réel : suivi position, détection hors trajet, arrivée, progression
- **Manquant** :
  - P1 : Algorithme RAPTOR (Phase 2) remplaçant le heuristic nearest-stop
  - P1 : GTFS-RT temps réel (retards, annulations, positions véhicules)
  - P2 : Sélecteur date/heure de départ sur la page recherche
  - P2 : Polylines shapes pour segments transit sur la carte
  - P2 : Prochains départs par arrêt (endpoint + UI)
  - P2 : Alertes perturbations dans les résultats d'itinéraire

### F3 — Intégration d'APIs de transport (GTFS, vélos/trottinettes) 🔄
- **Existant (~85%)** :
  - PRIM IDFM API : lignes, arrêts, trafic, ascenseurs, GTFS URL
  - Open Data Paris : Vélib' Métropole (stations temps réel)
  - OSRM : routing piéton/vélo/voiture
  - Geocoding : data.gouv.fr + reverse geocoding
  - GTFS auto-load : téléchargement automatique au démarrage avec fallback gracieux
  - Vélib routing : trajets marche→Vélib→marche intégrés dans le planificateur
  - **GBFS Service** : Intégration des flux GBFS (Lime, Dott, Voi) pour trottinettes et vélos partagés
    - `GET /api/transport/shared-vehicles` : véhicules libres à proximité (trottinettes, vélos électriques)
    - `GET /api/transport/shared-stations` : stations de partage à proximité
    - `GET /api/transport/gbfs-status` : statut des flux GBFS (nombre de véhicules par opérateur)
    - Cache 5 minutes, rafraîchissement automatique via cron
    - Classification automatique : scooter/ebike/bike selon vehicle_types GBFS
    - Fallback : détection des trottinettes via rental_uris et vehicle_type_id
  - **GTFS-RT Service** : Données temps réel (alertes, perturbations)
    - `GET /api/transport/realtime-alerts` : alertes et perturbations temps réel
    - `GET /api/transport/realtime-vehicles` : positions des véhicules (placeholder)
    - `GET /api/transport/realtime-status` : statut du service GTFS-RT
    - Cache 2 minutes, rafraîchissement automatique via cron
    - Fallback gracieux si API PRIM indisponible
- **Manquant** :
  - P1 : GTFS-RT protobuf parsing complet (positions véhicules, trip updates)
  - P2 : Cache intelligent des données GTFS (rechargement périodique)
- **Backend** : Factoriser les appels `callDataApi` avec un builder de query params générique. Créer des constantes pour les endpoints PRIM (`REFERENTIEL_LIGNES`, `ARRETS`, `VELIB_STATIONS`, etc.).
- **Frontend hooks** : Extraire un hook générique `useApiData<T>(fetchFn, deps)` qui encapsule `useState/useEffect/error/loading`. Chaque hook métier devient un one-liner.
- **Frontend API** : Les méthodes `fetch` de `api.ts` suivent toutes le même pattern → un helper `fetchTyped<T>(endpoint)` suffit.
- **Frontend UI** : Extraire les patterns de cartes répétés en composants réutilisables (`StationCard`, `InfoBadge`). Centraliser les styles communs dans des classes Tailwind ou un design tokens.
- **À appliquer** : Avant chaque nouvelle feature, vérifier si un pattern existe déjà. Si oui, le réutiliser ou le refactorer.

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

## Bloc 11 — Navigation GPS (F5)
- **Problème** : Le mode navigation existant était un simple chronomètre sans suivi GPS réel. Pas de progression basée sur la position, pas d'ETA dynamique, pas de détection hors trajet.
- **Origine** : La page trip/[id] avait un mode navigation avec timer et segments actifs basés uniquement sur le temps écoulé, sans aucune donnée de position GPS.
- **Solution** :
  - Hook `useNavigation(segments, routePoints, origin, destination)` :
    - Utilise `useGeolocation` en mode `watchPosition` pour le suivi GPS continu
    - Calcul haversine de la distance au point le plus proche sur la polyline OSRM
    - Progression GPS : distance restante, ETA basé sur la vitesse réelle, bearing vers le prochain point
    - Détection hors trajet : si l'utilisateur s'écarte de > 50m du trajet → alerte "Hors trajet"
    - Détection arrivée : si l'utilisateur est à < 30m de la destination → notification "Vous êtes arrivé !"
    - Instruction de direction : segment actif avec icône (depart/straight/left/right/arrive)
  - Intégration dans trip/[id]/page.tsx :
    - Remplacement du state local (useState/useRef) par le hook `useNavigation`
    - Carte centrée sur la position utilisateur pendant la navigation (zoom 16)
    - Marqueur GPS bleu sur la carte avec cercle de précision
    - Panneau GPS temps réel : distance restante, ETA, vitesse, précision GPS
    - Alerte "Hors trajet" (amber) si écart > 50m
    - Notification "Vous êtes arrivé !" (vert) si distance < 30m à la destination
    - Bouton "Démarrer le trajet" active le GPS continu (watchPosition)
    - Bouton "Terminer" arrête le GPS et réinitialise la navigation
  - Nettoyage : suppression des `useState`/`useRef`/`useEffect` manuels pour le timer et les segments actifs, remplacés par le hook
- **Vérification** : Cliquer "Démarrer le trajet" active le GPS, affiche le chronomètre, la progression, et le panneau GPS. Hors trajet → alerte amber. Arrivé à destination → notification verte. Carte suit la position en temps réel.

## Bloc 12 — Profil utilisateur (F6)
- **Problème** : La page profil était statique avec un avatar générique (icône User), un nom fixe "Utilisateur", aucun email, pas de badges, pas de mode sombre fonctionnel, et pas d'équivalent CO₂.
- **Origine** : Le profil affichait seulement des stats basiques et des toggles sans persistance réelle pour le dark mode.
- **Solution** :
  - Service `favorites.ts` enrichi :
    - Interface `UserProfile` (name, email, avatar) avec `getProfile()` / `saveProfile()` persistés en localStorage
    - Interface `Badge` (key, label, emoji, description, unlocked) avec `getBadges()` qui calcule les badges dynamiquement (first_trip, eco_warrior, explorer, regular, velib_fan, carbon_neutral)
    - 6 badges : 🚇 Premier trajet, 🌿 Éco-guerrier (500g CO₂), 🗺️ Explorateur (10 trajets), ⭐ Régulier (25 trajets), 🚲 Vélib' fan (3 favoris), 🌍 Carbone neutre (5kg CO₂)
  - Hook `useDarkMode()` :
    - Lit localStorage `urbanflow_darkMode`, applique la classe `.dark` sur `<html>`
    - Synchronise avec la préférence système `prefers-color-scheme`
    - Retourne `{ isDark, toggleDarkMode }` pour un contrôle programmatique
  - Page profil réécrite :
    - Avatar modifiable : 8 emojis (🚇🚲🚊🚈🚍🚶🌍⚡), cliquer pour ouvrir le picker, sélection persistée
    - Nom éditable : clic sur ✏️ → champ input, Enter ou ✅ pour sauvegarder
    - Email éditable : clic sur "Ajouter un email" → champ input, Enter ou ✅ pour sauvegarder
    - Badges : grille 3 colonnes, emoji si débloqué 🔒 si verrouillé, compteur badges débloqués/total
    - Équivalent CO₂ : "X km en voiture évités 🚗→🚇" (98g CO₂/km économisé vs voiture)
    - Mode sombre : toggle fonctionnel via `useDarkMode()`, icône Soleil/Lune, texte "Mode clair"/"Mode sombre"
    - Stats : trajets, CO₂ évité (format g/kg), favoris
    - Mode de transport par défaut : Rapide/Éco/Économique
    - Toggles : Notifications, Accessibilité, Mode sombre
    - Effacer l'historique : bouton avec confirmation visuelle
  - Bug CSS corrigé : `globals.css` avait un `::selection` dupliqué dans le bloc `.dark`, causant une erreur PostCSS `Unexpected }` à la ligne 126
- **Vérification** : Avatar changeable (🚇→🚲), nom éditable ("Dave"), email éditable, 6 badges affichés (🔒 tant que conditions non remplies), mode sombre fonctionnel (toggle change le thème), équivalent CO₂ affiché si > 0, stats persistées en localStorage.
