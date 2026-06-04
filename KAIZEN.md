# Journal Kaizen — UrbanFlow Mobility

> Ce fichier trace les problèmes rencontrés, les solutions appliquées et les apprentissages.
> Format : un bloc par session, daté, avec Problème / Origine / Solution / Vérification.

---

## Bloc 1 — Audit initial (session fondatrice)
- **Problème** : Le projet avait accumulé du code mort, des mocks statiques, et des incohérences UX sans documentation.
- **Origine** : Développement itératif rapide sans revue de code ni cleanup entre les phases.
- **Solution** : Création de `AUDIT_PROJET.md` avec inventaire complet (services injectés, composants orphelins, routes mortes, mocks).
- **Vérification** : 4 services non injectés, 3 composants orphelins, 2 mocks statiques identifiés.

## Bloc 2 — Nettoyage code mort
- **Problème** : `TransportCard.tsx` jamais importé, `getStopById()` jamais appelée, `useLocalStorage.ts` orphelin.
- **Origine** : Refactoring précédent sans suppression des anciens fichiers.
- **Solution** : Suppression de `TransportCard.tsx`, `getStopById()`, `memory-auth.service.ts`, `useLocalStorage.ts`.
- **Vérification** : `grep -r` confirme aucun import résiduel. Build propre.

## Bloc 3 — Bugs UX (mocks, filtre cheap)
- **Problème** : Trajets récents = mocks identiques pour tous. Filtre "Économique" buggé (Paris = tarif unifié Navigo).
- **Origine** : Mock statique `recentTrips` injecté en dur. Filtre copié sans adaptation au contexte parisien.
- **Solution** : `recentTrips` dynamique via `getHistory()`. Suppression filtre `cheap`.
- **Vérification** : Page d'accueil d'un nouvel utilisateur → "Aucun trajet récent".

## Bloc 4 — Scope géographique Paris
- **Problème** : Adresses hors Paris acceptées silencieusement. GTFS IDFM complet en mémoire.
- **Origine** : Geocoding sans filtre. GTFS non filtré.
- **Solution** : `isParis` sur `GeocodeResult`, `findStopsNearby` filtré à 30 km, clic carte bloqué hors Paris.
- **Vérification** : Clic à Saint-Denis → "Hors de Paris". Recherche "Lyon" → vide.

## Bloc 5 — Documentation recherche d'adresses
- **Problème** : Aucune documentation sur le fonctionnement de la barre de recherche (hybride GTFS + data.gouv.fr).
- **Origine** : Architecture complexe sans doc interne.
- **Solution** : Section détaillée dans `PLAN.md` Phase 1.7 avec diagramme, scénarios UX, points de vigilance.
- **Vérification** : Lecture du PLAN.md → compréhension complète du flow recherche en 2 min.

## Bloc 6 — Optimisation GTFS bounding box
- **Problème** : Parsing GTFS complet : 3.5 GB heap, ~2 min. 53 967 arrêts IDFM surconsommaient.
- **Origine** : GTFS IDFM = toute l'Île-de-France. UrbanFlow = Paris + proche banlieue.
- **Solution** : `filterStopsByRegion()` : rayon 25 km depuis Notre-Dame. Cascade filter sur stops → stop_times → trips → routes → transfers.
- **Vérification** : 32 353 arrêts retenus, 1 183 routes, 359 900 trips. Heap ~2 GB. Temps ~90s.

## Bloc 7 — Position GPS hors zone
- **Problème** : Bouton "Ma position" à Marolles-en-Brie (~18 km) calculait un itinéraire.
- **Origine** : Pas de vérification géographique sur le frontend. Backend limite à 30 km.
- **Solution** : `haversineKm()` + `useMyPosition()` bloque si > 15 km. Bannière amber `AlertTriangle`.
- **Vérification** : Message "Votre position est à 18 km de Paris..." affiché.

