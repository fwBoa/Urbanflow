import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartureTimeToFavorites1721304000000
  implements MigrationInterface
{
  name = 'AddDepartureTimeToFavorites1721304000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favorites" ADD COLUMN IF NOT EXISTS "departure_time" TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favorites" DROP COLUMN IF EXISTS "departure_time"`,
    );
  }
}
