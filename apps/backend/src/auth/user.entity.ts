import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ name: 'display_name', nullable: true })
  displayName: string;

  @Column({ name: 'preferred_mode', default: 'rapide' })
  preferredMode: string;

  @Column({ name: 'accessibility_needs', default: false })
  accessibilityNeeds: boolean;

  @Column({ name: 'avatar', nullable: true, default: '🚇' })
  avatar: string;

  // ─── User role (admin/user) ───
  @Column({ name: 'role', default: 'user' })
  role: string;

  // ─── RGPD consent fields (§9.2 Dossier Technique) ───
  @Column({ name: 'consent_geoloc', default: false })
  consentGeoloc: boolean;

  @Column({ name: 'consent_cookies', default: false })
  consentCookies: boolean;

  @Column({ name: 'consent_history', default: false })
  consentHistory: boolean;

  @Column({ name: 'consent_date', type: 'timestamp', nullable: true })
  consentDate: Date | null;

  @Column({ name: 'consent_version', nullable: true })
  consentVersion: string;

  // ─── Notification preferences ───
  @Column({ name: 'notifications_enabled', default: true })
  notificationsEnabled: boolean;

  // ─── Last login tracking ───
  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  // ─── Soft delete (droit à l'effacement RGPD Art. 17) ───
  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}