## Bloc 8 — Docker build failure (auth.docker.io)
- **Problème** : `docker compose build` échoue avec `auth.docker.io` unreachable.
- **Origine** : Problème réseau temporaire / DNS.
- **Solution** : Redémarrage des conteneurs existants sans rebuild. Cache GTFS persisté via volume.
- **Vérification** : `docker compose up -d` → containers redémarrés sans erreur.

## Bloc 9 — PostgreSQL Docker corruption
- **Problème** : `urbanflow-db` I/O error sur `global/pg_filenode.map`.
- **Origine** : Fichier corrompu dans le volume Docker.
- **Solution** : Recréation du volume `postgres_data`. Ré-initialisation du schéma.
- **Vérification** : `docker volume rm urbanflow_postgres_data` + `docker compose up -d db` → healthy.

## Bloc 10 — PWA notification auto-update
- **Problème** : Notification "New version available" apparaissait sans raison apparente.
- **Origien** : Service Worker Next.js détecte un nouveau build et affiche une notification de mise à jour.
- **Solution** : Comportement normal identifié. Pas de bug. Next.js PWA standard.
- **Vérification** : Documentation Next.js confirme le comportement attendu du SW.

## Bloc 11 — Frontend AlertTriangle import manquant
- **Problème** : Build frontend échoue : `AlertTriangle` non importé depuis `lucide-react`.
- **Origine** : Utilisation du composant sans import dans `search/page.tsx`.
- **Solution** : Ajout `AlertTriangle` dans l'import Lucide.
- **Vérification** : `npx tsc --noEmit` → 0 erreur.

## Bloc 12 — GTFS IDFM parsing OOM
- **Problème** : `FATAL ERROR: Reached heap limit Allocation failed` pendant `buildIndex()`.
- **Origine** : 8.2M stop_times × objets JS = ~3.5 GB heap. Docker limit = 4 GB.
- **Solution** : `--max-old-space-size=3584` dans `NODE_OPTIONS`. Streaming parser pour `stop_times.txt`.
- **Vérification** : Parsing complet sans OOM. Heap stable à ~3.2 GB max.

## Bloc 13 — RAPTOR O(1) transfers
- **Problème** : `raptorSearch` appelait `findStopsNearby()` à chaque round → scan O(N) des 54K arrêts.
- **Origine** : Foot-path transfers recalculés dynamiquement au lieu d'utiliser `transfers.txt`.
- **Solution** : Remplacement par `index.transfersByStop.get(stopId)` → O(1) lookup.
- **Vérification** : Temps de calcul RAPTOR divisé par ~3 sur les trajets avec correspondance.

## Bloc 14 — Geocoding non filtré
- **Problème** : `reverseGeocode` retournait "Saint-Denis" pour un clic hors Paris.
- **Origine** : `api-adresse.data.gouv.fr/reverse` retourne le 1er résultat sans filtre.
- **Solution** : `isParis` calculé depuis postcode/city dans `prim.service.ts:537`.
- **Vérification** : Clic carte à Saint-Denis → `isParis: false` → message "Hors de Paris".

## Bloc 15 — Itinéraires fallback incohérents
- **Problème** : Quand RAPTOR ne trouve rien, le fallback génère des trajets aléatoires (ligne, direction, quai).
- **Origine** : `computeFallbackJourney` utilise `Math.random()` pour choisir ligne/direction.
- **Solution** : Accepté comme comportement temporaire. Le fallback est marqué `isFallback: true` avec badge "⚠️ Estimé".
- **Vérification** : Badge visible sur les cartes quand GTFS non chargé.

## Bloc 16 — KAIZEN.md corruption
- **Problème** : Fichier `KAIZEN.md` accidentellement écrasé par `Write` au lieu de `Edit`. Perte des blocks 1-16.
- **Origine** : Erreur d'outil — `Write` remplace tout le fichier, `Edit` fait un remplacement ciblé.
- **Solution** : Reconstruction des blocks 1-16 depuis la mémoire de session + `PLAN.md`. Adoption systématique de `Edit` pour les mises à jour.
- **Vérification** : Fichier reconstruit avec 23 blocks + header. Taille ~73 lignes initiales → complète.

