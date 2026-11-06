import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration inicial (baseline).
 *
 * Foi gerada a partir das entidades (migration:generate em banco vazio) e
 * ajustada para ser idempotente: o banco calendar_app já tinha a tabela
 * `eventos` criada via synchronize. Com IF NOT EXISTS / DO blocos, a
 * migration pode ser executada tanto em banco existente (no-op) quanto em
 * banco novo (cria o schema completo) sem perda de dados.
 */
export class InitialSchema1793979726572 implements MigrationInterface {
    name = 'InitialSchema1793979726572'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."eventos_frequencia_enum" AS ENUM('DIARIA', 'SEMANAL', 'MENSAL', 'ANUAL');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "eventos" ("id" SERIAL NOT NULL, "titulo" character varying(150) NOT NULL, "descricao" text, "data_inicio" TIMESTAMP NOT NULL, "data_fim" TIMESTAMP NOT NULL, "dia_inteiro" boolean NOT NULL DEFAULT false, "usuario_id" character varying(255), "criado_em" TIMESTAMP NOT NULL DEFAULT now(), "frequencia" "public"."eventos_frequencia_enum", "data_fim_recorrencia" TIMESTAMP, "tipo" character varying NOT NULL, CONSTRAINT "PK_40d4a3c6a4bfd24280cb97a509e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_eventos_usuario_mes" ON "eventos"  ("usuario_id", "data_inicio") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_eventos_data_inicio" ON "eventos"  ("data_inicio") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_04c8daea24f54161eb8777ebf1" ON "eventos"  ("tipo") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_04c8daea24f54161eb8777ebf1"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_eventos_data_inicio"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_eventos_usuario_mes"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "eventos"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."eventos_frequencia_enum"`);
    }

}
