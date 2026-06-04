# Plan d'exécution — UrbanFlow Mobility

> Généré le 2026-06-02 — Suite des optimisations GTFS/RAPTOR

---

## ✅ Accomplissements récents (session actuelle)

| # | Tâche | Fichiers modifiés | Statut |
|---|---|---|---|
| 1 | GTFS parser streaming (évite OOM) | `gtfs-parser.service.ts`, `docker-compose.yml` | ✅ |
| 2 | Optimisation RAPTOR O(1) | `gtfs-parser.service.ts`, `journey.service.ts` | ✅ |
| 3 | Geocoding filtré sur Paris | `prim.service.ts`, `transport.controller.ts` | ✅ |
| 4 | Recherche d'arrêts GTFS par nom | `gtfs-parser.service.ts`, `transport.controller.ts` | ✅ |
| 5 | Arrêts proches par GPS | `transport.controller.ts`, `api.ts`, `useTransport.ts`, `search/page.tsx` | ✅ |
| 6 | Persistance Docker GTFS | `docker-compose.yml` | ✅ |
| 7 | Instructions détaillées par étape | `journey.service.ts` | ✅ |
| 8 | Documentation Kaizen + README + AUDIT | `KAIZEN.md`, `README.md`, `AUDIT_PROJET.md` | ✅ |

---

## 🔴 Phase 1 — Nettoyage code mort (15 min) ✅

| Fichier | Action | Pourquoi | Statut |
|---|---|---|---|
| `apps/frontend/src/components/TransportCard.tsx` | **Supprimer** | Jamais importé, `TripCard.tsx` fait le même job | ✅ Supprimé |
| `apps/backend/src/transport/gtfs-parser.service.ts:getStopById()` | **Supprimer la méthode** | Définie mais jamais appelée hors du service | ✅ Supprimée |
| `apps/frontend/src/hooks/useLocalStorage.ts` | **Vérifier puis supprimer** | AUDIT indique "orphan" — confirmer qu'aucun import persiste | ✅ Déjà supprimé |
| `apps/backend/src/auth/memory-auth.service.ts` | **Supprimer** | Service non injecté dans `auth.module.ts` (déjà identifié dans AUDIT) | ✅ Déjà supprimé |
| `apps/frontend/src/components/VelibStationCard.tsx` | **Conserver** | Utilisé dans `page.tsx:11` (`NearbyVelibSection`) | ✅ Conservé |

---

## 🟤 Phase 1.5 — Bugs UX identifiés (30 min) ✅

> Découverts pendant la Phase 1 — corrigés

| # | Bug | Fichier | Action | Statut |
|---|---|---|---|---|
| 1 | **Trajets récents = mocks** | `apps/frontend/src/app/page.tsx:107-111` | Remplacé par `useState<HistoryJourney[]>` + `useEffect` appelant `getHistory().slice(0, 3)`. Message "Aucun trajet récent" si vide. Badge `modeColor` ajouté. | ✅ Corrigé |
| 2 | **Filtre "Économique" buggé** | `apps/frontend/src/app/search/page.tsx:21-25, 247-260` | **Supprimé** le filtre `cheap` (Paris = tarif unifié Navigo). Retiré `Wallet` de l'import Lucide. | ✅ Corrigé |
| 3 | **Pas de prix dans l'API** | `apps/backend/src/transport/journey.service.ts` + `api.ts` | Non implémenté — le filtre cheap étant supprimé, le champ `cost` n'est plus nécessaire. | ✅ N/A |

---

## 🟤 Phase 1.6 — Scope géographique : Paris uniquement ? (audit)

> Vérification demandée : la solution est-elle strictement limitée à Paris ?

### Résultat de l'audit

