/**
 * TRUTH MAP MODULE
 * Registers the controller (routes) and service (database queries).
 */
import { Module } from '@nestjs/common';
import { TruthMapController } from './truth-map.controller';
import { TruthMapService } from './truth-map.service';

@Module({
  controllers: [TruthMapController],
  providers:   [TruthMapService],
  exports:     [TruthMapService],
})
export class TruthMapModule {}
