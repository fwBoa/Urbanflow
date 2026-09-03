import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Itération badges : colonne seen_at pour la célébration serveur.
 * Le GET /badges?celebrate=true marque les badges débloqués comme vus —
 * source de vérité serveur remplaçant l'ancien marqueur localStorage.
 */
export class AddSeenAtToBadgeUnlocks1725528000000 implements MigrationInterface {
  name = 'AddSeenAtToBadgeUnlocks1725528000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE badge_unlocks
      ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE badge_unlocks DROP COLUMN IF EXISTS seen_at;
    `);
  }
}
