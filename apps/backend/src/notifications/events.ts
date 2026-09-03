/**
 * Événements métier du domaine notification.
 *
 * Ils sont émis par les services transport/admin et consommés par
 * `NotificationsEventsListener` pour créer des notifications in-app et
 * déclencher des push web de manière asynchrone et découplée.
 */

export interface AlertInfo {
  id: string;
  headerText: string;
  descriptionText?: string;
  severity: 'info' | 'warning' | 'severe' | 'unknown';
  affectedRoutes: string[];
  /**
   * C6 : lignes impactées structurées (vraies lignes, arrêts exclus) —
   * utilisées par le listener pour titrer le push avec la ligne concernée.
   */
  affectedLines?: Array<{
    name: string;
    mode: 'metro' | 'rer' | 'tram' | 'bus' | 'transilien' | 'autre';
    code: string;
    color?: string;
    lineId?: string;
  }>;
  /** Identifiant technique de la ligne affectée, quand disponible. */
  lineId?: string;
  activePeriod: { start: string; end: string }[];
}

/** Émis lorsque le GTFS-RT watcher détecte de nouvelles alertes temps réel. */
export class AlertsUpdatedEvent {
  constructor(public readonly alerts: readonly AlertInfo[]) {}
}

/** Émis par l'admin pour diffuser une notification à tous les utilisateurs. */
export class BroadcastNotificationEvent {
  constructor(
    public readonly title: string,
    public readonly message: string,
    public readonly type:
      | 'disruption'
      | 'delay'
      | 'info'
      | 'favorite_alert'
      | 'system' = 'info',
    public readonly lineId?: string,
  ) {}
}

/** Rappel avant départ d’un trajet favori. */
export class DepartureReminderEvent {
  constructor(
    public readonly userId: string,
    public readonly journeyId: string,
    public readonly lineName: string,
    public readonly from: string,
    public readonly to: string,
    public readonly departureTime: string,
  ) {}
}

/** Retard ou perturbation sur un trajet favori du jour. */
export class JourneyDisruptionEvent {
  constructor(
    public readonly userId: string,
    public readonly journeyId: string,
    public readonly lineName: string,
    public readonly from: string,
    public readonly to: string,
    public readonly delayMinutes: number,
    public readonly message: string,
  ) {}
}

/** Récap hebdomadaire personnalisé. */
export class WeeklyDigestEvent {
  constructor(public readonly userId: string) {}
}

/** Émis lorsque l'historique d'un utilisateur est modifié (ajout ou vidage). */
export class HistoryUpdatedEvent {
  constructor(public readonly userId: string) {}
}

/** Émis quand un favori est ajouté ou supprimé. */
export class FavoritesUpdatedEvent {
  constructor(public readonly userId: string) {}
}

/** Badge débloqué par un utilisateur — porte les données d'affichage du push. */
export class BadgeUnlockedEvent {
  constructor(
    public readonly userId: string,
    /** Clé technique du badge (ex. 'first_trip'). */
    public readonly badgeKey: string,
    /** Libellé affichable (ex. « Premier trajet »). */
    public readonly label: string,
    /** Emoji du badge (ex. « 🎉 »). */
    public readonly emoji: string,
  ) {}
}
