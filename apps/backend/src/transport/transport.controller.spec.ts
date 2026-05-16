import { Test, TestingModule } from '@nestjs/testing';
import { TransportController } from './transport.controller';
import { PrimService } from './prim.service';
import { CarbonService } from './carbon.service';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

describe('TransportController', () => {
  let controller: TransportController;
  let primService: PrimService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      controllers: [TransportController],
      providers: [
        PrimService,
        CarbonService,
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

    controller = module.get<TransportController>(TransportController);
    primService = module.get<PrimService>(PrimService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('status');
    });
  });

  describe('getLines', () => {
    it('should call primService.getLines with default params', async () => {
      const spy = jest.spyOn(primService, 'getLines');
      await controller.getLines(undefined, undefined, '6', '0');
      expect(spy).toHaveBeenCalledWith({
        select: undefined,
        where: undefined,
        limit: 6,
        offset: 0,
      });
    });
  });

  describe('getStops', () => {
    it('should call primService.getStops with params', async () => {
      const spy = jest.spyOn(primService, 'getStops');
      await controller.getStops(undefined, 'search(arrname,"Châtelet")', '10', '0');
      expect(spy).toHaveBeenCalledWith({
        select: undefined,
        where: 'search(arrname,"Châtelet")',
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getVelibStations', () => {
    it('should call primService.getVelibStations', async () => {
      const spy = jest.spyOn(primService, 'getVelibStations');
      await controller.getVelibStations(undefined, undefined, '20', '0');
      expect(spy).toHaveBeenCalled();
    });
  });
});