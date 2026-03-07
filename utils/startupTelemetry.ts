import AsyncStorage from '@react-native-async-storage/async-storage';

const STARTUP_TELEMETRY_DEVICE_ID_KEY = '@startup_telemetry_device_id_v1';
const STARTUP_TELEMETRY_QUEUE_KEY = '@startup_telemetry_queue_v1';
const STARTUP_TELEMETRY_MAX_QUEUE_SIZE = 50;

type StartupTelemetryJson =
  | string
  | number
  | boolean
  | null
  | { [key: string]: StartupTelemetryJson | undefined }
  | StartupTelemetryJson[];

export interface StartupTelemetryEventInput {
  eventName: string;
  status?: string | null;
  route?: string | null;
  metadata?: StartupTelemetryJson | null;
}

interface StartupTelemetryQueuedEvent extends StartupTelemetryEventInput {
  timestamp: string;
}

type RpcCapableClient = {
  rpc: any;
};

const startupLaunchId = createStartupId();
let deviceInstallIdPromise: Promise<string> | null = null;
let flushPromise: Promise<void> | null = null;

export function getStartupLaunchId() {
  return startupLaunchId;
}

export async function trackStartupTelemetry(
  client: RpcCapableClient,
  event: StartupTelemetryEventInput,
) {
  if (isStartupTelemetryDisabled()) {
    return;
  }

  try {
    await enqueueStartupTelemetryEvent(event);
    void flushStartupTelemetry(client);
  } catch {
    // Telemetry must never break app startup.
  }
}

export async function flushStartupTelemetry(client: RpcCapableClient) {
  if (isStartupTelemetryDisabled()) {
    return;
  }

  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async () => {
    try {
      const queue = await readStartupTelemetryQueue();
      if (!queue.length) return;

      const deviceInstallId = await getDeviceInstallId();
      let sentCount = 0;

      for (const event of queue) {
        const { error } = await client.rpc('log_startup_telemetry', {
          p_device_install_id: deviceInstallId,
          p_launch_id: startupLaunchId,
          p_event_name: event.eventName,
          p_status: event.status ?? null,
          p_route: event.route ?? null,
          p_metadata: event.metadata ?? null,
          p_occurred_at: event.timestamp,
        });

        if (error) {
          break;
        }

        sentCount += 1;
      }

      if (sentCount > 0) {
        const remainingQueue = queue.slice(sentCount);
        await persistStartupTelemetryQueue(remainingQueue);
      }
    } catch {
      // Keep queue for later attempts.
    } finally {
      flushPromise = null;
    }
  })();

  return flushPromise;
}

async function enqueueStartupTelemetryEvent(event: StartupTelemetryEventInput) {
  const queue = await readStartupTelemetryQueue();
  const nextQueue = [
    ...queue,
    {
      ...event,
      timestamp: new Date().toISOString(),
    },
  ].slice(-STARTUP_TELEMETRY_MAX_QUEUE_SIZE);

  await persistStartupTelemetryQueue(nextQueue);
}

async function readStartupTelemetryQueue(): Promise<StartupTelemetryQueuedEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STARTUP_TELEMETRY_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persistStartupTelemetryQueue(queue: StartupTelemetryQueuedEvent[]) {
  await AsyncStorage.setItem(STARTUP_TELEMETRY_QUEUE_KEY, JSON.stringify(queue));
}

async function getDeviceInstallId() {
  if (deviceInstallIdPromise) {
    return deviceInstallIdPromise;
  }

  deviceInstallIdPromise = (async () => {
    const existing = await AsyncStorage.getItem(STARTUP_TELEMETRY_DEVICE_ID_KEY);
    if (existing) return existing;

    const nextId = createStartupId();
    await AsyncStorage.setItem(STARTUP_TELEMETRY_DEVICE_ID_KEY, nextId);
    return nextId;
  })();

  return deviceInstallIdPromise;
}

function createStartupId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStartupTelemetryDisabled() {
  return process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID === 'string';
}
