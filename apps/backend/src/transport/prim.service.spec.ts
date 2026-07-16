import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { PrimService } from './prim.service';

describe('PrimService', () => {
  let service: PrimService;
  let httpService: HttpService;

  const mockConfig = {
    get: jest.fn((key: string, fallback?: string) => {
      const values: Record<string, string> = {
        PRIM_API_URL: 'https://prim.example.com',
        PRIM_API_KEY: 'test-key',
        IDFM_DATA_API_URL: 'https://data.example.com',
      };
      return values[key] ?? fallback;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrimService,
        { provide: HttpService, useValue: { get: jest.fn() } },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PrimService>(PrimService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined and log initialization', () => {
    expect(service).toBeDefined();
    service.onModuleInit();
  });

  describe('getLinesByMode', () => {
    it('returns lines grouped by mode', async () => {
      const lineRecord = {
        id_line: 'line-1',
        name_line: 'Métro 1',
        shortname_line: 'M1',
        transportmode: 'metro',
        transportsubmode: '',
        status: 'active',
        colourweb_hexa: 'FF0000',
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: { results: [lineRecord] } }) as any);

      const result = await service.getLinesByMode();
      expect(result.metro).toHaveLength(1);
      expect(result.metro[0].id).toBe('line-1');
    });
  });

  describe('getVelibStations', () => {
    it('returns raw velib data', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: { records: [] } }) as any);
      const result = await service.getVelibStations({ limit: 10, offset: 0 });
      expect(result).toEqual({ records: [] });
    });
  });

  describe('getNearbyVelibStations', () => {
    it('returns nearby stations sorted by distance', async () => {
      const record = {
        recordid: 'velib-1',
        fields: {
          stationcode: '10001',
          name: 'Station A',
          coordonnees_geo: [48.86, 2.36],
          numbikesavailable: 5,
          ebike: 2,
          mechanical: 3,
          numdocksavailable: 10,
          capacity: 15,
          is_renting: 'OUI',
          is_returning: 'OUI',
          nom_arrondissement_communes: 'Paris 1er',
        },
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: { records: [record] } }) as any);

      const result = await service.getNearbyVelibStations(48.85, 2.35, 1, 10);
      expect(result.stations).toHaveLength(1);
      expect(result.stations[0].id).toBe('10001');
    });

    it('returns empty stations on API error', async () => {
      jest.spyOn(httpService, 'get').mockImplementation(() => {
        throw new Error('network');
      });
      const result = await service.getNearbyVelibStations(48.85, 2.35);
      expect(result.stations).toEqual([]);
    });
  });

  describe('geocode', () => {
    const feature = {
      properties: {
        id: 'addr-1',
        label: '1 Rue de Paris',
        score: 0.9,
        type: 'housenumber',
        city: 'Paris',
        postcode: '75001',
        context: '75, Paris, Île-de-France',
      },
      geometry: { type: 'Point', coordinates: [2.35, 48.85] },
    };

    it('returns Paris results', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: { features: [feature] } }) as any);

      const result = await service.geocode('1 rue de paris');
      expect(result.total_count).toBe(1);
      expect(result.results[0].isParis).toBe(true);
    });
  });

  describe('reverseGeocode', () => {
    it('returns address for coordinates', async () => {
      const feature = {
        properties: {
          label: '1 Rue de Paris',
          type: 'housenumber',
          city: 'Paris',
          postcode: '75001',
          context: '75',
        },
        geometry: { type: 'Point', coordinates: [2.35, 48.85] },
      };

      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: { features: [feature] } }) as any);

      const result = await service.reverseGeocode(48.85, 2.35);
      expect(result.label).toBe('1 Rue de Paris');
      expect(result.isParis).toBe(true);
    });

    it('returns coordinates fallback when no feature found', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: { features: [] } }) as any);

      const result = await service.reverseGeocode(48.85, 2.35);
      expect(result.type).toBe('coordinates');
      expect(result.isParis).toBe(false);
    });

    it('returns coordinates fallback on API error', async () => {
      jest.spyOn(httpService, 'get').mockImplementation(() => {
        throw new Error('network');
      });
      const result = await service.reverseGeocode(48.85, 2.35);
      expect(result.type).toBe('coordinates');
    });
  });
});
