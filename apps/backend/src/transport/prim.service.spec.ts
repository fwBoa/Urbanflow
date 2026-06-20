import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PrimService } from './prim.service';

describe('PrimService', () => {
  let service: PrimService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        PrimService,
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

    service = module.get<PrimService>(PrimService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have PRIM API URL configured', () => {
    expect(service).toBeDefined();
  });

  describe('getLinesByMode', () => {
    it('should expose a getLinesByMode method', () => {
      expect(typeof service.getLinesByMode).toBe('function');
    });
  });

  describe('getNearbyVelibStations', () => {
    it('should expose a getNearbyVelibStations method', () => {
      expect(typeof service.getNearbyVelibStations).toBe('function');
    });
  });

  describe('geocode', () => {
    it('should expose a geocode method', () => {
      expect(typeof service.geocode).toBe('function');
    });
  });

  describe('reverseGeocode', () => {
    it('should expose a reverseGeocode method', () => {
      expect(typeof service.reverseGeocode).toBe('function');
    });
  });
});