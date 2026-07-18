# Plan : indicateur d'état temps réel sur la page Lignes

## Objectif
Permettre à l'utilisateur de savoir, pour chaque ligne, si elle est perturbée en temps réel, et afficher le détail de l'alerte le cas échéant.

## Fichiers concernés
- `apps/frontend/src/app/lines/page.tsx`
- `apps/frontend/src/lib/alerts.ts` (utilisation existante, pas de modification)

## Implémentation

### 1. Récupération des alertes
Les alertes temps réel sont déjà chargées via `useRealtimeAlerts()` dans `LinesPage`. Aucune modification backend n'est nécessaire (endpoint `/api/transport/alerts` déjà disponible).

### 2. Matching alertes ↔ lignes
Utiliser la fonction existante `alertMatchesLine(alert, lineName, lineMode?, lineId?)` dans `apps/frontend/src/lib/alerts.ts`.

Pour chaque ligne on détermine :
- `lineName` : `fav.mode`, `networkLine?.name`, `line.shortName`
- `lineMode` : mode associé (métro, rer, tram, transilien)
- `lineId` : `fav.lineId` ou `networkLine?.id` si disponible

### 3. Composants UI

#### FavoriteLineCard
- Ajouter une section qui affiche les alertes associées à la ligne.
- Si aucune alerte : conserver l'indicateur actuel "Trafic normal".
- Si alertes : badge coloré selon la sévérité la plus élevée (`severe` = rouge, `warning` = orange, `info` = bleu).
- Afficher le titre de l'alerte (`headerText`) et, si disponible, la description (`descriptionText`).
- Optionnel : plier/déplier la description pour alléger l'affichage.

#### LineBadge (vue Explorer)
- Ajouter un petit point indicateur de couleur à côté du nom de ligne si une alerte est active.
- Au clic, optionnel : tooltip ou expansion montrant le titre de l'alerte.

### 4. Tri (optionnel mais recommandé)
Dans la vue Explorer, trier les lignes pour afficher en premier celles qui ont une alerte, afin que l'utilisateur les voie immédiatement.

### 5. Tests et validation
- `npm run lint` dans `apps/frontend`
- `npm run build` dans `apps/frontend`
- Vérifier visuellement que les lignes perturbées apparaissent avec le détail.

## Durée estimée
2 à 3 heures (backend inchangé, uniquement frontend).

---

# Autres fonctionnalités partielles / à finaliser

Liste non exhaustive des fonctionnalités UI déjà présentes mais mal ou pas branchées.
Le choix de l’heure d’itinéraire **n’est pas inclus volontairement** : trop complexe à court terme car il faut valider la disponibilité réelle des modes à l’heure demandée.

## 1. Vélib’ proches et mode Vélib’

| Problème | Fichier | État | Correctif |
|---|---|---|---|
| Bouton “Vélib’ proches” ouvre `/search?mode=velib` au lieu d’une carte de stations | `apps/frontend/src/app/page.tsx:92` | Partiel / trompeur | Créer une vue cartographique dédiée ou rediriger vers l’explorateur de stations |
| Paramètre `mode=velib` non transformé en mode sélectionné | `apps/frontend/src/app/search/page.tsx:60` | Partiel | Initialiser `selectedModes` avec `["velib"]` quand l’URL le demande |
| Tracé OSRM toujours en profil `foot`, même en Vélib’ | `apps/frontend/src/app/search/page.tsx:230` | Cassé | Utiliser le profil `bike` quand le trajet contient un segment Vélib’ |
| Recalcul de trajet ignore le mode Vélib’ | `apps/frontend/src/app/trip/[id]/page.tsx` | Cassé | Conserver et réinjecter le mode d’origine dans `DEFAULT_TRANSIT_MODES` |
| Endpoint Vélib’ limité à Paris intra-muros | `apps/backend/src/transport/prim.service.ts:323` | Partiel | Ajouter le fallback JCDecaux / IDFM pour la petite couronne |
| Fallback hors périmètre génère un segment Vélib’ sans données | `apps/backend/src/transport/journey.service.ts` | Placeholder | Récupérer de vraies stations et disponibilités dans le fallback |

## 2. Carte et trajet

| Problème | Fichier | État | Correctif |
|---|---|---|---|
| Bouton “Partager” sans action | `apps/frontend/src/app/trip/[id]/page.tsx:941` | Placeholder | Implémenter `navigator.share` ou copier le lien |
| Bouton “Localiser ma position” sur la carte trajet ne fait rien | `apps/frontend/src/app/trip/[id]/page.tsx:1389` | No-op | Brancher `onLocateUser` sur la géolocalisation + centrage carte |

## 3. Accessibilité / PMR

| Problème | Fichier | État | Correctif |
|---|---|---|---|
| Préférence stockée mais ne filtre pas les trajets | `apps/backend/src/transport/journey.service.ts:27` | Partiel | Utiliser `wheelchairAccessible` dans RAPTOR/fallback et forwarder à Navitia |
| Frontend n’envoie pas le flag | `apps/frontend/src/services/api.ts:318`, `useJourney` | Non branché | Propager `accessibilityNeeds` dans `searchJourney` / `useJourney` |

## 4. Notifications push

| Problème | Fichier | État | Correctif |
|---|---|---|---|
| Push alertes temps réel branché sur GTFS-RT désactivé | `apps/backend/src/notifications/notifications-events.listener.ts:23` | Cassé en pratique | Émettre l’événement `alerts.updated` depuis le service Navitia des alertes |
| Rappel avant départ approximatif | `apps/backend/src/notifications/notifications-scheduler.service.ts:35` | Approximatif | Stocker l’heure de départ réelle dans le favori pour caler le rappel |

## 5. Favoris et badges

| Problème | Fichier | État | Correctif |
|---|---|---|---|
| Favori ligne absent sur trajets fallback GTFS | `apps/frontend/src/app/trip/[id]/page.tsx` | Partiel | Renseigner `lineId` dans les segments reconstruits par `gtfs.service.ts` |
| Badges en anonyme : liste statique verrouillée | `apps/frontend/src/services/favorites.ts:401` | Placeholder | Calculer les badges localement ou masquer l’onglet pour les invités |

## Ordre de priorité suggéré

1. Vélib’ proches / mode Vélib’ (impact utilisateur fort, visible sur la home)
2. Carte trajet : partage + localisation (petites corrections UX)
3. Indicateur temps réel sur la page Lignes (plan principal ci-dessus)
4. Accessibilité PMR (chantier backend + frontend)
5. Notifications push alertes temps réel (backend only)
