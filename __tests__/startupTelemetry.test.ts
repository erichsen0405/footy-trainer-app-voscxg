const STARTUP_TELEMETRY_QUEUE_KEY = '@startup_telemetry_queue_v1';

describe('startupTelemetry', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJestWorkerId = process.env.JEST_WORKER_ID;

  beforeEach(() => {
    (process.env as any).NODE_ENV = 'development';
    delete process.env.JEST_WORKER_ID;
    jest.resetModules();
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalNodeEnv;
    if (typeof originalJestWorkerId === 'string') {
      process.env.JEST_WORKER_ID = originalJestWorkerId;
    } else {
      delete process.env.JEST_WORKER_ID;
    }
  });

  function loadStartupTelemetryModule() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const telemetry = require('@/utils/startupTelemetry') as typeof import('@/utils/startupTelemetry');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asyncStorageModule = require('@react-native-async-storage/async-storage');
    const AsyncStorage = (asyncStorageModule.default ?? asyncStorageModule) as {
      clear?: () => Promise<void>;
      getItem: (key: string) => Promise<string | null>;
      setItem: (key: string, value: string) => Promise<void>;
    };
    return { telemetry, AsyncStorage };
  }

  it('throttles repeated low-priority auth session events', async () => {
    const { telemetry, AsyncStorage } = loadStartupTelemetryModule();
    if (typeof AsyncStorage.clear === 'function') {
      await AsyncStorage.clear();
    }
    const client = {
      rpc: jest.fn().mockResolvedValue({ error: new Error('offline') }),
    };

    await telemetry.trackStartupTelemetry(client, {
      eventName: 'auth_get_session_completed',
      status: 'success',
    });
    await telemetry.trackStartupTelemetry(client, {
      eventName: 'auth_get_session_completed',
      status: 'success',
    });

    const rawQueue = await AsyncStorage.getItem(STARTUP_TELEMETRY_QUEUE_KEY);
    const queue = JSON.parse(rawQueue ?? '[]');

    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(
      expect.objectContaining({
        eventName: 'auth_get_session_completed',
        status: 'success',
      })
    );
  });

  it('preserves startup launch events when the queue overflows with low-priority noise', async () => {
    const { telemetry, AsyncStorage } = loadStartupTelemetryModule();
    if (typeof AsyncStorage.clear === 'function') {
      await AsyncStorage.clear();
    }
    const client = {
      rpc: jest.fn().mockResolvedValue({ error: new Error('offline') }),
    };

    await telemetry.trackStartupTelemetry(client, {
      eventName: 'startup_launch',
      status: 'begin',
      route: '/',
    });

    for (let index = 0; index < 80; index += 1) {
      await telemetry.trackStartupTelemetry(client, {
        eventName: 'auth_get_session_completed',
        status: `success-${index}`,
      });
    }

    const rawQueue = await AsyncStorage.getItem(STARTUP_TELEMETRY_QUEUE_KEY);
    const queue = JSON.parse(rawQueue ?? '[]');

    expect(queue).toHaveLength(50);
    expect(queue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: 'startup_launch',
          status: 'begin',
          route: '/',
        }),
      ])
    );
    expect(queue.every((event: any) => typeof event.launchId === 'string' && event.launchId.length > 0)).toBe(true);
  });

  it('flushes queued events with their stored launch id', async () => {
    const { telemetry, AsyncStorage } = loadStartupTelemetryModule();
    if (typeof AsyncStorage.clear === 'function') {
      await AsyncStorage.clear();
    }
    const client = {
      rpc: jest.fn().mockResolvedValue({ error: null }),
    };

    await AsyncStorage.setItem(
      STARTUP_TELEMETRY_QUEUE_KEY,
      JSON.stringify([
        {
          eventName: 'startup_launch',
          status: 'begin',
          route: '/',
          metadata: { platform: 'ios' },
          launchId: 'persisted-launch-id',
          timestamp: '2026-03-09T08:00:00.000Z',
        },
      ])
    );

    await telemetry.flushStartupTelemetry(client);

    expect(client.rpc).toHaveBeenCalledWith(
      'log_startup_telemetry',
      expect.objectContaining({
        p_launch_id: 'persisted-launch-id',
        p_event_name: 'startup_launch',
      })
    );

    await expect(AsyncStorage.getItem(STARTUP_TELEMETRY_QUEUE_KEY)).resolves.toBe('[]');
  });
});
