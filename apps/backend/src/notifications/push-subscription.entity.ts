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
 * PushSubscription — souscription Web Push (VAPID) d'un utilisateur.
 * Une ligne par appareil/navigateur. L'endpoint est unique au monde.
 */
@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** URL fournie par le navigateur ; identifie de façon unique une souscription. */
  @Column({ type: 'text', unique: true })
  endpoint: string;

  /** Clé publique du client (base64). */
  @Column({ name: 'p256dh', type: 'text' })
  p256dh: string;

  /** Secret partagé (base64). */
  @Column({ name: 'auth', type: 'text' })
  auth: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
