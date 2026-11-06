import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { EventoEntity } from '../events/entities/evento.entity';
import { EventoPontualEntity } from '../events/entities/evento-pontual.entity';
import { EventoRecorrenteEntity } from '../events/entities/evento-recorrente.entity';

// Carrega backend/.env para o CLI do TypeORM (o Nest usa ConfigModule).
// dotenv não sobrescreve variáveis já definidas no shell,
// permitindo override via DB_DATABASE=... na linha de comando.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || '5434'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'calendar_app',
  logging: process.env.TYPEORM_LOGGING === 'true',
  entities: [EventoEntity, EventoPontualEntity, EventoRecorrenteEntity],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  migrationsTableName: 'migrations',
};

export default new DataSource(dataSourceOptions);
