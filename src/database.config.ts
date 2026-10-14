import * as dotenv from 'dotenv';
import { DataSourceOptions } from 'typeorm';

// Load .env manually — before anything else reads process.env
// This guarantees credentials are available when TypeORM initialises
dotenv.config();

export const typeOrmConfig: DataSourceOptions = {
  type: 'postgres',
  host:     process.env.POSTGRES_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGRES_PORT || '5432', 10),
  username: process.env.POSTGRES_USER     || 'postgres',
  password: String(process.env.POSTGRES_PASSWORD ?? ''),
  database: process.env.POSTGRES_DATABASE || 'postgres',
  ssl: process.env.POSTGRES_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
  entities: [],
  synchronize: false,
  migrationsRun: false,
  extra: {
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  },
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
};