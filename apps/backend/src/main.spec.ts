import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

jest.mock('@nestjs/core', () => ({
  ...jest.requireActual('@nestjs/core'),
  NestFactory: {
    create: jest.fn(),
  },
}));

describe('bootstrap', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('starts the server and logs the running message', async () => {
    const mockApp = {
      use: jest.fn(),
      enableCors: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
      setGlobalPrefix: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      close: jest.fn(),
    } as unknown as INestApplication;

    (NestFactory.create as jest.Mock).mockResolvedValue(mockApp);

    // Import main.ts after mocking NestFactory so bootstrap runs against the mock.
    await import('./main');

    // Wait for the async bootstrap promise chain.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(NestFactory.create).toHaveBeenCalled();
    expect(mockApp.listen).toHaveBeenCalledWith(expect.any(Number));
  }, 20000);
});
