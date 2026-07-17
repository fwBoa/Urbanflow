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
 */
@Entity('badge_unlocks')
@Unique(['userId', 'badgeKey'])
export class BadgeUnlock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  userId!: string;

  @Column({ type: 'varchar', length: 64, name: 'badge_key' })
  badgeKey!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  unlockedAt!: Date;
}
