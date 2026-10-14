/**
 * APP MODULE — the root of the NestJS application.
 * This is the file that wires everything together.
 *
 * What it does:
 *  1. Loads .env file (ConfigModule)
 *  2. Connects to PostgreSQL (TypeOrmModule)
 *  3. Registers the TruthMapModule (our routes)
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './database.config';
import { TruthMapModule } from './truth-map/truth-map.module';

@Module({
  imports: [
    // Step 1 — load .env variables into process.env
    ConfigModule.forRoot({
      isGlobal: true,   // available everywhere without re-importing
      envFilePath: '.env',
    }),

    // Step 2 — connect to PostgreSQL using credentials from .env
    TypeOrmModule.forRoot(typeOrmConfig),

    // Step 3 — register our Truth Map routes
    TruthMapModule,
  ],
})
export class AppModule {}
