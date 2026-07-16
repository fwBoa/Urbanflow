jest.mock('typeorm', () => ({
  ...jest.requireActual('typeorm'),
  DataSource: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
}));

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { seedAdmin } from './seed-admin';

describe('seedAdmin', () => {
  const mockInsert = jest.fn().mockResolvedValue(undefined);
  const mockFindOne = jest.fn().mockResolvedValue(null);
  const mockDestroy = jest.fn().mockResolvedValue(undefined);
  const mockInitialize = jest.fn().mockResolvedValue(undefined);
  const mockGetRepository = jest.fn().mockReturnValue({
    findOne: mockFindOne,
    insert: mockInsert,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (DataSource as jest.Mock).mockImplementation(() => ({
      initialize: mockInitialize,
      getRepository: mockGetRepository,
      destroy: mockDestroy,
    }));
  });

  it('creates admin when none exists', async () => {
    await seedAdmin();

    expect(mockInitialize).toHaveBeenCalled();
    expect(mockFindOne).toHaveBeenCalledWith({ where: { role: 'admin' } });
    expect(bcrypt.hash).toHaveBeenCalledWith('admin123', 12);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('skips creation when admin already exists', async () => {
    mockFindOne.mockResolvedValueOnce({ email: 'admin@urbanflow.app' });
    await seedAdmin();

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('exits on initialization error', async () => {
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    mockInitialize.mockRejectedValueOnce(new Error('DB down'));

    await seedAdmin();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockDestroy).toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