| Composant | Strictement Paris ? | Détails |
|---|---|---|
| **Geocoding (recherche d'adresses)** | ✅ **OUI** | `prim.service.ts:459-462` : `isParisResult` filtre `postcode.startsWith('75') \|\| city === 'paris'`. Seuls les résultats parisiens sont retournés. |
| **Reverse geocoding** | ❌ **NON** | `prim.service.ts:520-551` : retourne le 1er résultat data.gouv.fr sans filtre. Si l'utilisateur clique sur la carte à Saint-Denis (93), il obtiendra "Saint-Denis". |
| **GTFS — Données chargées** | ❌ **NON** | Le GTFS est **IDFM** (Île-de-France Mobilités). Il couvre **toute l'Île-de-France** (75/77/78/91/92/93/94/95). Le parser charge 53 989 arrêts sur toute la région, sans aucun filtre. |
| **GTFS — Arrêts proches** | ❌ **NON** | `transport.controller.ts:187-191` : `findStopsNearby` utilise le GTFS IDFM non filtré. Si l'utilisateur est près du Périphérique (ex: Porte de Clignancourt), des arrêts de Saint-Ouen (93) peuvent apparaître. |
| **Vélib' — Stations proches** | ✅ **OUI** | `prim.service.ts:286-374` : utilise **uniquement** Open Data Paris (intra-muros, 75). Le commentaire mentionne JCDecaux pour la banlieue mais le code n'y fait pas appel. |
| **Vélib' — Toutes les stations** | ❌ **NON** | `prim.service.ts:265-274` : utilise le dataset PRIM `jcdecaux-bike-stations-data` qui inclut les stations de banlieue. |
| **Carte (MapComponent)** | ❌ **NON** | Pas de `maxBounds` ni de restriction de zoom/pan. L'utilisateur peut naviguer n'importe où dans le monde. |
| **Lignes par mode** | ❌ **NON** | `prim.service.ts` : agrège depuis le référentiel PRIM IDFM qui couvre toute la région. |

### Conséquences

- Un itinéraire "Opéra → La Défense" fonctionnera : le géocoding retourne Paris, mais le GTFS IDFM inclut La Défense (92) → **itinéraire trans-frontalier possible**.
- Les "arrêts proches" près de la limite administrative peuvent inclure des arrêts hors Paris.
- Le GTFS parser consomme de la mémoire pour toute l'Île-de-France (8.2M stop_times) alors que si l'on ne veut que Paris, on pourrait filtrer.

### Options

| Option | Impact | Complexité |
|---|---|---|
| **A. Filtrer GTFS au chargement** (garder uniquement stops avec `stop_name` contenant "Paris" ou dans bounding box Paris) | Réduit mémoire ~30-40%, limite strictement à Paris | 🟡 Moyenne — risque de perdre des arrêts utiles (Gare du Nord est à la limite, certains arrêts n'ont pas "Paris" dans le nom) |
| **B. Filtrer "nearby stops" à la volée** (post-pass sur résultats) | Garde le GTFS complet en mémoire mais n'affiche que Paris | 🟢 Facile — ajouter un filtre `postcode` ou bounding box dans `findStopsNearby` |
| **C. Limiter reverse geocoding** | Empêche de sélectionner une adresse hors Paris via la carte | 🟢 Facile — ajouter `isParisResult` sur le retour de data.gouv.fr |
| **D. Ne rien changer** | Accepter que l'app couvre Paris + proche banlieue (ce qui est réaliste pour les déplacements franciliens) | 🟢 Triviale — mais ne répond pas au cahier des charges "Paris uniquement" |

**✅ Décision métier retenue** (après discussion)

> **"Se limiter à Paris, mais prendre en compte les arrêts de transport qui dépassent. Prévoir des messages d'erreur si hors Paris, ou ne montrer aucun itinéraire (comme Citymapper)."**

Cela signifie :

| Règle | Détail |
|---|---|
| **Adresses** | Strictement Paris (75xxx) — déjà le cas |
| **Arrêts GTFS** | **Garder tout le GTFS IDFM** — les arrêts de banlieue (Saint-Denis, La Défense, Massy…) sont des stations de métro/RER/tram, ils doivent rester utilisables |
| **"Autour de vous"** | Filtrer les arrêts trop éloignés (ex: > 2km hors Paris) mais garder ceux à la limite (Porte de Clignancourt → Saint-Ouen OK) |
| **Reverse geocoding (clic carte)** | Si hors Paris → afficher **"Hors de Paris"** et **ne pas permettre la sélection** comme origine/destination |
| **Itinéraire** | Si origine ET destination sont des **adresses hors Paris** → **ne pas calculer**, afficher un message. Si un arrêt GTFS est impliqué → calculer normalement (ex: Opéra → Saint-Denis est valide) |

**Messages d'erreur à implémenter** :
- Adresse hors Paris dans la barre de recherche → *"Cette adresse est hors de Paris. UrbanFlow couvre Paris et ses arrêts de transport en proche banlieue."*
- Clic carte hors Paris → *"Hors de Paris"* (badge sur le pin, pas de bouton "Définir comme départ")
- GPS hors Île-de-France + "Autour de vous" vide → *"Aucun arrêt trouvé à proximité. Vérifiez que vous êtes à Paris ou en proche banlieue."*
- Itinéraire impossible (adresse hors Paris sans arrêt GTFS proche) → *"Impossible de calculer un itinéraire pour cette destination. Essayez une adresse à Paris."*

**Implémentation** ✅ :

| # | Tâche | Fichier | Détails |
|---|---|---|---|
| 1 | `isParis` sur `GeocodeResult` | `apps/frontend/src/services/api.ts` | Ajout `isParis: boolean` sur `GeocodeResult` et `ReverseGeocodeResult` |
| 2 | `isParis` backend geocoding | `apps/backend/src/transport/prim.service.ts:496, 537` | `geocode()` retourne `isParis: true` (tous les résultats passent le filtre). `reverseGeocode()` calcule `isParis` depuis postcode/city |
| 3 | Filtrer `findStopsNearby` | `apps/backend/src/transport/gtfs-parser.service.ts:660` | Vérification rapide : si position > 30km de Paris → retourne `[]` immédiatement sans parcourir les 53 989 arrêts |
| 4 | Bloquer clic carte hors Paris | `apps/frontend/src/app/search/page.tsx:118-135` | `handleMapClick` vérifie `result.isParis`. Si `false` → `setMapClickError("Hors de Paris — sélectionnez une adresse à Paris")` et retourne sans sélectionner |
| 5 | Message carte hors Paris | `apps/frontend/src/app/search/page.tsx:361-367` | Affichage conditionnel de `mapClickError` avec style alerte orange + icône `AlertTriangle` |
| 6 | Message dropdown vide | `apps/frontend/src/app/search/page.tsx:441-456, 487-503` | Quand `originSuggestions.length === 0` ou `destSuggestions.length === 0` → message *"Aucun résultat à Paris. UrbanFlow couvre uniquement Paris et ses arrêts de transport."* |
| 7 | Refuser itinéraire hors Paris | `apps/backend/src/transport/journey.service.ts:130-145` | Vérification `originDistFromParis > 30 || destDistFromParis > 30` → retourne `[]` avec `logger.warn` |
| 8 | Message itinéraire vide | `apps/frontend/src/app/search/page.tsx:581-588` | Quand `sortedJourneys.length === 0` + `selectedOrigin` + `selectedDest` → message *"Aucun itinéraire trouvé — Vérifiez que votre départ et votre arrivée sont à Paris ou en proche banlieue."* |

---

## 🟤 Phase 1.7 — Fonctionnement recherche d'adresses (documentation)

> Explication du fonctionnement actuel de la barre de recherche et du géocoding

### Architecture actuelle

La recherche d'adresses dans UrbanFlow est un **système hybride** qui fusionne deux sources de données :

```
┌─────────────────────────────────────────────────────────────┐
│                    Barre de recherche                        │
│                   (search/page.tsx)                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
    ┌─────▼─────┐           ┌──────▼──────┐
    │ Arrêts    │           │ Adresses    │
    │ GTFS      │           │ data.gouv.fr│
    │ (PRIM)    │           │ (geocoding) │
    └─────┬─────┘           └──────┬──────┘
          │                        │
          └──────────┬─────────────┘
                     │
            ┌────────▼────────┐
            │  Fusion         │
            │  Suggestions    │
            │  (arrêts first, │
            │  puis adresses) │
            └────────┬────────┘
                     │
            ┌────────▼────────┐
            │  Autocomplete   │
            │  Dropdown       │
            └─────────────────┘
```

### 1. Source 1 — Arrêts GTFS (PRIM IDFM)

- **Hook** : `useStopSearch(query)` → `apiService.searchGtfsStops(query)`
- **Endpoint** : `GET /api/transport/gtfs-stops/search?q={query}`
- **Backend** : `gtfs-parser.service.ts:648` — recherche floue insensible à la casse sur `stop_name`
- **Couverture** : Tous les arrêts GTFS IDFM (53 989 arrêts, Île-de-France entière)
- **Limitation** : Pas de filtre géographique actuellement — si on cherche "Gare", on obtient toutes les gares de la région

### 2. Source 2 — Adresses (data.gouv.fr)

- **Hook** : `useGeocode(query)` → `apiService.geocode(query)`
- **Endpoint** : `GET /api/transport/geocode?q={query}`
- **Backend** : `prim.service.ts:450-501` — appel à `api-adresse.data.gouv.fr/search`
- **Stratégie** :
  1. Essai avec `city=Paris` (privilégie les adresses parisiennes)
  2. Si pas assez de résultats, essai sans filtre `city`
  3. Post-filtre : `isParisResult` garde uniquement `postcode.startsWith('75') || city === 'paris'`
- **Couverture** : **Paris uniquement** (75xxx)

### 3. Fusion et affichage

Dans `search/page.tsx:151-163` :
```tsx
const originSuggestions = useMemo(() => {
  const items: SuggestionItem[] = [];
  originStops.slice(0, 3).forEach((s) => items.push({ type: "stop", data: s }));
  originAddresses.slice(0, 3).forEach((a) => items.push({ type: "address", data: a }));
  return items;
}, [originStops, originAddresses]);
```

- **Ordre** : Arrêts GTFS en premier (3 résultats), puis adresses (3 résultats)
- **Style visuel** : Arrêts = icône métro/bus + nom + arrondissement. Adresses = icône bâtiment + label + code postal + ville
- **Sélection** : Clique sur un arrêt → `setOrigin(stop.name)`. Clic sur une adresse → `setOrigin(addr.label)`

### 4. Reverse Geocoding (clic sur la carte)

- **Hook** : `handleMapClick(lat, lng)` dans `search/page.tsx:119-135`
- **Endpoint** : `GET /api/transport/reverse-geocode?lat={lat}&lon={lon}`
- **Backend** : `prim.service.ts:520-551` — appel à `api-adresse.data.gouv.fr/reverse`
- **Problème** : Retourne le **1er résultat brut** sans filtre Paris. Un clic à Saint-Denis retourne "Saint-Denis".
- **Impact** : L'utilisateur peut sélectionner une destination hors Paris, mais le géocoding frontal reste Parisien.

### 5. "Autour de vous" (GPS)

- **Hook** : `useNearbyStops(userLat, userLon, 0.5, 6)`
- **Endpoint** : `GET /api/transport/nearby?lat={lat}&lon={lon}&radius=0.5&limit=6`
- **Backend** : `gtfs-parser.service.ts` — `findStopsNearby` par distance Haversine
- **Problème** : GTFS IDFM non filtré → peut retourner des arrêts de banlieue si l'utilisateur est près du Périphérique

### Points de vigilance

| Problème | Où | Impact |
|---|---|---|
| Arrêts GTFS non filtrés par ville | `searchGtfsStops` | Recherche "Gare" → Gare du Nord + Gare de Lyon + Gare de Massy-Palaiseau |
| Reverse geocoding non filtré | `prim.service.ts:520` | Clic carte à Saint-Denis → destination hors Paris |
| Nearby stops non filtrés | `findStopsNearby` | GPS près de la porte → arrêts de banlieue dans "Autour de vous" |
| Le geocoding frontal est Paris-only | `prim.service.ts:459` | OK — mais l'utilisateur peut contourner via la carte |

### 6. Comportement quand l'adresse saisie est hors de Paris

#### Scénario A : L'utilisateur tape "Lyon" dans la barre de recherche

| Source | Résultat | Explication |
|---|---|---|
| **Adresses (data.gouv.fr)** | ✅ **Vide** (`total_count: 0`) | Le filtre `isParisResult` rejette tout résultat avec `postcode` hors 75xxx ou `city !== 'paris'`. Lyon (postcode 69xxx, city=lyon) est éliminé. Le dropdown n'affiche **aucune adresse**. |
| **Arrêts GTFS** | ✅ **Vide** | "Lyon" n'est pas dans le GTFS IDFM (Île-de-France uniquement). `searchStopsByName` ne trouve rien. |
| **Dropdown final** | ✅ **Vide** | Aucune suggestion. L'utilisateur voit un champ vide ou un message "Aucun résultat" (selon l'UI). |
| **Impact UX** | 🟡 **Confusion possible** | L'utilisateur ne sait pas *pourquoi* il n'y a pas de résultat. Pas de message explicifiant "UrbanFlow ne couvre que Paris". |

#### Scénario B : L'utilisateur tape "Massy-Palaiseau" dans la barre de recherche

| Source | Résultat | Explication |
|---|---|---|
| **Adresses (data.gouv.fr)** | ✅ **Vide** | Massy-Palaiseau = postcode 91xxx, city=massy. `isParisResult` rejette. |
| **Arrêts GTFS** | ❌ **Apparaît** | "Massy-Palaiseau" est dans le GTFS IDFM (RER B, Transilien). `searchStopsByName` le retourne. L'arrêt apparaît dans le dropdown avec une icône RER. |
| **Impact UX** | 🟡 **Incohérent** | L'adresse est rejetée mais l'arrêt est accepté. L'utilisateur peut planifier un itinéraire Paris → Massy-Palaiseau. |

#### Scénario C : L'utilisateur tape "Saint-Denis" dans la barre de recherche

| Source | Résultat | Explication |
|---|---|---|
| **Adresses (data.gouv.fr)** | ✅ **Vide** | Saint-Denis = postcode 93xxx. Rejeté par `isParisResult`. |
| **Arrêts GTFS** | ❌ **Apparaît** | "Saint-Denis" est dans le GTFS IDFM (métro 13, tram T1, T8). L'arrêt apparaît dans le dropdown. |
| **Impact UX** | 🟡 **Incohérent** | Même comportement que Massy-Palaiseau. |

#### Scénario D : L'utilisateur est à Lyon et clique "Ma position" (GPS)

| Source | Résultat | Explication |
|---|---|---|
| **"Autour de vous"** | ✅ **Vide** | `findStopsNearby(lat=Lyon, lon=Lyon, radius=0.5)` parcourt les 53 989 arrêts GTFS. Aucun arrêt n'est dans un rayon de 0.5km autour de Lyon (car le GTFS est IDFM). Résultat : tableau vide. |
| **Reverse geocoding** | ❌ **"Lyon"** | `reverseGeocode` retourne le 1er résultat data.gouv.fr brut : "Lyon 1er Arrondissement, Lyon". **Pas de filtre Paris**. |
| **Impact UX** | 🔴 **Bloqué** | L'utilisateur voit "Lyon" comme origine, mais ne peut pas sélectionner d'arrêt proche. Si force la recherche d'itinéraire → échec (pas d'arrêts GTFS à Lyon). |

