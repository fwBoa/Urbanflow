import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { GtfsRtService } from './gtfs-rt.service';

describe('GtfsRtService', () => {
  let service: GtfsRtService;
  let httpService: HttpService;

  const baseUrl = 'https://prim.iledefrance-mobilites.fr';
  const apiKey = 'test-api-key';

  const mockDisruptionsResponse = {
    disruptions: [
      {
        id: 'alert-1',
        severity: { name: 'critical' },
        messages: [{ text: 'Incident technique' }],
        startDate: '2026-07-06T10:00:00Z',
        endDate: '2026-07-06T12:00:00Z',
        cause: 'incident',
        effect: 'reduced_service',
        lignes: [{ shortName: 'M1', name: 'Métro 1' }],
      },
      {
        id: 'alert-2',
        status: 'information',
        messages: [{ text: 'Info trafic' }],
        applicationPeriods: [
          { begin: '2026-07-06T08:00:00Z', end: '2026-07-06T09:00:00Z' },
        ],
        lineIds: ['RERA'],
      },
    ],
  };

  beforeEach(async () => {
    process.env.PRIM_API_URL = baseUrl;
    process.env.PRIM_API_KEY = apiKey;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GtfsRtService,
        {
          provide: HttpService,
          useValue: {
            get: jest
              .fn()
              .mockReturnValue(of({ data: mockDisruptionsResponse } as any)),
          },
        },
      ],
    }).compile();

    service = module.get<GtfsRtService>(GtfsRtService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAlerts', () => {
    it('fetches and maps disruptions from PRIM', async () => {
      const result = await service.getAlerts();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('alert-1');
      expect(result[0].headerText).toBe('Incident technique');
      expect(result[0].severity).toBe('severe');
      expect(result[0].affectedRoutes).toContain('M1');
      expect(result[1].affectedRoutes).toContain('RERA');
    });

    it('returns cached alerts without calling API when TTL not expired', async () => {
      const getSpy = jest.spyOn(httpService, 'get');
      await service.getAlerts();
      await service.getAlerts();
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it('returns stale cache when fetch fails', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValueOnce(of({ data: mockDisruptionsResponse } as any))
        .mockReturnValueOnce(throwError(() => new Error('Network error')));

      const fresh = await service.getAlerts();
      expect(fresh.length).toBe(2);

      const stale = await service.getAlerts();
      expect(stale.length).toBe(2);
      expect(stale[0].id).toBe('alert-1');
    });

    it('returns empty array when no API key is set and cache empty', async () => {
      delete process.env.PRIM_API_KEY;
      const noKeyModule = await Test.createTestingModule({
        providers: [
          GtfsRtService,
          {
            provide: HttpService,
            useValue: { get: jest.fn() },
          },
        ],
      }).compile();
      const noKeyService = noKeyModule.get<GtfsRtService>(GtfsRtService);
      const result = await noKeyService.getAlerts();
      expect(result).toEqual([]);
    });
  });

  describe('handleCronRefresh', () => {
    it('refreshes alerts without throwing', async () => {
      await expect(service.handleCronRefresh()).resolves.toBeUndefined();
    });

    it('handles cron refresh errors gracefully', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(throwError(() => new Error('Cron failure')));
      await expect(service.handleCronRefresh()).resolves.toBeUndefined();
    });
  });
});
