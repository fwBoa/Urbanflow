/**
 * Script de création du premier utilisateur admin
 *
 * Usage : npx ts-node scripts/seed-admin.ts
 *
 * Crée un utilisateur avec rôle 'admin' si aucun admin n'existe déjà.
 */

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

async function seedAdmin() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL || 'postgresql://urbanflow:urbanflow_dev@localhost:5432/urbanflow',
    entities: [__dirname + '/../apps/backend/src/**/*.entity{.ts,.js}'],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Connecté à la base de données');

    const userRepo = dataSource.getRepository('users');

    // Check if admin already exists
    const existingAdmin = await userRepo.findOne({ where: { role: 'admin' } });
    if (existingAdmin) {
      console.log('⚠️ Un utilisateur admin existe déjà :', existingAdmin.email);
      return;
    }

    // Create admin user
    const passwordHash = await bcrypt.hash('admin123', 12);

    await userRepo.insert({
      email: 'admin@urbanflow.app',
      passwordHash,
      displayName: 'Administrateur',
      role: 'admin',
      avatar: '👤',
      preferredMode: 'rapide',
      accessibilityNeeds: false,
      consentGeoloc: true,
      consentCookies: true,
      consentHistory: true,
      consentDate: new Date(),
      consentVersion: '1.0',
      notificationsEnabled: true,
    });

    console.log('✅ Utilisateur admin créé avec succès !');
    console.log('   Email: admin@urbanflow.app');
    console.log('   Mot de passe: admin123');
    console.log('');
    console.log('⚠️  Changez le mot de passe immédiatement en production !');

  } catch (error) {
    console.error('❌ Erreur lors de la création de l\'admin :', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin();
