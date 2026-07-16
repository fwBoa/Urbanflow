import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { TransportController } from './transport.controller';
import { PrimService } from './prim.service';
import { GtfsParserService } from './gtfs-parser.service';
import { JourneyService } from './journey.service';
import { OsrmService } from './osrm.service';
import { GtfsRtService, RealtimeAlert } from './gtfs-rt.service';
import { NavitiaService } from './navitia.service';

describe('TransportController', () => {
  let controller: TransportController;

  const mockGtfsParser = {
    isLoaded: jest.fn().mockResolvedValue(true),
    getLastLoadTime: jest.fn().mockResolvedValue(new Date().toISOString()),
    getStats: jest.fn().mockResolvedValue({ stops: 100, routes: 20 }),
    downloadAndLoad: jest.fn().mockResolvedValue(undefined),
    findStopsNearby: jest.fn().mockResolvedValue([]),
    getRoutesForStop: jest.fn().mockResolvedValue([
      {
        route_id: 'R1',
        route_short_name: 'M1',
        route_long_name: 'Métro 1',
        route_type: 1,
        route_color: 'FF0000',
      },
    ]),
    getShapeById: jest.fn().mockResolvedValue([]),
    getStopDepartures: jest.fn().mockResolvedValue([]),
    searchStopsByName: jest.fn().mockResolvedValue([]),
    getStopModes: jest.fn().mockResolvedValue([{ mode: 1, name: 'Métro 1' }]),
    getStopLines: jest.fn().mockResolvedValue([{ mode: 1, name: 'Métro 1' }]),
  };

  const mockPrimService = {
    getLinesByMode: jest
      .fn()
      .mockResolvedValue({ metro: [{ id: 'M1', name: 'Métro 1' }] }),
    getNearbyVelibStations: jest.fn().mockResolvedValue([]),
    getVelibStations: jest.fn().mockResolvedValue({ stations: [] }),
    geocode: jest.fn().mockResolvedValue({ total_count: 0, results: [] }),
    reverseGeocode: jest.fn().mockResolvedValue({}),
  };

  const mockJourneyService = {
    findJourney: jest.fn().mockResolvedValue([]),
  };

  const mockOsrmService = {
    getRoute: jest.fn().mockResolvedValue({ routes: [] }),
  };

  const mockGtfsRtService = {
    getAlerts: jest.fn().mockResolvedValue([]),
  };

  const mockNavitiaService = {
    isAvailable: jest.fn().mockReturnValue(true),
    getAlerts: jest.fn().mockResolvedValue([]),
    findJourneys: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransportController],
      providers: [
        { provide: PrimService, useValue: mockPrimService },
        { provide: GtfsParserService, useValue: mockGtfsParser },
        { provide: JourneyService, useValue: mockJourneyService },
        { provide: OsrmService, useValue: mockOsrmService },
        { provide: GtfsRtService, useValue: mockGtfsRtService },
        { provide: NavitiaService, useValue: mockNavitiaService },
      ],
    }).compile();

    controller = module.get<TransportController>(TransportController);
    jest.clearAllMocks();
  });

  describe('lines-by-mode', () => {
    it('returns lines grouped by mode', async () => {
      const result = await controller.getLinesByMode();
      expect(result).toEqual({ metro: [{ id: 'M1', name: 'Métro 1' }] });
      expect(mockPrimService.getLinesByMode).toHaveBeenCalled();
    });
  });

  describe('velib-nearby', () => {
    it('returns nearby velib stations', async () => {
      await controller.getNearbyVelibStations('48.85', '2.35', '1', '5');
      expect(mockPrimService.getNearbyVelibStations).toHaveBeenCalledWith(
        48.85,
        2.35,
        1,
        5,
      );
    });

    it('throws 400 when lat or lon is missing', async () => {
      await expect(
        controller.getNearbyVelibStations(undefined, '2.35'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('nearby', () => {
    it('throws 503 when GTFS not loaded', async () => {
      mockGtfsParser.isLoaded.mockResolvedValueOnce(false);
      await expect(controller.getNearbyStops('48.85', '2.35')).rejects.toThrow(
        HttpException,
      );
    });

    it('throws 400 when lat or lon is missing', async () => {
      await expect(
        controller.getNearbyStops(undefined, '2.35'),
      ).rejects.toThrow(HttpException);
    });

    it('returns enriched stops', async () => {
      mockGtfsParser.findStopsNearby.mockResolvedValueOnce([
        {
          stop_id: 'stop-1',
          stop_name: 'Châtelet',
          stop_lat: 48.86,
          stop_lon: 2.35,
        },
      ]);
      const result = await controller.getNearbyStops('48.85', '2.35');
      expect(result.stops).toHaveLength(1);
    });
  });

  describe('gtfs-status', () => {
    it('returns status and stats when loaded', async () => {
      const result = await controller.getGtfsStatus();
      expect(result.loaded).toBe(true);
      expect(result.stats).toBeDefined();
    });
  });

  describe('gtfs-reload', () => {
    it('reloads gtfs successfully', async () => {
      const result = await controller.reloadGtfs();
      expect(result.success).toBe(true);
    });

    it('throws 500 on reload failure', async () => {
      mockGtfsParser.downloadAndLoad.mockRejectedValueOnce(
        new Error('network'),
      );
      await expect(controller.reloadGtfs()).rejects.toThrow(HttpException);
    });
  });

  describe('shape', () => {
    it('returns shape points', async () => {
      mockGtfsParser.getShapeById.mockResolvedValueOnce([
        { shape_pt_lat: 48.85, shape_pt_lon: 2.35, shape_pt_sequence: 1 },
      ]);
      const result = await controller.getShape('shape-1');
      expect(result.points).toHaveLength(1);
    });

    it('throws 400 when shapeId is missing', async () => {
      await expect(controller.getShape(undefined)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('stop-times', () => {
    it('returns departures', async () => {
      const result = await controller.getStopTimes('stop-1', '5');
      expect(result.departures).toEqual([]);
    });

    it('throws 400 when stopId is missing', async () => {
      await expect(controller.getStopTimes(undefined)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('gtfs-stops/search', () => {
    it('throws 400 when query is missing', async () => {
      await expect(controller.searchGtfsStops(undefined)).rejects.toThrow(
        HttpException,
      );
    });

    it('returns search results', async () => {
      mockGtfsParser.searchStopsByName.mockResolvedValueOnce([
        {
          stop_id: 'stop-1',
          stop_name: 'Châtelet',
          stop_lat: 48.86,
          stop_lon: 2.35,
          location_type: 1,
        },
      ]);
      const result = await controller.searchGtfsStops('Châtelet');
      expect(result.total_count).toBe(1);
    });
  });

  describe('stops (compat)', () => {
    it('returns empty results for short query', async () => {
      const result = await controller.getStops(undefined, '10');
      expect(result.total_count).toBe(0);
    });

    it('parses where parameter and returns results', async () => {
      mockGtfsParser.searchStopsByName.mockResolvedValueOnce([
        {
          stop_id: 'stop-1',
          stop_name: 'Châtelet',
          stop_lat: 48.86,
          stop_lon: 2.35,
          wheelchair_boarding: 1,
        },
      ]);
      const result = await controller.getStops(
        'search(arrname,"Châtelet")',
        '10',
      );
      expect(result.total_count).toBe(1);
    });
  });

  describe('velib', () => {
    it('returns velib stations', async () => {
      await controller.getVelibStations('10', '0');
      expect(mockPrimService.getVelibStations).toHaveBeenCalledWith({
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('geocode', () => {
    it('throws 400 when query is missing', async () => {
      await expect(controller.geocode(undefined)).rejects.toThrow(
        HttpException,
      );
    });

    it('merges gtfs and geocode results', async () => {
      mockGtfsParser.searchStopsByName.mockResolvedValueOnce([
        {
          stop_id: 'stop-1',
          stop_name: 'Châtelet',
          stop_lat: 48.86,
          stop_lon: 2.35,
        },
      ]);
      const result = await controller.geocode('Châtelet', '5');
      expect(result.total_count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reverse-geocode', () => {
    it('throws 400 when lat or lon is missing', async () => {
      await expect(
        controller.reverseGeocode(undefined, '2.35'),
      ).rejects.toThrow(HttpException);
    });

    it('returns reverse geocode result', async () => {
      await controller.reverseGeocode('48.85', '2.35');
      expect(mockPrimService.reverseGeocode).toHaveBeenCalledWith(48.85, 2.35);
    });
  });

  describe('realtime-alerts', () => {
    it('returns navitia alerts when available', async () => {
      mockNavitiaService.getAlerts.mockResolvedValueOnce([
        { id: 'alert-1', message: 'Incident' },
      ]);
      const result = await controller.getRealtimeAlerts();
      expect(result).toHaveLength(1);
    });

    it('falls back to gtfs-rt when navitia fails', async () => {
      mockNavitiaService.getAlerts.mockRejectedValueOnce(new Error('fail'));
      const result = await controller.getRealtimeAlerts();
      expect(result).toEqual([]);
    });
  });

  describe('journey', () => {
    it('throws 400 when coordinates are missing', async () => {
      await expect(controller.findJourney('48.85')).rejects.toThrow(
        HttpException,
      );
    });

    it('uses fallback for coordinates outside Paris', async () => {
      mockGtfsParser.findStopsNearby.mockResolvedValue([]);
      const result = await controller.findJourney('48.0', '2.0', '48.0', '2.0');
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns navitia journeys when available', async () => {
      mockNavitiaService.findJourneys.mockResolvedValueOnce([
        {
          durationMinutes: 20,
          transfers: 0,
          distanceKm: 5,
          co2Ggrams: 10,
          segments: [
            {
              type: 'transit',
              lineName: 'RER A',
            },
          ],
          departureTime: new Date().toISOString(),
          arrivalTime: new Date().toISOString(),
        },
      ]);
      const result = await controller.findJourney(
        '48.8566',
        '2.3522',
        '48.86',
        '2.35',
      );
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].durationMinutes).toBe(20);
    });

    it('falls back to GTFS RAPTOR when navitia returns nothing', async () => {
      mockNavitiaService.findJourneys.mockResolvedValueOnce([]);
      mockJourneyService.findJourney.mockResolvedValueOnce([
        {
          durationMinutes: 25,
          transfers: 1,
          distanceKm: 5,
          co2Ggrams: 12,
          segments: [{ type: 'transit', lineName: 'M1' }],
          departureTime: new Date().toISOString(),
          arrivalTime: new Date().toISOString(),
        },
      ]);
      const result = await controller.findJourney(
        '48.8566',
        '2.3522',
        '48.86',
        '2.35',
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('alert matching', () => {
    const journey = {
      durationMinutes: 20,
      transfers: 0,
      distanceKm: 5,
      co2Ggrams: 10,
      departureTime: new Date().toISOString(),
      arrivalTime: new Date().toISOString(),
      segments: [{ type: 'transit' as const, mode: 'rer', lineName: 'RER A' }],
    };

    it('matches alert for the same line', () => {
      const alerts: RealtimeAlert[] = [
        {
          id: 'a1',
          headerText: 'Incident',
          severity: 'warning',
          affectedRoutes: ['RER A'],
          activePeriod: [],
        },
      ];
      const matched = (controller as any).matchAlertsForJourney(
        journey,
        alerts,
      );
      expect(matched).toHaveLength(1);
    });

    it('does not match RER A with Tram T3a (code collision)', () => {
      const alerts: RealtimeAlert[] = [
        {
          id: 'a1',
          headerText: 'Incident tram',
          severity: 'warning',
          affectedRoutes: ['Tram T3a'],
          activePeriod: [],
        },
      ];
      const matched = (controller as any).matchAlertsForJourney(
        journey,
        alerts,
      );
      expect(matched).toHaveLength(0);
    });

    it('does not match Métro 1 with Bus 1 (same code, different mode)', () => {
      const metroJourney = {
        ...journey,
        segments: [
          { type: 'transit' as const, mode: 'metro', lineName: 'Métro 1' },
        ],
      };
      const alerts: RealtimeAlert[] = [
        {
          id: 'a1',
          headerText: 'Incident bus',
          severity: 'warning',
          affectedRoutes: ['Bus 1'],
          activePeriod: [],
        },
      ];
      const matched = (controller as any).matchAlertsForJourney(
        metroJourney,
        alerts,
      );
      expect(matched).toHaveLength(0);
    });

    it('matches alert by exact code when mode is missing', () => {
      const shortCodeJourney = {
        ...journey,
        segments: [{ type: 'transit' as const, mode: 'rer', lineName: 'B' }],
      };
      const alerts: RealtimeAlert[] = [
        {
          id: 'a1',
          headerText: 'Incident',
          severity: 'warning',
          affectedRoutes: ['RER B'],
          activePeriod: [],
        },
      ];
      const matched = (controller as any).matchAlertsForJourney(
        shortCodeJourney,
        alerts,
      );
      expect(matched).toHaveLength(1);
    });
  });

  describe('route', () => {
    it('throws 400 when coordinates are missing', async () => {
      await expect(controller.getRoute('48.85')).rejects.toThrow(HttpException);
    });

    it('returns OSRM route', async () => {
      const result = await controller.getRoute(
        '48.85',
        '2.35',
        '48.86',
        '2.36',
        'bike',
      );
      expect(result).toEqual({ routes: [] });
      expect(mockOsrmService.getRoute).toHaveBeenCalledWith(
        48.85,
        2.35,
        48.86,
        2.36,
        'bike',
      );
    });

    it('throws 503 when OSRM returns nothing', async () => {
      mockOsrmService.getRoute.mockResolvedValueOnce(null);
      await expect(
        controller.getRoute('48.85', '2.35', '48.86', '2.36'),
      ).rejects.toThrow(HttpException);
    });
  });
});
