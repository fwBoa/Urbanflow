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
