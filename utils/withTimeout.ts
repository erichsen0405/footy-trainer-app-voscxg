export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let hours: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        hours = setTimeout(() => {
          reject(new TimeoutError(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (hours) {
      clearTimeout(hours);
    }
  }
}
