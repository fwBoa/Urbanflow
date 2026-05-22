import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';

/**
 * Historique — trajet effectué par l'utilisateur
 * Diagramme classes §4.2 Dossier Technique
 */
@Entity('history')
export class History {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  from: string;

  @Column()
  to: string;

  @Column()
  mode: string;

  @Column({ name: 'mode_color' })
  modeColor: string;

  @Column()
  duration: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  co2: number;

  @Column({ name: 'trip_date', type: 'timestamp' })
  tripDate: Date;
}