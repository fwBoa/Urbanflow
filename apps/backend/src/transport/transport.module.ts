import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { TransportController } from './transport.controller';
import { PrimService } from './prim.service';
import { GtfsParserService } from './gtfs-parser.service';
import { JourneyService } from './journey.service';
import { CarbonService } from './carbon.service';

import { OsrmService } from './osrm.service';
import { GtfsRtService } from './gtfs-rt.service';
import { GtfsDbService } from './gtfs-db.service';
import { NavitiaService } from './navitia.service';

/**
 * Module Transport — Intégration PRIM (Île-de-France Mobilités)
 *
 * Architecture hybride :
 * - NavitiaService : PRIMAIRE — itinéraires + alertes temps réel (PRIM Navitia v2)
 * - JourneyService : REPLI hors-ligne — RAPTOR sur GTFS chargé en PostgreSQL
 * - PrimService : Référentiels (lignes), Vélib, géocoding (IDFM Data API keyless)
 * - GtfsParserService / GtfsDbService : Chargement + lectures GTFS (filet offline)
 * - CarbonService : Empreinte carbone (facteurs ADEME)
 * - OsrmService : Routing marche/vélo via OSRM
 * - GtfsRtService : Conservé pour rétro-compat (supplanté par NavitiaService pour les alertes)
 */
@Module({
  imports: [HttpModule, ScheduleModule.forRoot()],
  controllers: [TransportController],
  providers: [
    PrimService,
    GtfsParserService,
    JourneyService,
    CarbonService,
    OsrmService,
    GtfsRtService,
    GtfsDbService,
    NavitiaService,
  ],
  exports: [
    HttpModule,
    PrimService,
    GtfsParserService,
    JourneyService,
    CarbonService,
    OsrmService,
    GtfsRtService,
    GtfsDbService,
    NavitiaService,
  ],
})
export class TransportModule {}