#### Scénario E : L'utilisateur est à la porte de Clignancourt (Paris 18e, près de Saint-Ouen)

| Source | Résultat | Explication |
|---|---|---|
| **"Autour de vous"** | ❌ **Saint-Ouen** | `findStopsNearby` retourne les arrêts dans un rayon de 0.5km. Si la position GPS est à 200m de la limite, des arrêts de Saint-Ouen (93) apparaissent. |
| **Impact UX** | 🟡 **Acceptable** | L'arrêt est utilisable (métro 13, tram). L'itinéraire fonctionne. C'est "proche banlieue", pas une erreur grave. |

### Synthèse du comportement actuel

| Situation | Adresses | Arrêts GTFS | "Autour de vous" | Itinéraire possible ? |
|---|---|---|---|---|
| **Ville éloignée** (Lyon, Marseille) | ❌ Rejeté | ❌ Non dans GTFS | ❌ Vide | ❌ Non |
| **Banlieue IDFM** (Massy, Saint-Denis) | ❌ Rejeté | ✅ Dans GTFS | ✅ Si proche | ✅ Oui |
| **GPS hors IDFM** | N/A | N/A | ❌ Vide | ❌ Non |
| **GPS près de la limite** | N/A | N/A | 🟡 Banlieue possible | ✅ Oui |

