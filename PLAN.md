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

## 🔴 Phase 1 — Nettoyage code mort (15 min)

| Fichier | Action | Pourquoi |
|---|---|---|
| `apps/frontend/src/components/TransportCard.tsx` | **Supprimer** | Jamais importé, `TripCard.tsx` fait le même job |
| `apps/backend/src/transport/gtfs-parser.service.ts:getStopById()` | **Supprimer la méthode** | Définie mais jamais appelée hors du service |
| `apps/frontend/src/hooks/useLocalStorage.ts` | **Vérifier puis supprimer** | AUDIT indique "orphan" — confirmer qu'aucun import persiste |
| `apps/backend/src/auth/memory-auth.service.ts` | **Supprimer** | Service non injecté dans `auth.module.ts` (déjà identifié dans AUDIT) |
| `apps/frontend/src/components/VelibStationCard.tsx` | **Conserver** | Utilisé dans `page.tsx:11` (`NearbyVelibSection`) |

---

## 🟠 Phase 2 — Qualité des résultats (2-3h)

### 2a. Itinéraires — Validation utilisateur
- [ ] **Tester dans le navigateur** : GPS → "Autour de vous" → clic arrêt → destination "Gare du Nord" → vérifier que l'itinéraire reste à Paris
- [ ] **Bug connu** : si aucun itinéraire RAPTOR ne matche, le fallback génère un trajet bus/métro approximatif qui peut être incohérent — vérifier le comportement
- [ ] **Timeout** : certains trajets longs (ex: Nord → Sud Paris) peuvent encore dépasser 30s — profiler si besoin

### 2b. GTFS-RT — Afficher les perturbations
- [ ] Endpoint `/api/transport/realtime-alerts` retourne déjà les alertes
- [ ] **Frontend** : afficher un badge ⚠️ sur le `TripCard` si une alerte affecte une ligne du trajet
- [ ] **Backend** : enrichir `JourneyResult` avec un champ `alerts` lié aux lignes empruntées

### 2c. Cache GTFS périodique
- [ ] Le GTFS est rechargé seulement au démarrage — ajouter un cron (`@Cron('0 3 * * *')`) pour re-télécharger la nuit
- [ ] Ou exposer un bouton "Admin → Recharger GTFS" plus accessible

---

## 🟡 Phase 3 — UX & Navigation (3-4h)

### 3a. Carte du trajet réel (shapes)
- [ ] `shapes.txt` est ignoré pour l'OOM — il faut un moyen d'afficher la trajectoire réelle du métro/bus sur la carte
- [ ] **Option A** : parser partiellement `shapes.txt` (lazy load par `shape_id` du trip) via un endpoint dédié
- [ ] **Option B** : utiliser OSRM pour le segment de marche + tracer une ligne droite colorée pour le transit (ce qui est déjà fait partiellement)

### 3b. Prochains départs par arrêt
- [ ] Nouvel endpoint : `GET /api/transport/stop-times?stopId=...&after=HH:MM:SS&limit=5`
- [ ] UI dans la page Recherche : quand on clique un arrêt proche, afficher un drawer avec les prochains départs (ligne, direction, minutes d'attente)

### 3c. Navigation GPS pas à pas
- [ ] Hook `useNavigation` existe dans `trip/[id]/page.tsx` (start/pause/resume)
- [ ] **Bug** : les segments actifs sont basés sur le temps écoulé, pas sur la position GPS réelle
- [ ] Connecter `useNavigation` avec `useGeolocation` en mode `watchPosition` pour progression réelle

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

## 📊 Synthèse des priorités

| Phase | Durée estimée | Impact utilisateur | Complexité technique |
|---|---|---|---|
| 1 — Nettoyage | 15 min | 🟢 Faible | 🟢 Triviale |
| 2a — Validation trajets | 30 min | 🔴 Haut | 🟢 Facile (tests) |
| 2b — GTFS-RT alertes | 1h | 🔴 Haut | 🟡 Moyenne |
| 3a — Carte trajet réel | 2h | 🟠 Moyen | 🔴 Élevée (shapes lazy load) |
| 3b — Prochains départs | 1.5h | 🔴 Haut | 🟡 Moyenne |
| 3c — Navigation GPS | 2h | 🟠 Moyen | 🟡 Moyenne |
| 4 — PWA fix | 1h | 🟠 Moyen | 🟢 Facile |
| 5 — Tests | 3h | 🟢 Faible (interne) | 🟡 Moyenne |

---

## 🚀 Recommandation pour la prochaine session

**Ordre suggéré** :
1. **Phase 1** (nettoyage) — rapide, libère du contexte mental
2. **Phase 2a** (validation dans le navigateur) — s'assurer que tout fonctionne réellement
3. **Phase 2b** (GTFS-RT alertes) — impact visible immédiat pour l'utilisateur
4. **Phase 4** (PWA fix + offline) — facile et gratifiant

**Contexte à rappeler** :
- GTFS IDFM complet chargé : 53 989 arrêts, 2 011 routes, 8.2M stop_times
- Docker volume `gtfs_data` persisté → rebuild rapide
- Node heap 3.5 GB → parsing stable
- Geocoding retourne Paris uniquement (postcode 75xxx)
- Endpoint `/api/transport/gtfs-stops/search` pour recherche d'arrêts par nom
- Endpoint `/api/transport/nearby` pour arrêts proches par GPS

---

*Plan généré par Claude — T6 UrbanFlow Mobility*