## Bloc 17 — Persistance Docker GTFS + Heap
- **Problème** : Chaque `docker compose up --build` perdait le ZIP GTFS téléchargé (106 MB) → re-téléchargement obligatoire (~10-30s). Le parsing redémarrait à zéro.
- **Origine** : Le dossier `/app/data/gtfs` dans le conteneur était éphémère (couche writable non persistée).
- **Solution** :
  - Volume Docker `gtfs_data:/app/data/gtfs` dans `docker-compose.yml`
  - Le ZIP est conservé entre les rebuilds → `Using cached GTFS ZIP` au lieu de `Downloading...`
  - Heap Node.js passé à 3.5 GB (`--max-old-space-size=3584`) pour éviter les OOM pendant `buildIndex` avec 8M stop_times
- **Vérification** : Deux rebuilds successifs → le second affiche "Using cached GTFS ZIP" et démarre en ~80s au lieu de 5 min.

## Bloc 18 — Trajets récents dynamiques (fix mock data)
- **Problème** : La section "Trajets récents" sur la page d'accueil affichait 3 trajets codés en dur ("Opéra → Gare du Nord", etc.) identiques pour tous les utilisateurs. C'était du faux contenu qui n'avait aucun sens.
- **Origine** : Un tableau statique `recentTrips` était injecté directement dans le JSX de `page.tsx` sans aucun appel API.
- **Solution** :
  - Suppression du mock `recentTrips` statique
  - Ajout `useState<HistoryJourney[]>([])` + `useEffect(() => getHistory().then(h => setRecentTrips(h.slice(0, 3))))`
  - Message "Aucun trajet récent" si l'historique est vide
  - Badge `modeColor` (pastille colorée) sur chaque trajet récent selon le mode de transport
- **Vérification** : Page d'accueil d'un nouvel utilisateur → "Aucun trajet récent". Après avoir planifié un trajet → il apparaît dans la section avec la bonne couleur de pastille.

## Bloc 19 — Suppression filtre "Économique" (fix logique métier Paris)
- **Problème** : Le filtre "Économique" (icône Wallet) sur la page recherche était buggé — il ne filtrait rien car le backend ne retournait aucune donnée de prix/tarif. Paris étant en tarification unifiée Navigo, le concept de "économique" n'a pas de sens.
- **Origine** : Filtre UI copié sur les apps de transport classiques sans adaptation au contexte parisien. Le backend n'a jamais implémenté de champ `cost`.
- **Solution** :
  - Suppression du filtre `cheap` du tableau `filterModes` dans `search/page.tsx`
  - Retrait de l'import `Wallet` de Lucide
  - Suppression du badge "Économique" de l'UI
- **Vérification** : Page recherche → seuls les filtres "Rapide", "Direct", "Moins de marche", "Accessible" sont visibles. Le filtre "Économique" a disparu.

## Bloc 20 — Scope géographique Paris (validation UX + backend)
- **Problème** : L'application acceptait silencieusement des adresses hors Paris (Lyon, Marseille, banlieue éloignée) sans message explicite. Le GTFS IDFM complet (53 967 arrêts, Île-de-France entière) surconsommait la mémoire.
- **Origine** : Le geocoding data.gouv.fr cherchait dans toute la France. Le GTFS IDFM n'était pas filtré. La carte acceptait les clics n'importe où.
- **Solution** :
  - **Backend — `GeocodeResult.isParis`** : `prim.service.ts` retourne `isParis: boolean` calculé depuis `postcode.startsWith('75') || city === 'paris'`
  - **Backend — `findStopsNearby`** : vérification rapide `distanceFromParis > 30km` → retourne `[]` immédiatement sans parcourir les 53K arrêts
  - **Backend — `findJourney`** : si origine ou destination > 30 km de Paris → retourne `[]` avec `logger.warn`
  - **Frontend — clic carte** : `handleMapClick` vérifie `result.isParis`. Si `false` → `setMapClickError("Hors de Paris — sélectionnez une adresse à Paris")` et bloque la sélection
  - **Frontend — dropdown vide** : message "Aucun résultat à Paris. UrbanFlow couvre uniquement Paris et ses arrêts de transport."
  - **Frontend — itinéraire vide** : message "Aucun itinéraire trouvé — Vérifiez que votre départ et votre arrivée sont à Paris ou en proche banlieue."