### Problème UX principal

> **L'utilisateur n'a aucun retour explicite quand sa recherche est hors scope.**

- Pas de message "UrbanFlow ne couvre que Paris"
- Pas de message "Aucun arrêt trouvé dans cette zone"
- Le dropdown vide peut être interprété comme un bug réseau
- Le géocoding frontal filtre silencieusement

### Recommandation

Ajouter un **message explicite** dans le frontend quand :
1. Le géocoding retourne 0 résultats → "Aucune adresse trouvée à Paris. UrbanFlow couvre uniquement Paris intra-muros."
2. `findStopsNearby` retourne 0 résultats + GPS hors bounding box Paris → "Aucun arrêt de transport trouvé à proximité."
3. La recherche d'arrêts GTFS retourne 0 résultats → "Aucun arrêt trouvé. Vérifiez l'orthographe ou essayez une adresse parisienne."

---

## 🟠 Phase 2 — Qualité des résultats (2-3h)

### 2a. Itinéraires — Validation utilisateur
- [ ] **Tester dans le navigateur** : GPS → "Autour de vous" → clic arrêt → destination "Gare du Nord" → vérifier que l'itinéraire reste à Paris
- [ ] **Bug connu** : si aucun itinéraire RAPTOR ne matche, le fallback génère un trajet bus/métro approximatif qui peut être incohérent — vérifier le comportement
- [ ] **Timeout** : certains trajets longs (ex: Nord → Sud Paris) peuvent encore dépasser 30s — profiler si besoin

