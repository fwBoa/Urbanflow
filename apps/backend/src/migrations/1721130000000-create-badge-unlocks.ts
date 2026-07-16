import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBadgeUnlocks1721130000000 implements MigrationInterface {
  name = 'CreateBadgeUnlocks1721130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS badge_unlocks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        badge_key VARCHAR(64) NOT NULL,
        metadata JSONB NULL,
        unlocked_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT uq_badge_unlock_user_key UNIQUE (user_id, badge_key)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_badge_unlocks_user_id
      ON badge_unlocks(user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS badge_unlocks;`);
  }
}
