import { ArgumentsHost, HttpException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const req = { method: 'GET', url: '/api/x' };
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const res = { status };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;

  beforeEach(() => jest.clearAllMocks());

  it('redacts internal errors in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const filter = new AllExceptionsFilter();
      filter.catch(
        new Error('DB connection leaked: postgres://user:pass@h'),
        host,
      );
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'Internal server error',
          path: '/api/x',
        }),
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('keeps full error detail in staging', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'staging';
    try {
      const filter = new AllExceptionsFilter();
      filter.catch(
        new Error('DB connection leaked: postgres://user:pass@h'),
        host,
      );
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'DB connection leaked: postgres://user:pass@h',
        }),
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('passes HttpException status + message through', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const filter = new AllExceptionsFilter();
      filter.catch(new HttpException('Not found', 404), host);
      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: 'Not found' }),
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
