import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';

/**
 * Notification — alertes et messages utilisateur
 * Diagramme cas d'utilisation §4.1, architecture §5.2 Dossier Technique
 */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 50 })
  type: 'disruption' | 'delay' | 'info' | 'favorite_alert' | 'system';

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'related_line', type: 'varchar', length: 100, nullable: true })
  relatedLine: string | null;

  @Column({ name: 'related_stop', type: 'varchar', length: 100, nullable: true })
  relatedStop: string | null;

  @Column({ name: 'action_url', type: 'varchar', length: 500, nullable: true })
  actionUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}