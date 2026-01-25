export type EntitlementVersionListener = (reason?: string) => void;

const listeners = new Set<EntitlementVersionListener>();

export function subscribeToEntitlementVersion(listener: EntitlementVersionListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function unsubscribeFromEntitlementVersion(listener: EntitlementVersionListener) {
  listeners.delete(listener);
}

export function bumpEntitlementsVersion(reason = 'external') {
  for (const listener of listeners) {
    try {
      listener(reason);
    } catch (error) {
      console.warn('[entitlementsEvents] Listener failed', error, { reason });
    }
  }
}
