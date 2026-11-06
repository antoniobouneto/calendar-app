import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Item 5 (modelagem): faixa de reserva tstzrange + índice GiST.
 * - `horario` é gerada como [data_inicio, data_fim) e otimiza
 *   consultas de sobreposição (&&) quando o volume crescer.
 * - A antiga lista de índices B-Tree (data_inicio/data_fim) continua
 *   servindo à grade 00-23h; o GiST é complementar, não substituto
 *   das consultas por dia/mês.
 */
export class TstzRangeEvento1793980000000 implements MigrationInterface {
  name = 'TstzRangeEvento1793980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    // tsrange (sem fuso) em vez de tstzrange: tstzrange depende do
    // TimeZone da sessão e o Postgres proíbe coluna gerada não-imutável
    // (erro 42P17). Como data_inicio/data_fim são TIMESTAMP (sem TZ),
    // esta faixa ainda acelera && (sobreposição).
    await queryRunner.query(`
      ALTER TABLE "eventos"
      ADD COLUMN IF NOT EXISTS "horario" tsrange
      GENERATED ALWAYS AS (tsrange("data_inicio", "data_fim", '[)')) STORED
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_eventos_horario_gist"
      ON "eventos" USING GIST ("horario")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_eventos_horario_gist"`);
    await queryRunner.query(`ALTER TABLE "eventos" DROP COLUMN IF EXISTS "horario"`);
  }
}
