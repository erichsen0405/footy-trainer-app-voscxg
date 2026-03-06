type StartupReadyListener = () => void;
type StartupProgressListener = (progress: number) => void;

let homeScreenReady = false;
const listeners = new Set<StartupReadyListener>();
let homeLoadProgress = 0;
const progressListeners = new Set<StartupProgressListener>();

const clampProgress = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

export const markHomeScreenReady = () => {
  if (homeScreenReady) return;
  homeScreenReady = true;
  setHomeLoadProgress(1);

  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Listener failures should never block startup.
    }
  });
};

export const isHomeScreenReady = () => homeScreenReady;

export const resetHomeScreenReady = () => {
  homeScreenReady = false;
  setHomeLoadProgress(0);
};

export const subscribeToHomeScreenReady = (listener: StartupReadyListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getHomeLoadProgress = () => homeLoadProgress;

export const setHomeLoadProgress = (progress: number) => {
  const next = clampProgress(progress);
  if (Math.abs(next - homeLoadProgress) < 0.0001) return;
  homeLoadProgress = next;

  progressListeners.forEach((listener) => {
    try {
      listener(homeLoadProgress);
    } catch {
      // Listener failures should never block startup.
    }
  });
};

export const subscribeToHomeLoadProgress = (listener: StartupProgressListener) => {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
};

export const isHomeStartupPath = (pathname?: string | null) => {
  const value = typeof pathname === 'string' ? pathname : '';
  return (
    value === '/' ||
    value === '/home' ||
    value === '/(tabs)' ||
    value.startsWith('/(tabs)/(home)')
  );
};
