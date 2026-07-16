import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { applyAppConfig } from './app.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('applyAppConfig', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    app = module.createNestApplication();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('applies global cookie parser, validation pipe, exception filter and /api prefix', () => {
    const useSpy = jest.spyOn(app, 'use');
    const useGlobalPipesSpy = jest.spyOn(app, 'useGlobalPipes');
    const useGlobalFiltersSpy = jest.spyOn(app, 'useGlobalFilters');
    const setGlobalPrefixSpy = jest.spyOn(app, 'setGlobalPrefix');

    applyAppConfig(app);

    expect(useSpy).toHaveBeenCalled();
    expect(useGlobalPipesSpy).toHaveBeenCalled();
    expect(useGlobalFiltersSpy).toHaveBeenCalled();
    expect(setGlobalPrefixSpy).toHaveBeenCalledWith('api');

    const pipe = useGlobalPipesSpy.mock.calls[0][0];
    expect(pipe).toBeInstanceOf(ValidationPipe);
  });
});
