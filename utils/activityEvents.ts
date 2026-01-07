export interface ActivityPatchEvent {
  activityId: string;
  updates: Record<string, any>;
}

type ActivityPatchListener = (event: ActivityPatchEvent) => void;

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

export function emitActivityPatch(event: ActivityPatchEvent) {
  activityEventBus.emit(event);
}

export function subscribeToActivityPatch(listener: ActivityPatchListener) {
  return activityEventBus.subscribe(listener);
}
