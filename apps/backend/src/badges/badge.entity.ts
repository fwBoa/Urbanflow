import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Badge débloqué par un utilisateur.
 * Les achievements sont persistants indépendamment de l'historique des trajets.
 *
 * ⚠️ Mapping snake_case explicite : la table prod a été créée avec
 * `user_id`/`badge_key` (Bloc 75). Sans `name`, TypeORM génère `userId`
 * camelCase et toutes les requêtes échouent en prod
 * (« column BadgeUnlock.userId does not exist ») — silencieusement, à
 * cause des try/catch du service.
 */
@Entity('badge_unlocks')
@Unique(['userId', 'badgeKey'])
export class BadgeUnlock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Mapping explicite obligatoire : la table prod (créée par migration)
   * utilise les noms snake_case. Sans `name:`, TypeORM génère du camelCase
   * et toutes les requêtes échouent en prod
   * (« column BadgeUnlock.userId does not exist »).
   */
  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId!: string;

  @Column({ name: 'badge_key', type: 'varchar', length: 64 })
  badgeKey!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  /**
   * Célébration vue par l'utilisateur (bannière animée du profil affichée).
   * Marqué par GET /badges?celebrate=true — source de vérité serveur pour
   * la détection des « nouveaux » badges (le localStorage était fragile :
   * un rechargement de page marquait vu sans que l'utilisateur voie rien).
   */
  @Column({ name: 'seen_at', type: 'timestamp', nullable: true })
  seenAt?: Date | null;

  @CreateDateColumn({ name: 'unlocked_at' })
  unlockedAt!: Date;
}
