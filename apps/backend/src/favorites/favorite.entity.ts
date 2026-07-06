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
 * Favori — trajet sauvegardé par l'utilisateur
 * Diagramme classes §4.2 Dossier Technique
 */
@Entity('favorites')
export class Favorite {
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

  @Column({
    name: 'origin_lat',
    type: 'decimal',
    precision: 9,
    scale: 6,
    nullable: true,
  })
  originLat: number | null;

  @Column({
    name: 'origin_lon',
    type: 'decimal',
    precision: 9,
    scale: 6,
    nullable: true,
  })
  originLon: number | null;

  @Column({
    name: 'dest_lat',
    type: 'decimal',
    precision: 9,
    scale: 6,
    nullable: true,
  })
  destLat: number | null;

  @Column({
    name: 'dest_lon',
    type: 'decimal',
    precision: 9,
    scale: 6,
    nullable: true,
  })
  destLon: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
