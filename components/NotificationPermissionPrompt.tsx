import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated, Easing, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { colors } from '@/styles/commonStyles';
import { requestNotificationPermissions, openNotificationSettings } from '@/utils/notificationService';

const STORAGE_KEY = '@notification_prompt_state_v1';

type PromptState = {
  dismissed: boolean;
  lastDecisionAt: number;
};

const defaultState: PromptState = { dismissed: false, lastDecisionAt: 0 };

/**
 * Non-blocking iOS pre-prompt shown shortly after first paint.
 * - Never auto-requests permission; only triggered by user tap.
 * - Persists dismissal so we don't nag.
 * - Provides Settings deep link when already denied.
 */
export default function NotificationPermissionPrompt() {
  const [loaded, setLoaded] = useState(false);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<Notifications.PermissionStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const stateRef = useRef<PromptState>(defaultState);
  const opacity = useRef(new Animated.Value(0)).current;
  const mountedRef = useRef(true);

  const isIOS = Platform.OS === 'ios';

  const refreshPermissions = useCallback(
    async (stateOverride?: PromptState) => {
      if (!isIOS || !mountedRef.current) return;

      const perms = await Notifications.getPermissionsAsync();
      if (!mountedRef.current) return;

      setStatus(perms.status);

      const nextState = stateOverride ?? stateRef.current;
      const shouldShow = perms.status !== 'granted' && !nextState.dismissed;
      setShow(shouldShow);
    },
    [isIOS]
  );

  useEffect(() => {
    if (!isIOS) return;

    (async () => {
      try {
        const storedRaw = await AsyncStorage.getItem(STORAGE_KEY);
        const stored = storedRaw ? (JSON.parse(storedRaw) as PromptState) : defaultState;
        stateRef.current = stored;
        setDismissed(stored.dismissed);

        await refreshPermissions(stored);
      } finally {
        if (mountedRef.current) setLoaded(true);
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [isIOS, refreshPermissions]);

  useEffect(() => {
    if (!isIOS) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshPermissions();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isIOS, refreshPermissions]);

  useEffect(() => {
    if (!show) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [opacity, show]);

  const persist = useCallback(async (next: PromptState) => {
    stateRef.current = next;
    setDismissed(next.dismissed);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const hide = useCallback(async () => {
    await persist({ dismissed: true, lastDecisionAt: Date.now() });
    setShow(false);
  }, [persist]);

  const handleAllow = useCallback(async () => {
    const granted = await requestNotificationPermissions();
    const { status: latest } = await Notifications.getPermissionsAsync();
    setStatus(latest);

    if (granted) {
      await hide();
    } else {
      await persist({ dismissed: false, lastDecisionAt: Date.now() });
      setShow(true);
    }
  }, [hide, persist]);

  const handleLater = useCallback(async () => {
    await hide();
  }, [hide]);

  const handleOpenSettings = useCallback(async () => {
    await openNotificationSettings();
    await persist({ dismissed: true, lastDecisionAt: Date.now() });
    setShow(false);
  }, [persist]);

  const shouldRender = isIOS && loaded && show;
  const canShowCta = isIOS && loaded && !show && status !== 'granted' && dismissed;

  const reopen = useCallback(async () => {
    await persist({ dismissed: false, lastDecisionAt: Date.now() });
    setShow(true);
  }, [persist]);

  const statusLabel = useMemo(() => {
    if (status === 'denied') return 'Notifikationer er slået fra';
    if (status === 'granted') return 'Notifikationer er aktiveret';
    return 'Få påmindelser om dine opgaver';
  }, [status]);

  if (shouldRender) {
    return (
      <Animated.View style={[styles.container, { opacity }]}>
        <View style={styles.card}>
          <Text style={styles.title}>Tillad notifikationer</Text>
          <Text style={styles.subtitle}>{statusLabel}</Text>

          <View style={styles.buttons}>
            {status === 'denied' ? (
              <TouchableOpacity style={[styles.button, styles.primary]} onPress={handleOpenSettings}>
                <Text style={styles.primaryText}>Åbn indstillinger</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.button, styles.primary]} onPress={handleAllow}>
                <Text style={styles.primaryText}>Tillad notifikationer</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.button, styles.secondary]} onPress={handleLater}>
              <Text style={styles.secondaryText}>Ikke nu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  }

  if (canShowCta) {
    return (
      <View style={styles.ctaContainer}>
        <TouchableOpacity style={styles.ctaButton} onPress={reopen}>
          <Text style={styles.ctaText}>Aktiver notifikationer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 4,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 18,
    padding: 18,
    backgroundColor: colors.card ?? '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 6, color: colors.text ?? '#111' },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary ?? '#444' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary ?? '#2563EB' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: {
    borderWidth: 1,
    borderColor: colors.textSecondary ?? '#444',
  },
  secondaryText: {
    color: colors.text ?? '#111',
    fontSize: 15,
    fontWeight: '700',
  },
  ctaContainer: {
    position: 'absolute',
    top: 70,
    right: 16,
    zIndex: 900,
    elevation: 2,
  },
  ctaButton: {
    backgroundColor: colors.primary ?? '#2563EB',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