### 2b. GTFS-RT — Afficher les perturbations ✅
- [x] Endpoint `/api/transport/realtime-alerts` retourne les alertes PRIM Navitia
- [x] **Backend** : enrichir `JourneyResult` avec `alerts: JourneyAlert[]` — matching bidirectionnel normalisé sur `lineName` vs `affectedRoutes`
- [x] **Frontend** : badge ⚠️ amber sur `TripCard` quand `hasAlert={trip.alerts?.length > 0}`
- [x] **Frontend** : affichage détaillé des alertes sur `trip/[id]/page.tsx` (severity colorée : severe=rouge, warning=amber, info=bleu)
- [x] **API** : `getRealtimeAlerts()` + `useRealtimeAlerts()` hook dans `useTransport.ts`

**Fichiers modifiés** : `journey.service.ts`, `transport.controller.ts`, `api.ts`, `useTransport.ts`, `TripCard.tsx`, `search/page.tsx`, `trip/[id]/page.tsx`

### 2c. Cache GTFS périodique
- [ ] Le GTFS est rechargé seulement au démarrage — ajouter un cron (`@Cron('0 3 * * *')`) pour re-télécharger la nuit
- [ ] Ou exposer un bouton "Admin → Recharger GTFS" plus accessible

---

## 🟡 Phase 3 — UX & Navigation (3-4h)

