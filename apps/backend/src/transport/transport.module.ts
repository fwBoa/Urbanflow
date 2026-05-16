import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TransportController } from './transport.controller';
import { PrimService } from './prim.service';
import { GtfsParserService } from './gtfs-parser.service';
import { JourneyService } from './journey.service';
import { CarbonService } from './carbon.service';

import { OsrmService } from './osrm.service';

/**
 * Module Transport — Intégration PRIM (Île-de-France Mobilités)
 *
 * Services :
 * - PrimService : Appels API PRIM (référentiels, temps réel, GTFS)
 * - GtfsParserService : Parsing des fichiers GTFS statiques
 * - JourneyService : Calcul d'itinéraires (algorithme RAPTOR-like)
 * - CarbonService : Calcul empreinte carbone (facteurs ADEME)
 * - OsrmService : Routing réel via OpenStreetMap (OSRM)
 */
@Module({
  imports: [HttpModule],
  controllers: [TransportController],
  providers: [PrimService, GtfsParserService, JourneyService, CarbonService, OsrmService],
  exports: [PrimService, GtfsParserService, JourneyService, CarbonService, OsrmService],
})
export class TransportModule {}