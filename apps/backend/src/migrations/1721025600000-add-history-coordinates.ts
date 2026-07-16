import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHistoryCoordinates1721025600000 implements MigrationInterface {
  name = 'AddHistoryCoordinates1721025600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE history
        ADD COLUMN IF NOT EXISTS origin_lat DECIMAL(9, 6) NULL,
        ADD COLUMN IF NOT EXISTS origin_lon DECIMAL(9, 6) NULL,
        ADD COLUMN IF NOT EXISTS dest_lat DECIMAL(9, 6) NULL,
        ADD COLUMN IF NOT EXISTS dest_lon DECIMAL(9, 6) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE history
        DROP COLUMN IF EXISTS origin_lat,
        DROP COLUMN IF EXISTS origin_lon,
        DROP COLUMN IF EXISTS dest_lat,
        DROP COLUMN IF EXISTS dest_lon;
    `);
  }
}