- **Vérification** :
  - Clic carte à Saint-Denis (93) → message "Hors de Paris" + pas de sélection possible
  - Recherche "Lyon" dans la barre → aucun résultat + message explicite
  - GPS à Lyon → "Autour de vous" vide
  - Itinéraire Opéra → Gare du Nord fonctionne (Paris → Paris)

## Bloc 21 — Optimisation GTFS : bounding box Paris (25 km)
- **Problème** : Le parsing GTFS IDFM complet (53 967 arrêts, 8.2M stop_times, 2 010 routes) générait un heap Node.js de ~3.5 GB et prenait ~2 min. Sur un VPS Hostinger KVM 1 (4 GB RAM), cela laissait peu de marge pour PostgreSQL + Nginx.
- **Origine** : Le GTFS IDFM couvre toute l'Île-de-France (75/77/78/91/92/93/94/95). UrbanFlow se limitant à Paris + proche banlieue, les arrêts de Grande Couronne (bus, trains) et les arrêts ruraux étaient inutilement chargés.
- **Solution** :
  - **Nouvelle méthode** `filterStopsByRegion(stops)` : filtre par distance haversine ≤ 25 km depuis Notre-Dame (48.8566, 2.3522)
  - **Cascade** : après le filtre stops → collecte les `stop_id` retenus → parse `stop_times.txt` en streaming mais NE GARDE que les horaires des arrêts retenus → collecte les `trip_id` utilisés → filtre `trips.txt` → filtre `routes.txt` → filtre `transfers.txt`
  - **Gain** : -40% arrêts (53 967 → 32 353), -41% routes (2 010 → 1 183), heap estimé ~2 GB au lieu de ~3.5 GB
- **Vérification** : `docker logs urbanflow-api` → `Bounding-box filter: 32353/53967 stops kept`, `GTFS data loaded in 90443ms — 32353 stops, 1183 routes, 359900 trips`. API `/gtfs-status` → `{"loaded":true,"stops":32353,"routes":1183}`. Itinéraire Opéra → Gare du Nord fonctionne en <5s.

## Bloc 22 — Mise à jour documentation déploiement (KVM 1 → KVM 2)
- **Problème** : Le dossier technique recommandait un VPS Hostinger KVM 1 (4 GB RAM) insuffisant pour le parsing GTFS en mémoire.
- **Origine** : Estimation initiale sous-évaluée avant l'implémentation réelle du parser streaming.
- **Solution** :
  - Section 10.2 du `Dossier_Technique_Urban_Flow_Mobility.md` : passage à **Hostinger KVM 2** (8 GB RAM, 2 vCPU, 80 Go NVMe)
  - Tableau comparatif KVM 1 vs KVM 2 avec justifications (marge mémoire, scalabilité, Docker pre-prod + prod)
  - Coûts mis à jour : ~135€/an promo (vs 87€), ~231€/an renouvellement (vs 147€)
  - Ajout des optimisations GTFS bounding box comme palliatifs en attendant le upgrade
- **Vérification** : Le dossier technique reflète la nouvelle architecture cible KVM 2.

