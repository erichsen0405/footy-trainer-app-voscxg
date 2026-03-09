import AsyncStorage from '@react-native-async-storage/async-storage';

const STARTUP_TELEMETRY_DEVICE_ID_KEY = '@startup_telemetry_device_id_v1';
const STARTUP_TELEMETRY_QUEUE_KEY = '@startup_telemetry_queue_v1';
const STARTUP_TELEMETRY_MAX_QUEUE_SIZE = 50;
const STARTUP_TELEMETRY_LOW_PRIORITY_THROTTLE_MS = 5000;

const LOW_PRIORITY_EVENT_NAMES = new Set([
  'auth_get_session_completed',
  'auth_get_session_dedupe_hit',
]);

const CRITICAL_EVENT_NAMES = new Set([
  'startup_launch',
  'auth_bootstrap',
  'startup_loader_waiting',
  'startup_loader_hidden',
  'auth_invalid_refresh_token',
  'home_refresh',
]);

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
  launchId: string;
  timestamp: string;
}

type RpcCapableClient = {
  rpc: any;
};

const startupLaunchId = createStartupId();
let deviceInstallIdPromise: Promise<string> | null = null;
let flushPromise: Promise<void> | null = null;
let flushRequestedWhileBusy = false;
const lastTrackedAtBySignature = new Map<string, number>();

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
    flushRequestedWhileBusy = true;
    return flushPromise;
  }

  const runFlush = async () => {
    try {
      const queue = await readStartupTelemetryQueue();
      if (!queue.length) return;

      const deviceInstallId = await getDeviceInstallId();
      let sentCount = 0;

      for (const event of queue) {
        const { error } = await client.rpc('log_startup_telemetry', {
          p_device_install_id: deviceInstallId,
          p_launch_id: event.launchId,
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
    }
  };

  flushPromise = runFlush();

  try {
    await flushPromise;
  } finally {
    flushPromise = null;
  }

  if (flushRequestedWhileBusy) {
    flushRequestedWhileBusy = false;
    return flushStartupTelemetry(client);
  }
}

async function enqueueStartupTelemetryEvent(event: StartupTelemetryEventInput) {
  const queuedEvent = createQueuedEvent(event);
  if (shouldThrottleEvent(queuedEvent)) {
    return;
  }

  const queue = await readStartupTelemetryQueue();
  const nextQueue = trimStartupTelemetryQueue([...queue, queuedEvent]);

  await persistStartupTelemetryQueue(nextQueue);
}

async function readStartupTelemetryQueue(): Promise<StartupTelemetryQueuedEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STARTUP_TELEMETRY_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeQueuedEvent(entry))
      .filter((entry): entry is StartupTelemetryQueuedEvent => entry !== null);
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

function createQueuedEvent(event: StartupTelemetryEventInput): StartupTelemetryQueuedEvent {
  return {
    ...event,
    launchId: startupLaunchId,
    timestamp: new Date().toISOString(),
  };
}

function normalizeQueuedEvent(input: any): StartupTelemetryQueuedEvent | null {
  if (!input || typeof input !== 'object') return null;
  const eventName = typeof input.eventName === 'string' ? input.eventName.trim() : '';
  const timestamp = typeof input.timestamp === 'string' ? input.timestamp.trim() : '';
  if (!eventName || !timestamp) return null;

  const launchId =
    typeof input.launchId === 'string' && input.launchId.trim().length > 0
      ? input.launchId.trim()
      : startupLaunchId;

  return {
    eventName,
    status: typeof input.status === 'string' ? input.status : null,
    route: typeof input.route === 'string' ? input.route : null,
    metadata: isStartupTelemetryJsonValue(input.metadata) ? input.metadata : null,
    launchId,
    timestamp,
  };
}

function trimStartupTelemetryQueue(queue: StartupTelemetryQueuedEvent[]) {
  if (queue.length <= STARTUP_TELEMETRY_MAX_QUEUE_SIZE) {
    return queue;
  }

  const indexed = queue.map((event, index) => ({
    event,
    index,
    priority: getStartupTelemetryPriority(event.eventName),
  }));

  while (indexed.length > STARTUP_TELEMETRY_MAX_QUEUE_SIZE) {
    let removeAt = 0;

    for (let index = 1; index < indexed.length; index += 1) {
      const candidate = indexed[index];
      const current = indexed[removeAt];
      if (candidate.priority < current.priority) {
        removeAt = index;
        continue;
      }
      if (candidate.priority === current.priority && candidate.index < current.index) {
        removeAt = index;
      }
    }

    indexed.splice(removeAt, 1);
  }

  return indexed
    .sort((left, right) => left.index - right.index)
    .map(({ event }) => event);
}

function shouldThrottleEvent(event: StartupTelemetryQueuedEvent) {
  if (!LOW_PRIORITY_EVENT_NAMES.has(event.eventName)) {
    return false;
  }

  const now = Date.now();
  const signature = [
    event.launchId,
    event.eventName,
    event.status ?? '',
    event.route ?? '',
  ].join('::');
  const previousTrackedAt = lastTrackedAtBySignature.get(signature);

  if (
    typeof previousTrackedAt === 'number' &&
    now - previousTrackedAt < STARTUP_TELEMETRY_LOW_PRIORITY_THROTTLE_MS
  ) {
    return true;
  }

  lastTrackedAtBySignature.set(signature, now);
  return false;
}

function getStartupTelemetryPriority(eventName: string) {
  if (LOW_PRIORITY_EVENT_NAMES.has(eventName)) {
    return 0;
  }
  if (CRITICAL_EVENT_NAMES.has(eventName)) {
    return 2;
  }
  return 1;
}

function isStartupTelemetryJsonValue(value: unknown): value is StartupTelemetryJson {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isStartupTelemetryJsonValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === 'undefined' || isStartupTelemetryJsonValue(entry)
  );
}
