export interface ActivityPatchEvent {
  activityId: string;
  updates: Record<string, any>;
}

type ActivityPatchListener = (event: ActivityPatchEvent) => void;

export interface ActivitiesRefreshRequestedEvent {
  reason?: string;
}

type ActivitiesRefreshListener = (event: ActivitiesRefreshRequestedEvent) => void;

let activitiesRefreshVersion = 0;
let lastActivitiesRefreshRequestedEvent: ActivitiesRefreshRequestedEvent = {};

class ActivityEventBus {
  private listeners = new Set<ActivityPatchListener>();

  emit(event: ActivityPatchEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[activityEvents] listener failed:', error);
      }
    });
  }

  subscribe(listener: ActivityPatchListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const activityEventBus = new ActivityEventBus();
const activitiesRefreshEventBus = new (class {
  private listeners = new Set<ActivitiesRefreshListener>();

  emit(event: ActivitiesRefreshRequestedEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[activityEvents] refresh listener failed:', error);
      }
    });
  }

  subscribe(listener: ActivitiesRefreshListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
})();

export function emitActivityPatch(event: ActivityPatchEvent) {
  activityEventBus.emit(event);
}

export function subscribeToActivityPatch(listener: ActivityPatchListener) {
  return activityEventBus.subscribe(listener);
}

export function emitActivitiesRefreshRequested(event: ActivitiesRefreshRequestedEvent = {}) {
  const payload = { ...event };
  lastActivitiesRefreshRequestedEvent = payload;
  activitiesRefreshVersion += 1;
  activitiesRefreshEventBus.emit(payload);
}

export function subscribeToActivitiesRefreshRequested(listener: ActivitiesRefreshListener) {
  return activitiesRefreshEventBus.subscribe(listener);
}

export function getActivitiesRefreshRequestedVersion() {
  return activitiesRefreshVersion;
}

export function getLastActivitiesRefreshRequestedEvent() {
  return lastActivitiesRefreshRequestedEvent;
}
