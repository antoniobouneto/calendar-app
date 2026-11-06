import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventoEntity } from '../events/entities/evento.entity';
import { EventoPontualEntity } from '../events/entities/evento-pontual.entity';
import { EventoRecorrenteEntity } from '../events/entities/evento-recorrente.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '5434')),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_DATABASE', 'calendar_app'),
        // PRODUÇÃO: schema controlado por migrations (sem synchronize).
        // synchronize só em emergência via DB_SYNCHRONIZE=true.
        synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
        // Roda migrations pendentes automaticamente na subida.
        // Em ambientes onde se executa migration:run separado, usar DB_MIGRATIONS_RUN=false.
        migrationsRun: config.get<string>('DB_MIGRATIONS_RUN', 'true') !== 'false',
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsTableName: 'migrations',
        logging: config.get<string>('TYPEORM_LOGGING') === 'true',
        entities: [EventoEntity, EventoPontualEntity, EventoRecorrenteEntity],
      }),
    }),
  ],
})
export class DatabaseModule {}