### 3a. Carte du trajet réel (shapes)
- [ ] `shapes.txt` est ignoré pour l'OOM — il faut un moyen d'afficher la trajectoire réelle du métro/bus sur la carte
- [ ] **Option A** : parser partiellement `shapes.txt` (lazy load par `shape_id` du trip) via un endpoint dédié
- [ ] **Option B** : utiliser OSRM pour le segment de marche + tracer une ligne droite colorée pour le transit (ce qui est déjà fait partiellement)

### 3b. Prochains départs par arrêt ✅
- [x] Nouvel endpoint : `GET /api/transport/stop-times?stopId=...&limit=5`
- [x] Backend : `getStopDepartures()` dans `gtfs-parser.service.ts` — filtre par service actif aujourd'hui, déduplique par `(lineName, headsign)`, calcule `waitMinutes`
- [x] Frontend : drawer bottom-sheet sur `search/page.tsx` — clic sur un arrêt proche → affiche prochains départs avec badge ligne colorée, direction, voie, minutes d'attente
- [x] Hook `useStopTimes(stopId)` dans `useTransport.ts`
- [x] API `getStopTimes()` dans `api.ts`

### 3b+ Immersion trajet — Idées pour améliorer l'expérience

| # | Idée | Impact UX | Complexité | Faisable pour soutenance ? |
|---|---|---|---|---|
| 1 | **Timeline visuelle enrichie** | 🔴 Haut | 🟢 Facile | ✅ Déjà implémenté (badge ligne coloré, direction, quai, mode) |
| 2 | **Icônes spécifiques par mode** | 🔴 Haut | 🟢 Facile | ✅ Bus=🚌, Métro=M, RER=RER, Tram=🚊, Marche=🚶, Vélib'=🚲 |
| 3 | **Arrêts intermédiaires** | 🟠 Moyen | 🟡 Moyenne | 📝 Nécessite d'enrichir `JourneySegment` avec `intermediateStops[]` |
| 4 | **Notifications push 5 min avant départ** | 🔴 Haut | 🟡 Moyenne | 📝 Phase 4 — PWA + service worker |
| 5 | **Vibration téléphone à chaque étape** | 🟠 Moyen | 🟢 Facile | 📝 `navigator.vibrate()` dans `useNavigation` |
| 6 | **Compteur calories brûlées** | 🟢 Faible | 🟢 Facile | 📝 Formule MET × poids × durée |
| 7 | **Météo à l'arrivée** | 🟠 Moyen | 🟢 Facile | 📝 API Météo-France — afficher température + pluie |
| 8 | **Densité rame (crowding)** | 🟠 Moyen | 🔴 Élevée | ❌ Données IDFM non disponibles en open data |
| 9 | **Son d'annonce "Prochain arrêt"** | 🟠 Moyen | 🟡 Moyenne | 📝 Web Speech API `speechSynthesis` |
| 10 | **Partage trajet (deep link)** | 🔴 Haut | 🟡 Moyenne | 📝 URL avec params encodés + preview meta |
| 11 | **Vue 3D immersive** | 🟠 Moyen | 🔴 Élevée | ❌ Nécessite Mapbox GL JS — hors budget |
| 12 | **Mode "Compagnon" (écran allumé constant)** | 🟠 Moyen | 🟢 Facile | 📝 `screenWakeLock` API + bouton toggle |

**✅ Recommandation pour la soutenance** :
- Garder les 2 premières (déjà faites)
- Implémenter #5 (vibration) + #9 (annonce vocale) + #12 (écran allumé) — 3 quick wins qui changent l'expérience

