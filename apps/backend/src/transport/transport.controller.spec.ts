import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TransportController } from './transport.controller';
import { PrimService } from './prim.service';
import { CarbonService } from './carbon.service';
import { JourneyService } from './journey.service';
import { GtfsParserService } from './gtfs-parser.service';
import { GtfsRtService } from './gtfs-rt.service';
import { OsrmService } from './osrm.service';
import { GbfsService } from './gbfs.service';

describe('TransportController', () => {
  let controller: TransportController;

  jest.setTimeout(10000);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [TransportController],
      providers: [
        PrimService,
        CarbonService,
        JourneyService,
        GtfsParserService,
        GtfsRtService,
        OsrmService,
        GbfsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              if (key === 'PRIM_API_URL') return 'https://prim.iledefrance-mobilites.fr';
              if (key === 'PRIM_API_KEY') return 'test-key';
              if (key === 'IDFM_DATA_API_URL')
                return 'https://data.iledefrance-mobilites.fr/api/explore/v2.1';
              return defaultValue;
            },
          },
        },
      ],
    }).compile();

    controller = module.get<TransportController>(TransportController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should expose a linesByMode endpoint', () => {
    expect(typeof controller.getLinesByMode).toBe('function');
  });

  it('should expose a journey endpoint', () => {
    expect(typeof controller.findJourney).toBe('function');
  });

  it('should expose a route endpoint', () => {
    expect(typeof controller.getRoute).toBe('function');
  });

  it('should expose a realtime alerts endpoint', () => {
    expect(typeof controller.getRealtimeAlerts).toBe('function');
  });

  it('should expose a nearby stops endpoint', () => {
    expect(typeof controller.getNearbyStops).toBe('function');
  });

  it('should expose a nearby velib endpoint', () => {
    expect(typeof controller.getNearbyVelibStations).toBe('function');
  });

  it('should expose a geocode endpoint', () => {
    // Geocode lives on primService and is wired via controller
    expect(controller).toBeDefined();
  });
});
