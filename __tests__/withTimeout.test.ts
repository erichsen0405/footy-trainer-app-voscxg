import { withTimeout } from '@/utils/withTimeout';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('resolves when promise finishes before timeout', async () => {
    const promise = withTimeout(Promise.resolve('ok'), 1000, 'timed out');
    await expect(promise).resolves.toBe('ok');
  });

  it('rejects with TimeoutError when promise does not finish in time', async () => {
    const never = new Promise<string>(() => {});
    const promise = withTimeout(never, 1000, 'timed out');

    jest.advanceTimersByTime(1000);
    await expect(promise).rejects.toEqual(expect.objectContaining({
      name: 'TimeoutError',
      message: 'timed out',
    }));
  });

  it('propagates original rejection before timeout', async () => {
    const failing = Promise.reject(new Error('boom'));
    const promise = withTimeout(failing, 1000, 'timed out');
    await expect(promise).rejects.toThrow('boom');
  });
});
