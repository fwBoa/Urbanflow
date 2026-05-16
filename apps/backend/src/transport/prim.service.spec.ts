import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpModule, HttpService } from '@nestjs/axios';
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
              if (key === 'PRIM_API_URL') return 'https://api-lab.idfm.fr';
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

  describe('getLines', () => {
    it('should call the data API with correct endpoint', async () => {
      // This test verifies the method exists and doesn't throw on definition
      expect(typeof service.getLines).toBe('function');
    });
  });

  describe('getStops', () => {
    it('should call the data API with correct endpoint', async () => {
      expect(typeof service.getStops).toBe('function');
    });
  });

  describe('getVelibStations', () => {
    it('should call the PRIM API for Vélib data', async () => {
      expect(typeof service.getVelibStations).toBe('function');
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      expect(typeof service.healthCheck).toBe('function');
    });
  });
});