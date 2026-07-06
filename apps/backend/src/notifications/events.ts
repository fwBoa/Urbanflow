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