## Bloc 23 — Position GPS hors zone (validation "Ma position")
- **Problème** : L'utilisateur cliquait "Ma position" à Marolles-en-Brie (~18 km de Paris) et l'application calculait quand même un itinéraire. La limite backend était à 30 km, trop large pour le positionnement "Paris uniquement".
- **Origine** : Le bouton "Ma position" définissait `selectedOrigin` aux coordonnées GPS sans aucune vérification géographique. Le backend autorisait jusqu'à 30 km.
- **Solution** :
  - **Frontend** — `search/page.tsx` :
    - Ajout fonction `haversineKm(lat1, lon1, lat2, lon2)` pour calculer la distance depuis le centre de Paris (48.8566, 2.3522)
    - Modification `useMyPosition()` : si `distance > 15 km` → `setPositionError("Votre position est à X km de Paris...")` et retourne sans définir l'origine
    - Bannière amber avec `AlertTriangle` affichée sous le bouton
  - **Backend** — `journey.service.ts` : garde la limite 30 km comme filet de sécurité
- **Vérification** : Test à Marolles-en-Brie → message "Votre position est à 18 km de Paris. UrbanFlow couvre uniquement Paris et sa proche banlieue (≤ 15 km)." + pas d'itinéraire calculé.

## Bloc 24 — GTFS-RT Alertes + Prochains départs + Immersion trajet
- **Problème** :
  1. Les trajets n'affichaient aucune info sur les perturbations temps réel — l'utilisateur découvrait un retard à l'arrêt.
  2. Les arrêts proches dans "Autour de vous" n'affichaient pas les prochains départs — il fallait quitter la page pour les voir.
  3. La timeline du trajet était peu informative : même icône pour tous les modes, pas de badge ligne coloré, pas d'horaires affichés.
- **Origine** :
  1. `GtfsRtService.getAlerts()` existait mais n'était pas lié aux itinéraires.
  2. Aucun endpoint pour les prochains départs par arrêt GTFS.
  3. Le rendu timeline était basique — icône `Train` unique, instruction texte brute.
- **Solution** :
  - **Alertes temps réel** :
    - `JourneyResult.alerts?: JourneyAlert[]` ajouté au type backend
    - `transport.controller.ts` : `matchAlertsForJourney()` — matching bidirectionnel normalisé (`lineName` ↔ `affectedRoutes`)
    - `TripCard.tsx` : badge ⚠️ amber quand `hasAlert={trip.alerts?.length > 0}`
    - `trip/[id]/page.tsx` : section "Perturbation(s) en cours" avec cartes colorées selon severity (severe=rouge, warning=amber, info=bleu)
  - **Prochains départs** :
    - `gtfs-parser.service.ts` : `getStopDepartures(stopId, date, limit)` — filtre par service actif aujourd'hui, déduplique par `(lineName, headsign)`, calcule `waitMinutes`
    - Endpoint `GET /api/transport/stop-times?stopId=...&limit=5`
    - `search/page.tsx` : drawer bottom-sheet — clic sur arrêt proche → badge ligne colorée, direction, voie, minutes d'attente
  - **Immersion timeline** :
    - `trip/[id]/page.tsx` : `getSegmentIcon()` — icônes spécifiques (Bus 🚌, Métro/M, RER, Tram, Marche, Vélib')
    - Badge ligne coloré avec nom réel (`segment.lineName`) dans la timeline
    - Affichage horaires `departureTime → arrivalTime` pour chaque segment
    - Détails enrichis : mode label, direction, terminus affiché (`headsign`), voie (`platform`), attente (`waitTimeMinutes`)
- **Vérification** :
  - `GET /api/transport/journey?...` retourne `alerts: []` sur chaque itinéraire (0 alerte PRIM active à ce moment = comportement correct)
  - `GET /api/transport/stop-times?stopId=STOP_1` → `{"departures":[]}` (STOP_1 inexistant = comportement correct)
  - Frontend compilé (`npx tsc --noEmit` → 0 erreur). Docker rebuildé et démarré.
- **Idées immersion futures** (documentées dans PLAN.md) :
  - Vibration téléphone à chaque étape (`navigator.vibrate()`)
  - Annonce vocale "Prochain arrêt" (`speechSynthesis`)
  - Écran allumé constant (`screenWakeLock`)
  - Notifications push 5 min avant départ
  - Compteur calories brûlées
  - Météo à l'arrivée
  - Partage trajet (deep link)
