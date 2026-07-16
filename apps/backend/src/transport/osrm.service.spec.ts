import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { OsrmService, OsrmRouteResult } from './osrm.service';

describe('OsrmService', () => {
  let service: OsrmService;
  let httpService: HttpService;

  const mockRoute: OsrmRouteResult = {
    geometry: {
      type: 'LineString',
      coordinates: [
        [2.35, 48.85],
        [2.36, 48.86],
      ],
    },
    distance: 1500,
    duration: 1200,
  };

  const mockResponse = {
    data: {
      routes: [
        {
          geometry: mockRoute.geometry,
          distance: mockRoute.distance,
          duration: mockRoute.duration,
        },
      ],
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OsrmService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OsrmService>(OsrmService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns route from OSRM and caches it', async () => {
    jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse) as any);

    const result = await service.getRoute(48.85, 2.35, 48.86, 2.36);
    expect(result).toEqual(mockRoute);

    // Second call should use cache without HTTP request
    jest.clearAllMocks();
    const cached = await service.getRoute(48.85, 2.35, 48.86, 2.36);
    expect(cached).toEqual(mockRoute);
    expect(httpService.get).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent requests', async () => {
    let callCount = 0;
    jest.spyOn(httpService, 'get').mockImplementation(() => {
      callCount++;
      return of(mockResponse) as any;
    });

    const [r1, r2] = await Promise.all([
      service.getRoute(48.85, 2.35, 48.86, 2.36),
      service.getRoute(48.85, 2.35, 48.86, 2.36),
    ]);

    expect(r1).toEqual(mockRoute);
    expect(r2).toEqual(mockRoute);
    expect(callCount).toBe(1);
  });

  it('uses bike and car profiles correctly', async () => {
    jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse) as any);

    await service.getRoute(48.85, 2.35, 48.86, 2.36, 'bike');
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/cycling/'),
      expect.any(Object),
    );

    jest.clearAllMocks();
    await service.getRoute(48.85, 2.35, 48.86, 2.36, 'car');
    expect(httpService.get).toHaveBeenCalledWith(
      expect.stringContaining('/driving/'),
      expect.any(Object),
    );
  });

  it('returns null when OSRM has no routes', async () => {
    jest
      .spyOn(httpService, 'get')
      .mockReturnValue(of({ data: { routes: [] } }) as any);
    const result = await service.getRoute(48.85, 2.35, 48.86, 2.36);
    expect(result).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    jest
      .spyOn(httpService, 'get')
      .mockReturnValue(throwError(() => new Error('network')));
    const result = await service.getRoute(48.85, 2.35, 48.86, 2.36);
    expect(result).toBeNull();
  });
});
