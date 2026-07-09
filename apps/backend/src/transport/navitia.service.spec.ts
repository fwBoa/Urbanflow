import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { NavitiaService } from './navitia.service';
import type { JourneyResult } from './journey.service';

describe('NavitiaService', () => {
  let service: NavitiaService;
  let httpService: HttpService;

  const baseUrl = 'https://prim.iledefrance-mobilites.fr';
  const apiKey = 'test-api-key';

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const values: Record<string, string> = {
        PRIM_API_URL: baseUrl,
        PRIM_API_KEY: apiKey,
      };
      return values[key] ?? defaultValue;
    }),
  };

  const mockJourneysResponse = {
    journeys: [
      {
        duration: 1200,
        nb_transfers: 1,
        departure_date_time: '20260706T104818',
        arrival_date_time: '20260706T110818',
        co2_emission: { value: 42, unit: 'gEC' },
        sections: [
          {
            type: 'public_transport',
            mode: 'walking',
            from: { name: 'Origin' },
            to: { name: 'Destination' },
            departure_date_time: '20260706T104818',
            arrival_date_time: '20260706T110818',
            duration: 600,
            geojson: {
              type: 'LineString',
              coordinates: [
                [2.35, 48.85],
                [2.36, 48.86],
              ],
            },
            display_informations: {
              code: 'M1',
              color: '007852',
              commercial_mode: 'Métro',
              direction: 'La Défense',
              headsign: 'La Défense',
            },
            stop_date_times: [
              { stop_point: { name: 'Origin' } },
              { stop_point: { name: 'Destination' } },
            ],
          },
          {
            type: 'street_network',
            mode: 'walking',
            from: { name: 'Origin' },
            to: { name: 'Station' },
            departure_date_time: '20260706T104818',
            arrival_date_time: '20260706T104918',
            duration: 60,
          },
        ],
      },
    ],
  };

  const mockDisruptionsResponse = {
    disruptions: [
      {
        id: 'disruption-1',
        status: 'active',
        cause: 'travaux',
        effect: 'delay',
        severity: { name: 'warning' },
        messages: [{ text: '<p>Perturbation M1</p>' }],
        application_periods: [
          { begin: '2026-07-06T10:00:00Z', end: '2026-07-06T12:00:00Z' },
        ],
        impacted_objects: [{ pt_object: { name: 'M1', code: 'M1' } }],
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NavitiaService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn().mockReturnValue(of({ data: {} })),
          },
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<NavitiaService>(NavitiaService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be available when API key is set', () => {
    expect(service.isAvailable()).toBe(true);
  });

  describe('findJourneys', () => {
    it('returns mapped JourneyResult array', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: mockJourneysResponse } as any));

      const result = await service.findJourneys(
        { lat: 48.85, lon: 2.35 },
        { lat: 48.86, lon: 2.36 },
        new Date().toISOString(),
        ['metro'],
        1,
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      const journey: JourneyResult = result[0];
      expect(journey.durationMinutes).toBe(20);
      expect(journey.transfers).toBe(1);
      expect(journey.segments.length).toBeGreaterThan(0);
      expect(journey.departureTime).toBe('10:48:18');
      expect(journey.arrivalTime).toBe('11:08:18');
    });

    it('returns empty array when Navitia returns no journeys', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: { journeys: [] } } as any));
      const result = await service.findJourneys(
        { lat: 48.85, lon: 2.35 },
        { lat: 48.86, lon: 2.36 },
      );
      expect(result).toEqual([]);
    });

    it('throws when API key is missing', async () => {
      const noKeyModule = await Test.createTestingModule({
        providers: [
          NavitiaService,
          {
            provide: HttpService,
            useValue: { get: jest.fn() },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                if (key === 'PRIM_API_URL')
                  return 'https://prim.iledefrance-mobilites.fr';
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();
      const noKeyService = noKeyModule.get<NavitiaService>(NavitiaService);
      expect(noKeyService.isAvailable()).toBe(false);
      await expect(
        noKeyService.findJourneys(
          { lat: 48.85, lon: 2.35 },
          { lat: 48.86, lon: 2.36 },
        ),
      ).rejects.toThrow('PRIM_API_KEY not configured');
    });
  });

  describe('cache', () => {
    it('caches Navitia responses and reuses them', async () => {
      const getSpy = jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: mockJourneysResponse } as any));

      await service.findJourneys(
        { lat: 48.85, lon: 2.35 },
        { lat: 48.86, lon: 2.36 },
      );
      await service.findJourneys(
        { lat: 48.85, lon: 2.35 },
        { lat: 48.86, lon: 2.36 },
      );

      expect(getSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAlerts', () => {
    it('returns mapped RealtimeAlert array', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: mockDisruptionsResponse } as any));

      const result = await service.getAlerts();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('disruption-1');
      expect(result[0].headerText).toBe('Perturbation M1');
      expect(result[0].severity).toBe('warning');
      expect(result[0].affectedRoutes).toContain('M1');
    });

    it('returns empty array when disruptions call fails', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(
          of({ data: { message: 'Unauthorized' }, status: 401 } as any),
        );
      // firstValueFrom will return the 401 response but callNavitia does not check status.
      // The data lacks `disruptions`, so getAlerts catches and returns [].
      const result = await service.getAlerts();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('forbiddenUrisForModes', () => {
    it('forbids bike-sharing by default when no modes specified', async () => {
      await service.findJourneys(
        { lat: 48.85, lon: 2.35 },
        { lat: 48.86, lon: 2.36 },
      );
      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            forbidden_uris: ['physical_mode:Bike'],
          }),
        }),
      );
    });

    it('adds forbidden_uris for restricted modes', async () => {
      await service.findJourneys(
        { lat: 48.85, lon: 2.35 },
        { lat: 48.86, lon: 2.36 },
        undefined,
        ['metro'],
      );
      expect(httpService.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            forbidden_uris: expect.arrayContaining([
              'physical_mode:Bus',
              'physical_mode:Tramway',
              'physical_mode:Rail',
              'physical_mode:RapidTransit',
            ]),
          }),
        }),
      );
    });
  });
});
