import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Remodelação para grade horária (múltiplos eventos no mesmo dia):
 * - garante CHECK data_fim >= data_inicio (intervalo de horário válido)
 * - cria índices de intervalo para consulta por dia (aba "Eventos do Dia",
 *   grade 00–23h) e para detecção de sobreposição
 * - normaliza eventos dia_inteiro para 00:00:00 → 23:59:59 do mesmo dia
 *
 * Idempotente: pode rodar em banco já populado sem perder dados.
 */
export class RemodelEventosHorarios1793979730000 implements MigrationInterface {
  name = 'RemodelEventosHorarios1793979730000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. CHECK de integridade: horário de fim nunca antes do início.
    //    (TableInheritance usa CHECK por nome; TypeORM nomeia como
    //     CHK_* — garantimos o nome lógico via DO bloco.)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_eventos_data_fim_maior_que_inicio'
        ) THEN
          ALTER TABLE "eventos"
            ADD CONSTRAINT "chk_eventos_data_fim_maior_que_inicio"
            CHECK ("data_fim" >= "data_inicio");
        END IF;
      END $$;
    `);

    // 2. Índices para a grade horária.
    //    - data_fim permite buscar eventos que "atravessam" a hora atual
    //    - (usuario_id, data_inicio, data_fim) acelera o filtro do dia
    //      e a ordenação 00→23h no frontend.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_eventos_data_fim"
      ON "eventos" ("data_fim")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_eventos_usuario_dia"
      ON "eventos" ("usuario_id", "data_inicio", "data_fim")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_eventos_intervalo"
      ON "eventos" ("data_inicio", "data_fim")
    `);

    // 3. Normalização: eventos dia_inteiro ocupam o dia todo 00:00 → 23:59:59.
    //    Se um evento dia_inteiro tinha data_fim inválida (< data_inicio)
    //    ou menor que o dia todo, ajustamos para o fim do dia.
    await queryRunner.query(`
      UPDATE "eventos"
      SET "data_inicio" = DATE_TRUNC('day', "data_inicio"),
          "data_fim" = DATE_TRUNC('day', "data_inicio") + INTERVAL '23 hours 59 minutes 59 seconds'
      WHERE "dia_inteiro" = true
        AND "data_fim" < "data_inicio"
    `);

    // 4. Garante que eventos não-dia-inteiro com data_fim <= data_inicio
    //    tenham duração mínima de 1 hora (reparo de seeds legadas).
    await queryRunner.query(`
      UPDATE "eventos"
      SET "data_fim" = "data_inicio" + INTERVAL '1 hour'
      WHERE "dia_inteiro" = false
        AND "data_fim" <= "data_inicio"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_eventos_intervalo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_eventos_usuario_dia"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_eventos_data_fim"`);
    await queryRunner.query(`
      ALTER TABLE "eventos"
      DROP CONSTRAINT IF EXISTS "chk_eventos_data_fim_maior_que_inicio"
    `);
  }
}
