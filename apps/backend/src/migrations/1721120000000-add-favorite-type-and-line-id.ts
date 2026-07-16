import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFavoriteTypeAndLineId1721120000000 implements MigrationInterface {
  name = 'AddFavoriteTypeAndLineId1721120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE favorites
        ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'journey',
        ADD COLUMN IF NOT EXISTS line_id VARCHAR(255) NULL,
        ALTER COLUMN from DROP NOT NULL,
        ALTER COLUMN to DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE favorites
        DROP COLUMN IF EXISTS type,
        DROP COLUMN IF EXISTS line_id,
        ALTER COLUMN from SET NOT NULL,
        ALTER COLUMN to SET NOT NULL;
    `);
  }
}
