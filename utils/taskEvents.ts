type TaskCompletionListener = (payload: TaskCompletionEvent) => void;

export interface TaskCompletionEvent {
  activityId: string;
  taskId: string;
  completed: boolean;
}

class TaskEventBus {
  private listeners = new Set<TaskCompletionListener>();

  emit(event: TaskCompletionEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[taskEvents] listener failed:', error);
      }
    });
  }

  subscribe(listener: TaskCompletionListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const taskEventBus = new TaskEventBus();

export function emitTaskCompletionEvent(event: TaskCompletionEvent) {
  taskEventBus.emit(event);
}

export function subscribeToTaskCompletion(listener: TaskCompletionListener) {
  return taskEventBus.subscribe(listener);
}