### 3c. Navigation GPS pas à pas
- [x] Icônes spécifiques par mode dans la timeline (Bus 🚌, Métro/M, RER, Tram, Marche, Vélib') — `getSegmentIcon()`
- [x] Badge ligne coloré avec nom réel dans la timeline
- [ ] **Bug** : les segments actifs sont basés sur le temps écoulé, pas sur la position GPS réelle
- [ ] Connecter `useNavigation` avec `useGeolocation` en mode `watchPosition` pour progression réelle
- [ ] Vibration téléphone à chaque changement d'étape

---

## 🟢 Phase 4 — PWA & Offline (2-3h)

| # | Tâche | Fichier | Détails |
|---|---|---|---|
| 1 | Fix `sw.js` — chrome-extension | `public/sw.js` | Ajouter `if (!url.startsWith('http')) return;` avant `cache.put()` |
| 2 | Cache IndexedDB arrêts proches | `services/api.ts` + `hooks/useTransport.ts` | Stocker les 20 derniers résultats `nearby` pour affichage offline |
| 3 | Notifications push départ | `notifications.service.ts` | Envoyer une notif 5 min avant le départ du 1er segment |
| 4 | Bouton "Installer l'app" | `page.tsx` ou `layout.tsx` | Afficher un banner PWA si `beforeinstallprompt` est déclenché |

---

## 🔵 Phase 5 — Tests & Documentation finale (2-3h)

| # | Tâche | Fichiers | Priorité |
|---|---|---|---|
| 1 | Tests unitaires Auth module | `auth/*.spec.ts` | Haute (AUDIT le demande) |
| 2 | Tests unitaires GTFS parser | `gtfs-parser.service.spec.ts` | Haute — parsing est critique |
| 3 | Tests E2E itinéraire | Playwright ou Cypress | Moyenne |
| 4 | Mettre à jour `Dossier_Technique.md` | `docs/Dossier_Technique.md` | Moyenne |
| 5 | Compléter `Rendu_Final_Urban_Flow_Mobility.md` | `docs/Rendu_Final_Urban_Flow_Mobility.md` | Basse |

---

## 🟡 Phase 1.8 — Optimisation GTFS : filtrage par bounding box Paris ✅

> Implémenté suite à l'audit mémoire — le chargement GTFS IDFM complet (53 989 arrêts, 8.2M stop_times) consommait 3.5 GB de heap et ~2 min de parsing.

### Décision retenue : Option C + A

| Option | Description | Statut |
|---|---|---|
| **C** | **Filtrer les arrêts GTFS à la bounding box Paris** (~25 km autour de Notre-Dame) | ✅ Implémenté |
| **A** | **Sérialiser les index GTFS sur disque** (JSON binaire des `Map`) pour un démarrage en ~10s | 📝 Planifié post-soutenance |
| **D** | **Upgrade Hostinger KVM 1 → KVM 2** (4 GB → 8 GB RAM) | 📝 Planifié pour prod/pre-prod |

### Implémentation Option C

**Fichier** : `apps/backend/src/transport/gtfs-parser.service.ts`

1. **`filterStopsByRegion(stops)`** (nouvelle méthode privée)
   - Centre : Notre-Dame (48.8566, 2.3522)
   - Rayon : 25 km
   - Retourne : `filteredStops[]` + `validStopIds: Set<string>`

2. **`loadFromZip()`** modifié :
   - Parse `stops.txt` → filtre par bounding box
   - Parse `stop_times.txt` en streaming, NE GARDE que les horaires des arrêts retenus
   - Collecte les `trip_id` réellement utilisés dans un `Set`
   - Filtre `trips.txt` : ne garde que les trips du Set
   - Filtre `routes.txt` : ne garde que les routes des trips restants
   - Parse `transfers.txt` en streaming, filtre `from_stop_id` et `to_stop_id`
   - Construit l'index final avec les données filtrées

### Gains attendus

| Métrique | Avant (GTFS complet IDFM) | Après (bounding box 25 km) |
|---|---|---|
| **Arrêts chargés** | ~54 000 | ~30 000-40 000 (estimé) |
| **Routes** | ~2 010 | ~1 200-1 500 (estimé) |
| **Stop_times** | ~8.2M | ~4-5M (estimé) |
| **Heap mémoire** | ~3.5 GB | ~1.5-2 GB (estimé) |
| **Temps parsing** | ~2 min | ~45-60s (estimé) |

> **Note** : Les arrêts de banlieue (La Défense, Saint-Denis, Massy…) restent inclus s'ils sont dans le rayon de 25 km. Les lignes de bus de Grande Couronne et les arrêts ruraux sont éliminés.

---

## 🟡 Phase 1.9 — Position GPS hors zone (validation "Ma position") ✅

> Découvert pendant les tests — le bouton "Ma position" à Marolles-en-Brie (~18 km) calculait un itinéraire.

| # | Tâche | Fichier | Détails |
|---|---|---|---|
| 1 | `haversineKm()` utilitaire | `search/page.tsx` | Fonction de calcul de distance depuis le centre de Paris (48.8566, 2.3522) |
| 2 | `useMyPosition()` modifié | `search/page.tsx` | Si distance > 15 km → `setPositionError(...)` et retourne sans définir l'origine |
| 3 | Affichage message erreur | `search/page.tsx` | Bannière amber avec `AlertTriangle` : "Votre position est à X km de Paris. UrbanFlow couvre uniquement Paris et sa proche banlieue (≤ 15 km)." |
| 4 | `positionError` state | `search/page.tsx` | `useState<string | null>(null)` — réinitialisé à chaque clic |

**Limite retenue** : 15 km (couvre Paris intra-muros + banlieue immédiate : Boulogne, Saint-Ouen, Montreuil, Vincennes, Issy… mais PAS Marolles-en-Brie, Massy, Cergy).

---

## 📊 Synthèse des priorités

| Phase | Durée estimée | Impact utilisateur | Complexité technique |
|---|---|---|---|
| 1 — Nettoyage | 15 min | 🟢 Faible | 🟢 Triviale | ✅ |
| 1.5 — Bugs UX (mocks, filtre cheap) | 30 min | 🔴 Haut | 🟢 Facile | ✅ |
| 1.6 — Scope géographique (implémentation) | 45 min | 🔴 Haut | 🟢 Facile | ✅ |
| 1.7 — Doc recherche d'adresses | 15 min | 🟢 Faible | 🟢 Triviale (doc) | ✅ |
| 1.8 — Optimisation GTFS bounding box | 30 min | 🟠 Moyen | 🟡 Moyenne | ✅ |
| 1.9 — Position GPS hors zone (Ma position) | 15 min | 🔴 Haut | 🟢 Facile | ✅ |
| 2a — Validation trajets | 30 min | 🔴 Haut | 🟢 Facile (tests) |
| 2b — GTFS-RT alertes | 1h | 🔴 Haut | 🟡 Moyenne | ✅ |
| 3a — Carte trajet réel | 2h | 🟠 Moyen | 🔴 Élevée (shapes lazy load) |
| 3b — Prochains départs | 1.5h | 🔴 Haut | 🟡 Moyenne | ✅ |
| 3b+ — Immersion trajet | 1h | 🔴 Haut | 🟢 Facile | ✅ (badge ligne, icônes mode, horaires, détails) |
| 3c — Navigation GPS | 2h | 🟠 Moyen | 🟡 Moyenne |
| 4 — PWA fix | 1h | 🟠 Moyen | 🟢 Facile |
| 5 — Tests | 3h | 🟢 Faible (interne) | 🟡 Moyenne |

---

## 🚀 Recommandation pour la prochaine session

**Phases 1.x terminées** ✅ — le codebase est propre, les mocks sont supprimés, le scope géographique est implémenté.

**Ordre suggéré** :
1. **Phase 2a** (validation dans le navigateur) — s'assurer que tout fonctionne réellement après les modifications
2. **Phase 2b** (GTFS-RT alertes) — impact visible immédiat pour l'utilisateur
3. **Phase 4** (PWA fix + offline) — facile et gratifiant

**Contexte à rappeler** :
- GTFS IDFM complet chargé : 53 989 arrêts, 2 011 routes, 8.2M stop_times
- Docker volume `gtfs_data` persisté → rebuild rapide
- Node heap 3.5 GB → parsing stable
- Geocoding retourne **Paris uniquement** (postcode 75xxx) + `isParis: boolean` dans l'API
- Reverse geocoding filtré : clic carte hors Paris → message "Hors de Paris" + pas de sélection
- `findStopsNearby` filtré : si GPS > 30km de Paris → retourne `[]` immédiatement
- `findJourney` refusé : si origine ou destination > 30km de Paris → retourne `[]` avec `logger.warn`
- Dropdown vide : message explicite *"Aucun résultat à Paris. UrbanFlow couvre uniquement Paris et ses arrêts de transport."*
- Itinéraire vide : message explicite *"Vérifiez que votre départ et votre arrivée sont à Paris ou en proche banlieue."*
- **"Ma position" bloqué** : si GPS > 15 km de Paris → bannière amber + pas de calcul
- Filtre "Économique" supprimé (Paris = tarif unifié Navigo)
- Trajets récents dynamiques via `getHistory()` (3 derniers)

---

*Plan généré par Claude — T6 UrbanFlow Mobility*