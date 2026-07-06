import { Test, TestingModule } from '@nestjs/testing';
import { JourneyService, JourneyQuery } from './journey.service';
import { GtfsParserService } from './gtfs-parser.service';
import { CarbonService } from './carbon.service';
import { PrimService } from './prim.service';

jest.setTimeout(10000);

describe('JourneyService', () => {
  let service: JourneyService;
  let gtfsParser: GtfsParserService;

  const parisOrigin = { lat: 48.8566, lon: 2.3522 };
  const parisDest = { lat: 48.8589, lon: 2.347 };

  const originStop = {
    stop_id: 'stop-origin',
    stop_name: 'Origin Stop',
    stop_lat: 48.8566,
    stop_lon: 2.3522,
    location_type: 0,
  };

  const destStop = {
    stop_id: 'stop-dest',
    stop_name: 'Dest Stop',
    stop_lat: 48.8589,
    stop_lon: 2.347,
    location_type: 0,
  };

  const mockRoute = {
    route_id: 'route-1',
    route_short_name: 'M1',
    route_long_name: 'Métro 1',
    route_type: 1,
    route_color: '007852',
  };

  const mockTrip = {
    trip_id: 'trip-1',
    route_id: 'route-1',
    service_id: 'service-1',
    trip_headsign: 'La Défense',
  };

  const mockStopTime = {
    trip_id: 'trip-1',
    stop_id: 'stop-origin',
    arrival_time: '10:00:00',
    departure_time: '10:01:00',
    stop_sequence: 1,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JourneyService,
        {
          provide: GtfsParserService,
          useValue: {
            isLoaded: jest.fn().mockResolvedValue(false),
            getActiveServiceIds: jest
              .fn()
              .mockResolvedValue(new Set(['service-1'])),
            findStopsNearby: jest.fn().mockResolvedValue([]),
            getNextDeparturesBatch: jest.fn().mockResolvedValue(new Map()),
            getTripStopTimesBatch: jest.fn().mockResolvedValue(new Map()),
            getTransfersFromBatch: jest.fn().mockResolvedValue(new Map()),
            getRoutesForStop: jest.fn().mockResolvedValue([mockRoute]),
            getStopCoordsByIds: jest.fn().mockResolvedValue(
              new Map([
                ['stop-origin', { lat: 48.8566, lon: 2.3522 }],
                ['stop-dest', { lat: 48.8589, lon: 2.347 }],
              ]),
            ),
          },
        },
        {
          provide: CarbonService,
          useValue: {
            calculateEmissions: jest.fn().mockReturnValue({
              emissionsGco2: 10,
              mode: 'metro',
              distanceKm: 1,
              factor: 3.8,
              source: 'ADEME',
            }),
            calculateFromGtfsRouteType: jest.fn().mockReturnValue({
              emissionsGco2: 10,
              mode: 'metro',
              distanceKm: 1,
              factor: 3.8,
              source: 'ADEME',
            }),
          },
        },
        {
          provide: PrimService,
          useValue: {
            getNearbyVelibStations: jest
              .fn()
              .mockResolvedValue({ stations: [], total: 0 }),
          },
        },
      ],
    }).compile();

    service = module.get<JourneyService>(JourneyService);
    gtfsParser = module.get<GtfsParserService>(GtfsParserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findJourney', () => {
    it('returns cache hit without recomputing', async () => {
      const query: JourneyQuery = {
        origin: parisOrigin,
        destination: parisDest,
        departureTime: '2026-07-06T10:00:00',
      };
      const first = await service.findJourney(query);
      const second = await service.findJourney(query);
      expect(Array.isArray(first)).toBe(true);
      expect(second).toEqual(first);
      expect(gtfsParser.findStopsNearby).toHaveBeenCalledTimes(4);
    });

    it('returns empty array for requests outside Paris region', async () => {
      const query: JourneyQuery = {
        origin: { lat: 40.7128, lon: -74.006 },
        destination: { lat: 40.758, lon: -73.9855 },
      };
      const result = await service.findJourney(query);
      expect(result).toEqual([]);
      expect(gtfsParser.findStopsNearby).not.toHaveBeenCalled();
    });

    it('includes non-transit alternatives when GTFS is not loaded', async () => {
      jest.spyOn(gtfsParser, 'isLoaded').mockResolvedValue(false);
      jest.spyOn(gtfsParser, 'findStopsNearby').mockResolvedValue([]);

      const query: JourneyQuery = {
        origin: parisOrigin,
        destination: parisDest,
      };
      const result = await service.findJourney(query);
      expect(result.length).toBeGreaterThan(0);
      const walking = result.find((j) =>
        j.segments.every((s) => s.type === 'walking'),
      );
      expect(walking).toBeDefined();
    });

    it('uses RAPTOR results when GTFS is loaded and stops are nearby', async () => {
      jest.spyOn(gtfsParser, 'isLoaded').mockResolvedValue(true);
      jest
        .spyOn(gtfsParser, 'findStopsNearby')
        .mockResolvedValueOnce([originStop])
        .mockResolvedValueOnce([destStop]);

      jest.spyOn(gtfsParser, 'getNextDeparturesBatch').mockResolvedValue(
        new Map([
          [
            'stop-origin',
            [
              {
                trip: mockTrip,
                route: mockRoute,
                stopTime: mockStopTime,
              },
            ],
          ],
        ]),
      );

      jest.spyOn(gtfsParser, 'getTripStopTimesBatch').mockResolvedValue(
        new Map([
          [
            'trip-1',
            [
              mockStopTime,
              {
                trip_id: 'trip-1',
                stop_id: 'stop-dest',
                arrival_time: '10:10:00',
                departure_time: '10:11:00',
                stop_sequence: 2,
              },
            ],
          ],
        ]),
      );

      jest
        .spyOn(gtfsParser, 'getTransfersFromBatch')
        .mockResolvedValue(new Map());

      const query: JourneyQuery = {
        origin: parisOrigin,
        destination: parisDest,
        departureTime: '2026-07-06T09:55:00',
      };
      const result = await service.findJourney(query);
      expect(result.length).toBeGreaterThan(0);
      const transitJourney = result.find((j) =>
        j.segments.some((s) => s.type === 'transit'),
      );
      expect(transitJourney).toBeDefined();
    });

    it('falls back to approximate transit when RAPTOR returns nothing', async () => {
      jest.spyOn(gtfsParser, 'isLoaded').mockResolvedValue(true);
      jest
        .spyOn(gtfsParser, 'findStopsNearby')
        .mockResolvedValueOnce([originStop])
        .mockResolvedValueOnce([destStop]);
      jest
        .spyOn(gtfsParser, 'getNextDeparturesBatch')
        .mockResolvedValue(new Map());
      jest
        .spyOn(gtfsParser, 'getTripStopTimesBatch')
        .mockResolvedValue(new Map());
      jest.spyOn(gtfsParser, 'getRoutesForStop').mockResolvedValue([mockRoute]);

      const query: JourneyQuery = {
        origin: parisOrigin,
        destination: parisDest,
      };
      const result = await service.findJourney(query);
      expect(result.length).toBeGreaterThan(0);
    });

    it('filters results by requested transport modes', async () => {
      const query: JourneyQuery = {
        origin: parisOrigin,
        destination: parisDest,
        modes: ['marche'],
      };
      const result = await service.findJourney(query);
      expect(result.length).toBeGreaterThan(0);
      expect(
        result.every((j) =>
          j.segments.every(
            (s) => s.type === 'walking' || s.mode?.toLowerCase() === 'marche',
          ),
        ),
      ).toBe(true);
    });
  });
});
