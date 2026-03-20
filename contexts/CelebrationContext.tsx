import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { NativeModulesProxy } from 'expo-modules-core';
import * as Haptics from 'expo-haptics';
import {
  IOSLastTaskCelebrationView,
  getIOSLastTaskCelebrationDiagnostics,
  hasIOSLastTaskCelebrationView,
} from '@/components/IOSLastTaskCelebrationView';
import {
  IOSPremiumConfettiView,
  getIOSPremiumConfettiDiagnostics,
  hasIOSPremiumConfettiView,
} from '@/components/IOSPremiumConfettiView';
import { CelebrationType } from '@/utils/celebration';

type ShowCelebrationInput = {
  type: CelebrationType;
  completedToday?: number;
  totalToday?: number;
  remainingToday?: number;
};

type CelebrationContextValue = {
  showCelebration: (input: ShowCelebrationInput) => void;
};

type ActiveCelebration = {
  id: number;
  type: CelebrationType;
  completedToday?: number;
  totalToday?: number;
  remainingToday?: number;
};

type CelebrationMessage = {
  title: string;
  subtitle?: string;
  progressLine?: string;
};

type CelebrationSound = {
  loadAsync: (
    source: any,
    initialStatus?: { shouldPlay?: boolean; isLooping?: boolean; volume?: number }
  ) => Promise<unknown>;
  unloadAsync: () => Promise<unknown>;
  replayAsync: () => Promise<unknown>;
  setPositionAsync: (positionMillis: number) => Promise<unknown>;
  playAsync: () => Promise<unknown>;
};

type CelebrationRuntimeDebugModule = {
  collectStatus: () => Promise<Record<string, unknown>>;
};

type AudioModuleLike = {
  setAudioModeAsync: (mode: {
    allowsRecordingIOS: boolean;
    playsInSilentModeIOS: boolean;
    staysActiveInBackground: boolean;
    shouldDuckAndroid: boolean;
    playThroughEarpieceAndroid: boolean;
  }) => Promise<unknown>;
  Sound: new () => CelebrationSound;
};

type ConfettiPiece = {
  key: string;
  leftPercent: number;
  startTop: number;
  driftX: number;
  dropY: number;
  rotateDeg: number;
  delayMs: number;
  size: number;
  color: string;
};

type FireworkRocket = {
  key: string;
  leftPercent: number;
  delayMs: number;
  color: string;
};

type FountainSpark = {
  key: string;
  side: 'left' | 'right';
  delayMs: number;
  driftX: number;
  riseY: number;
  color: string;
  size: number;
};

const TASK_DURATION_MS = 4000;
const DAY_COMPLETE_DURATION_MS = 5100;
const COOLDOWN_MS = 1200;
const CONFETTI_COLORS = ['#33b1ff', '#4cd97b', '#f6c445', '#ff7f50', '#9b6dff', '#20b2aa'];
const CELEBRATION_INTENSITY_MULTIPLIER = 4;
const TASK_SOUND_SOURCE = require('../assets/sounds/celebration-task.mp3');
const DAY_COMPLETE_SOUND_SOURCE = require('../assets/sounds/celebration-day-complete.mp3');

const DISABLE_CELEBRATIONS =
  process.env.EXPO_PUBLIC_E2E_DISABLE_CELEBRATIONS === '1' ||
  process.env.E2E_DISABLE_CELEBRATIONS === '1';
const ENABLE_CELEBRATION_AUDIO =
  process.env.NODE_ENV !== 'test' &&
  process.env.EXPO_PUBLIC_ENABLE_CELEBRATION_AUDIO !== '0';
const PLAY_IN_SILENT_MODE_IOS = process.env.EXPO_PUBLIC_CELEBRATION_AUDIO_IN_SILENT_IOS === '1';
const SHOW_CELEBRATION_DEBUG = false;
const FORCE_LEGACY_IOS_CELEBRATIONS = process.env.EXPO_PUBLIC_FORCE_LEGACY_IOS_CELEBRATIONS === '1';

const CelebrationContext = createContext<CelebrationContextValue>({
  showCelebration: () => {},
});

function resolveCelebrationRuntimeDebugModule(): CelebrationRuntimeDebugModule | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  const candidate = (NativeModules as Record<string, unknown>).IOSCelebrationRuntimeDebug as
    | Partial<CelebrationRuntimeDebugModule>
    | undefined;

  if (!candidate || typeof candidate.collectStatus !== 'function') {
    return null;
  }

  return candidate as CelebrationRuntimeDebugModule;
}

function toDebugBit(value: unknown): '1' | '0' {
  return value ? '1' : '0';
}

function buildRuntimeDebugSummary(status: Record<string, unknown>): string {
  return [
    `nativeMod=1`,
    `providerCls=${toDebugBit(status.thirdPartyProviderClassAvailable)}`,
    `providerFn=${toDebugBit(status.thirdPartyProviderResponds)}`,
    `provider=${toDebugBit(status.thirdPartyProviderAvailable)}`,
    `pComp=${toDebugBit(status.premiumComponentViewClassAvailable)}`,
    `pContent=${toDebugBit(status.premiumContentViewClassAvailable)}`,
    `pManager=${toDebugBit(status.premiumManagerClassAvailable)}`,
    `pMap=${toDebugBit(status.premiumProviderMapped)}`,
    `lComp=${toDebugBit(status.lastTaskComponentViewClassAvailable)}`,
    `lContent=${toDebugBit(status.lastTaskContentViewClassAvailable)}`,
    `lManager=${toDebugBit(status.lastTaskManagerClassAvailable)}`,
    `lMap=${toDebugBit(status.lastTaskProviderMapped)}`,
  ].join(' ');
}

function resolveAudioModule(): AudioModuleLike | null {
  const nativeModules = (NativeModulesProxy ?? {}) as Record<string, unknown>;
  const hasNativeAudioModule = Boolean(nativeModules.ExponentAV || nativeModules.ExpoAV);
  if (!hasNativeAudioModule) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('expo-av');
    const audio = module?.Audio;
    if (!audio || typeof audio.setAudioModeAsync !== 'function' || typeof audio.Sound !== 'function') {
      return null;
    }
    return audio as AudioModuleLike;
  } catch {
    return null;
  }
}

function buildConfetti(seed: number, type: CelebrationType): ConfettiPiece[] {
  const pieceCount = (type === 'dayComplete' ? 78 : 24) * CELEBRATION_INTENSITY_MULTIPLIER;
  const pieces: ConfettiPiece[] = [];

  for (let index = 0; index < pieceCount; index += 1) {
    const n = seed + index * 17;
    const dayCompleteCenterBand = type === 'dayComplete' && index % 5 === 0;
    const leftPercent = dayCompleteCenterBand ? 35 + ((n * 13) % 30) : ((n * 37) % 86) + 7;
    const startTop = type === 'dayComplete' ? (index % 3 === 0 ? -70 : index % 3 === 1 ? -30 : 12) : 46;
    const driftX = ((n % 19) - 9) * (type === 'dayComplete' ? 8.4 : 4.5);
    const dropY = (type === 'dayComplete' ? 330 : 165) + ((n % 11) * 17);
    const rotateDeg = ((n * 23) % 280) - 140;
    const delayMs = (n % (type === 'dayComplete' ? 12 : 8)) * 26;
    const size = type === 'dayComplete' ? 8 + (n % 5) : 5 + (n % 3);
    const color = CONFETTI_COLORS[n % CONFETTI_COLORS.length];

    pieces.push({
      key: `piece-${seed}-${index}`,
      leftPercent,
      startTop,
      driftX,
      dropY,
      rotateDeg,
      delayMs,
      size,
      color,
    });
  }

  return pieces;
}

function buildFireworkRockets(seed: number, type: CelebrationType): FireworkRocket[] {
  const rockets: FireworkRocket[] = [];
  const count = 5 * CELEBRATION_INTENSITY_MULTIPLIER;

  for (let index = 0; index < count; index += 1) {
    const n = seed + index * 31;
    rockets.push({
      key: `rocket-${seed}-${index}`,
      leftPercent: type === 'dayComplete' ? 8 + ((n * 19) % 84) : 14 + ((n * 19) % 72),
      delayMs: (type === 'dayComplete' ? 70 : 55) + (index * (type === 'dayComplete' ? 38 : 30)),
      color: CONFETTI_COLORS[n % CONFETTI_COLORS.length],
    });
  }

  return rockets;
}

function buildFountainSparks(seed: number, type: CelebrationType): FountainSpark[] {
  const sparks: FountainSpark[] = [];
  const countPerSide = (type === 'dayComplete' ? 14 : 8) * CELEBRATION_INTENSITY_MULTIPLIER;

  for (let index = 0; index < countPerSide * 2; index += 1) {
    const n = seed + index * 23;
    const side: 'left' | 'right' = index % 2 === 0 ? 'left' : 'right';
    const direction = side === 'left' ? 1 : -1;
    sparks.push({
      key: `fountain-${seed}-${index}`,
      side,
      delayMs: (type === 'dayComplete' ? 120 : 80) + ((index % countPerSide) * (type === 'dayComplete' ? 9 : 7)),
      driftX: direction * ((type === 'dayComplete' ? 24 : 18) + ((n % 7) * (type === 'dayComplete' ? 8 : 5))),
      riseY: (type === 'dayComplete' ? 84 : 58) + ((n % 9) * (type === 'dayComplete' ? 13 : 8)),
      color: CONFETTI_COLORS[n % CONFETTI_COLORS.length],
      size: (type === 'dayComplete' ? 7 : 5) + (n % (type === 'dayComplete' ? 6 : 4)),
    });
  }

  return sparks;
}

function normalizeCount(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function resolveCelebrationMessage(celebration: ActiveCelebration): CelebrationMessage {
  const totalToday = normalizeCount(celebration.totalToday);
  const completedToday = normalizeCount(celebration.completedToday);
  const remainingToday = normalizeCount(celebration.remainingToday);

  if (celebration.type === 'dayComplete') {
    return {
      title: 'Dagens opgaver fuldført',
      subtitle: 'Nyd resten af dagen.',
      progressLine:
        totalToday && completedToday !== null ? `I dag: ${completedToday}/${totalToday}` : undefined,
    };
  }

  if (totalToday && completedToday !== null && remainingToday !== null) {
    return {
      title: 'Opgave fuldført',
      subtitle: remainingToday > 0 ? `${remainingToday} tilbage i dag` : `I dag: ${completedToday}/${totalToday}`,
      progressLine: remainingToday > 0 ? `I dag: ${completedToday}/${totalToday}` : undefined,
    };
  }

  return {
    title: 'Opgave fuldført',
    subtitle: 'Godt arbejde.',
  };
}

function CelebrationOverlay({
  celebration,
  reduceMotionEnabled,
  onStart,
  onDismiss,
}: {
  celebration: ActiveCelebration;
  reduceMotionEnabled: boolean;
  onStart: (celebration: ActiveCelebration) => void;
  onDismiss: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [runtimeDebugInfo, setRuntimeDebugInfo] = useState('');
  const isDayComplete = celebration.type === 'dayComplete';
  const durationMs = isDayComplete ? DAY_COMPLETE_DURATION_MS : TASK_DURATION_MS;
  const message = useMemo(() => resolveCelebrationMessage(celebration), [celebration]);
  const premiumConfettiDiagnostics = useMemo(() => getIOSPremiumConfettiDiagnostics(), []);
  const dayCompleteDiagnostics = useMemo(() => getIOSLastTaskCelebrationDiagnostics(), []);
  const shouldAttemptNativeConfetti =
    Platform.OS === 'ios' && !FORCE_LEGACY_IOS_CELEBRATIONS;
  const shouldAttemptNativeDayComplete =
    isDayComplete && Platform.OS === 'ios' && !FORCE_LEGACY_IOS_CELEBRATIONS;
  const debugNativeConfettiAvailable = hasIOSPremiumConfettiView();
  const debugNativeDayCompleteAvailable = hasIOSLastTaskCelebrationView();
  const debugInfo = useMemo(() => {
    if (!SHOW_CELEBRATION_DEBUG) {
      return '';
    }

    const nativeMode = shouldAttemptNativeDayComplete
      ? 'native-day'
      : shouldAttemptNativeConfetti
        ? 'native-confetti'
        : 'legacy';

    return [
      `type=${celebration.type}`,
      `mode=${nativeMode}`,
      `reduce=${reduceMotionEnabled ? 1 : 0}`,
      `fabric=${premiumConfettiDiagnostics.fabricEnabled ? 1 : 0}`,
      `bridgeless=${premiumConfettiDiagnostics.bridgelessEnabled ? 1 : 0}`,
      `confettiVM=${premiumConfettiDiagnostics.viewManagerConfigAvailable ? 1 : 0}`,
      `dayVM=${dayCompleteDiagnostics.viewManagerConfigAvailable ? 1 : 0}`,
      `confettiReady=${debugNativeConfettiAvailable ? 1 : 0}`,
      `dayReady=${debugNativeDayCompleteAvailable ? 1 : 0}`,
      runtimeDebugInfo,
    ].join(' ');
  }, [
    celebration.type,
    dayCompleteDiagnostics.viewManagerConfigAvailable,
    debugNativeConfettiAvailable,
    debugNativeDayCompleteAvailable,
    premiumConfettiDiagnostics.bridgelessEnabled,
    premiumConfettiDiagnostics.fabricEnabled,
    premiumConfettiDiagnostics.viewManagerConfigAvailable,
    reduceMotionEnabled,
    runtimeDebugInfo,
    shouldAttemptNativeConfetti,
    shouldAttemptNativeDayComplete,
  ]);

  useEffect(() => {
    onStart(celebration);
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [celebration, celebration.id, celebration.type, durationMs, onStart, progress]);

  useEffect(() => {
    if (!SHOW_CELEBRATION_DEBUG) {
      return;
    }

    console.log('[celebration-debug]', debugInfo);
  }, [debugInfo]);

  useEffect(() => {
    if (!SHOW_CELEBRATION_DEBUG || Platform.OS !== 'ios') {
      setRuntimeDebugInfo('');
      return;
    }

    const module = resolveCelebrationRuntimeDebugModule();
    if (!module) {
      setRuntimeDebugInfo('nativeMod=0');
      return;
    }

    let cancelled = false;

    module
      .collectStatus()
      .then((status) => {
        if (cancelled) return;
        const summary = buildRuntimeDebugSummary(status);
        setRuntimeDebugInfo(summary);
        console.log('[celebration-native-runtime-debug]', status);
      })
      .catch((error) => {
        if (cancelled) return;
        setRuntimeDebugInfo('nativeMod=err');
        console.warn('[celebration-native-runtime-debug] failed', error);
      });

    return () => {
      cancelled = true;
    };
  }, [celebration.id]);

  const pieces = useMemo(
    () => (reduceMotionEnabled ? [] : buildConfetti(celebration.id, celebration.type)),
    [celebration.id, celebration.type, reduceMotionEnabled]
  );
  const fireworkRockets = useMemo(
    () => (reduceMotionEnabled ? [] : buildFireworkRockets(celebration.id, celebration.type)),
    [celebration.id, celebration.type, reduceMotionEnabled]
  );
  const fountainSparks = useMemo(
    () => (reduceMotionEnabled ? [] : buildFountainSparks(celebration.id + 99, celebration.type)),
    [celebration.id, celebration.type, reduceMotionEnabled]
  );

  const checkScale = progress.interpolate({
    inputRange: [0, 0.22, 0.62, 1],
    outputRange: isDayComplete ? [0.64, 1.34, 1.06, 1] : [0.72, 1.18, 1, 0.96],
  });

  const checkOpacity = progress.interpolate({
    inputRange: [0, 0.08, 0.95, 1],
    outputRange: [0, 1, 1, 0],
  });

  const glowScale = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: isDayComplete ? [0.6, 1.2, 1.55] : [0.7, 1.05, 1.2],
  });

  const glowOpacity = progress.interpolate({
    inputRange: [0, 0.2, 0.85, 1],
    outputRange: isDayComplete ? [0, 0.36, 0.2, 0] : [0, 0.18, 0.1, 0],
  });

  const overlayOpacity = progress.interpolate({
    inputRange: [0, 0.12, 0.88, 1],
    outputRange: isDayComplete ? [0, 0.2, 0.2, 0] : [0, 0.08, 0.08, 0],
  });

  const messageOpacity = progress.interpolate({
    inputRange: [0, 0.12, 0.93, 1],
    outputRange: [0, 1, 1, 0],
  });

  const messageTranslateY = progress.interpolate({
    inputRange: [0, 0.12, 1],
    outputRange: [12, 0, -4],
  });
  const renderNativeConfetti = shouldAttemptNativeConfetti && !shouldAttemptNativeDayComplete;
  const renderLegacyConfetti = !shouldAttemptNativeConfetti && !shouldAttemptNativeDayComplete;
  const renderLegacyFireworks = !shouldAttemptNativeDayComplete && !renderNativeConfetti;

  return (
    <View style={styles.overlayWrap} pointerEvents="box-none" testID="celebration-overlay">
      <Text style={styles.srOnly} testID="celebration-overlay.type">
        {celebration.type}
      </Text>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.dimBackground, { opacity: overlayOpacity }]} />

      {!reduceMotionEnabled ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          {shouldAttemptNativeDayComplete ? (
            <IOSLastTaskCelebrationView
              burstKey={celebration.id}
              debugEnabled={SHOW_CELEBRATION_DEBUG}
              debugInfo={debugInfo}
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
            <>
              {renderNativeConfetti ? (
                <IOSPremiumConfettiView
                  burstKey={celebration.id}
                  debugEnabled={SHOW_CELEBRATION_DEBUG}
                  debugInfo={debugInfo}
                  style={StyleSheet.absoluteFillObject}
                  variant={celebration.type}
                />
              ) : renderLegacyConfetti ? pieces.map((piece) => {
                  const opacity = progress.interpolate({
                    inputRange: [0, 0.08, 0.9, 1],
                    outputRange: [0, 1, 1, 0],
                  });

                  const translateY = progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [celebration.type === 'dayComplete' ? -24 : -12, piece.dropY],
                  });

                  const translateX = progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, piece.driftX],
                  });

                  const rotate = progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${piece.rotateDeg}deg`],
                  });

                  return (
                    <Animated.View
                      key={piece.key}
                      style={[
                        styles.confettiPiece,
                        {
                          left: `${piece.leftPercent}%`,
                          top: piece.startTop,
                          backgroundColor: piece.color,
                          width: piece.size,
                          height: piece.size * 0.56,
                          opacity,
                          transform: [{ translateX }, { translateY }, { rotate }],
                        },
                      ]}
                    />
                  );
                }) : null}

              {renderLegacyFireworks ? fireworkRockets.map((rocket) => {
                const start = rocket.delayMs / durationMs;
                const apex = Math.min(start + (isDayComplete ? 0.18 : 0.16), 0.9);
                const vanish = Math.min(apex + 0.08, 0.98);

                const rocketOpacity = progress.interpolate({
                  inputRange: [0, start, apex, vanish, 1],
                  outputRange: [0, 0, 1, 0, 0],
                });

                const rocketTranslateY = progress.interpolate({
                  inputRange: [0, start, apex, 1],
                  outputRange: [0, 0, isDayComplete ? -320 : -250, isDayComplete ? -320 : -250],
                });

                const burstOpacity = progress.interpolate({
                  inputRange: [0, apex, Math.min(apex + 0.1, 0.98), 1],
                  outputRange: [0, 0, 0.95, 0],
                });

                const burstScale = progress.interpolate({
                  inputRange: [0, apex, Math.min(apex + 0.15, 0.99), 1],
                  outputRange: [0.25, 0.25, isDayComplete ? 2.05 : 1.7, isDayComplete ? 2.35 : 1.95],
                });

                const coreOpacity = progress.interpolate({
                  inputRange: [0, apex, Math.min(apex + 0.06, 0.97), 1],
                  outputRange: [0, 0, 1, 0],
                });

                const coreScale = progress.interpolate({
                  inputRange: [0, apex, Math.min(apex + 0.13, 0.99), 1],
                  outputRange: [0.2, 0.2, isDayComplete ? 2.3 : 1.85, isDayComplete ? 2.8 : 2.2],
                });

                const flameOpacity = progress.interpolate({
                  inputRange: [0, start, apex, 1],
                  outputRange: [0, 0.95, 0.2, 0],
                });

                const burstTranslateY = progress.interpolate({
                  inputRange: [0, start, apex, 1],
                  outputRange: [0, 0, isDayComplete ? -320 : -250, isDayComplete ? -320 : -250],
                });

                  return (
                    <React.Fragment key={rocket.key}>
                      <Animated.View
                        testID="celebration-rocket"
                        style={[
                          styles.rocketWrap,
                          !isDayComplete && styles.rocketWrapTask,
                          {
                            left: `${rocket.leftPercent}%`,
                            opacity: rocketOpacity,
                            transform: [{ translateY: rocketTranslateY }],
                          },
                        ]}
                      >
                        <View style={[styles.rocketBody, { backgroundColor: rocket.color }]} />
                        <View style={[styles.rocketHead, { borderBottomColor: rocket.color }]} />
                        <Animated.View style={[styles.rocketFlame, { opacity: flameOpacity }]} />
                      </Animated.View>

                      <Animated.View
                        style={[
                          styles.burstRing,
                          !isDayComplete && styles.burstRingTask,
                          {
                            left: `${rocket.leftPercent}%`,
                            opacity: burstOpacity,
                            borderColor: rocket.color,
                            transform: [{ translateY: burstTranslateY }, { scale: burstScale }],
                          },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.burstCore,
                          !isDayComplete && styles.burstCoreTask,
                          {
                            left: `${rocket.leftPercent}%`,
                            backgroundColor: rocket.color,
                            opacity: coreOpacity,
                            transform: [{ translateY: burstTranslateY }, { scale: coreScale }],
                          },
                        ]}
                      />
                    </React.Fragment>
                  );
                }) : null}

              {renderLegacyFireworks ? (
                <>
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.fountainEmitter, styles.fountainEmitterLeft, !isDayComplete && styles.fountainEmitterTask, { opacity: overlayOpacity }]}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.fountainEmitter, styles.fountainEmitterRight, !isDayComplete && styles.fountainEmitterTask, { opacity: overlayOpacity }]}
                  />
                </>
              ) : null}

              {renderLegacyFireworks ? fountainSparks.map((spark) => {
                const start = spark.delayMs / durationMs;
                const peak = Math.min(start + (isDayComplete ? 0.2 : 0.15), 0.92);
                const end = Math.min(peak + (isDayComplete ? 0.16 : 0.12), 0.995);

                const sparkOpacity = progress.interpolate({
                  inputRange: [0, start, peak, end, 1],
                  outputRange: [0, 0, isDayComplete ? 0.95 : 0.88, 0, 0],
                });

                const sparkTranslateX = progress.interpolate({
                  inputRange: [0, start, peak, end, 1],
                  outputRange: [0, 0, spark.driftX, spark.driftX * 1.15, spark.driftX * 1.15],
                });

                const sparkTranslateY = progress.interpolate({
                  inputRange: [0, start, peak, end, 1],
                  outputRange: [0, 0, -spark.riseY, 28, 28],
                });

                  return (
                    <Animated.View
                      testID="celebration-fountain"
                      key={spark.key}
                      style={[
                        styles.fountainSpark,
                        !isDayComplete && styles.fountainSparkTask,
                        {
                          left: spark.side === 'left' ? (isDayComplete ? '14%' : '16%') : undefined,
                          right: spark.side === 'right' ? (isDayComplete ? '14%' : '16%') : undefined,
                          backgroundColor: spark.color,
                          width: spark.size,
                          height: spark.size,
                          opacity: sparkOpacity,
                          transform: [{ translateX: sparkTranslateX }, { translateY: sparkTranslateY }],
                        },
                      ]}
                    />
                  );
                }) : null}
            </>
          )}
        </View>
      ) : null}

      {SHOW_CELEBRATION_DEBUG ? (
        <View pointerEvents="none" style={styles.debugBadge}>
          <Text style={styles.debugText}>{debugInfo}</Text>
        </View>
      ) : null}

      {shouldAttemptNativeDayComplete ? null : (
        <View pointerEvents="none" style={styles.centerWrap}>
          <Animated.View
            style={[
              styles.checkGlow,
              isDayComplete && styles.checkGlowDayComplete,
              { opacity: glowOpacity, transform: [{ scale: glowScale }] },
            ]}
          />
          <Animated.View
            style={[
              styles.checkBubble,
              isDayComplete && styles.checkBubbleDayComplete,
              { opacity: checkOpacity, transform: [{ scale: checkScale }] },
            ]}
          >
            <Text style={styles.checkText}>✓</Text>
          </Animated.View>
        </View>
      )}

      <View style={styles.messageWrap} pointerEvents="box-none" testID="celebration-message">
        {isDayComplete ? (
          <Pressable
            onPress={onDismiss}
            testID="celebration-dismiss"
            style={[styles.messageCard, styles.messageCardDayComplete]}
          >
            <Animated.View style={{ opacity: messageOpacity, transform: [{ translateY: messageTranslateY }] }}>
              <Text style={[styles.messageTitle, styles.messageTitleDayComplete]} testID="celebration-title">
                {message.title}
              </Text>
              {message.subtitle ? (
                <Text style={styles.messageSubtitle} testID="celebration-subtitle">
                  {message.subtitle}
                </Text>
              ) : null}
              {message.progressLine ? (
                <Text style={[styles.messageProgress, styles.messageProgressDayComplete]} testID="celebration-progress">
                  {message.progressLine}
                </Text>
              ) : null}
            </Animated.View>
          </Pressable>
        ) : (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.messageCard,
              styles.messageCardTask,
              { opacity: messageOpacity, transform: [{ translateY: messageTranslateY }] },
            ]}
          >
            <Text style={styles.messageTitle} testID="celebration-title">
              {message.title}
            </Text>
            {message.subtitle ? (
              <Text style={styles.messageSubtitle} testID="celebration-subtitle">
                {message.subtitle}
              </Text>
            ) : null}
            {message.progressLine ? (
              <Text style={styles.messageProgress} testID="celebration-progress">
                {message.progressLine}
              </Text>
            ) : null}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [activeCelebration, setActiveCelebration] = useState<ActiveCelebration | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const sequenceRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCelebrationAtRef = useRef(0);
  const activeCelebrationRef = useRef<ActiveCelebration | null>(null);
  const taskSoundRef = useRef<CelebrationSound | null>(null);
  const dayCompleteSoundRef = useRef<CelebrationSound | null>(null);
  const audioModuleRef = useRef<AudioModuleLike | null>(null);
  const warnedMissingAudioRef = useRef(false);
  const hapticsTimeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedCelebrationIdRef = useRef<number | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const clearHapticsTimers = useCallback(() => {
    hapticsTimeoutRefs.current.forEach((timeoutId) => clearTimeout(timeoutId));
    hapticsTimeoutRefs.current = [];
  }, []);

  const dismissCelebration = useCallback(() => {
    clearDismissTimer();
    startedCelebrationIdRef.current = null;
    activeCelebrationRef.current = null;
    setActiveCelebration(null);
  }, [clearDismissTimer]);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((isEnabled) => {
        if (mounted) setReduceMotionEnabled(Boolean(isEnabled));
      })
      .catch(() => {
        if (mounted) setReduceMotionEnabled(false);
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (isEnabled) => {
      setReduceMotionEnabled(Boolean(isEnabled));
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      clearDismissTimer();
      clearHapticsTimers();
    };
  }, [clearDismissTimer, clearHapticsTimers]);

  useEffect(() => {
    if (DISABLE_CELEBRATIONS || !ENABLE_CELEBRATION_AUDIO) return;

    let disposed = false;

    const unload = async () => {
      const sounds = [taskSoundRef.current, dayCompleteSoundRef.current].filter(Boolean) as CelebrationSound[];
      taskSoundRef.current = null;
      dayCompleteSoundRef.current = null;
      audioModuleRef.current = null;
      await Promise.all(sounds.map((sound) => sound.unloadAsync().catch(() => {})));
    };

    const load = async () => {
      try {
        const audioModule = resolveAudioModule();
        if (!audioModule) {
          if (__DEV__ && !warnedMissingAudioRef.current) {
            warnedMissingAudioRef.current = true;
            console.warn('[CelebrationProvider] expo-av native module unavailable; celebration sounds disabled');
          }
          return;
        }

        audioModuleRef.current = audioModule;

        await audioModule.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: PLAY_IN_SILENT_MODE_IOS,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const taskSound = new audioModule.Sound();
        const dayCompleteSound = new audioModule.Sound();

        await taskSound.loadAsync(TASK_SOUND_SOURCE, { shouldPlay: false, isLooping: false, volume: 1 });
        await dayCompleteSound.loadAsync(DAY_COMPLETE_SOUND_SOURCE, { shouldPlay: false, isLooping: false, volume: 1 });

        if (disposed) {
          await Promise.all([taskSound.unloadAsync().catch(() => {}), dayCompleteSound.unloadAsync().catch(() => {})]);
          return;
        }

        taskSoundRef.current = taskSound;
        dayCompleteSoundRef.current = dayCompleteSound;
      } catch (error) {
        if (__DEV__) {
          console.warn('[CelebrationProvider] Failed to preload celebration sounds', error);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
      void unload();
    };
  }, []);

  const playCelebrationSound = useCallback(async (type: CelebrationType) => {
    const sound = type === 'dayComplete' ? dayCompleteSoundRef.current : taskSoundRef.current;
    if (!sound) return;
    try {
      await sound.replayAsync();
    } catch {
      try {
        await sound.setPositionAsync(0);
        await sound.playAsync();
      } catch {
        // ignore audio playback failures
      }
    }
  }, []);

  const playCelebrationHaptics = useCallback(
    (type: CelebrationType) => {
      if (Platform.OS === 'web') return;

      clearHapticsTimers();

      if (type === 'dayComplete') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {
          Vibration.vibrate([0, 44, 36, 52], false);
        });

        const heavyPulse = setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {
            Vibration.vibrate(38);
          });
        }, 90);

        const mediumPulse = setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
            Vibration.vibrate(30);
          });
        }, 210);

        hapticsTimeoutRefs.current.push(heavyPulse, mediumPulse);
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
        Vibration.vibrate(18);
      });
    },
    [clearHapticsTimers]
  );

  const showCelebration = useCallback(
    (input: ShowCelebrationInput) => {
      if (DISABLE_CELEBRATIONS) return;

      const type = input?.type;
      if (type !== 'task' && type !== 'dayComplete') return;

      const now = Date.now();
      const active = activeCelebrationRef.current;
      if (type === 'task' && now - lastCelebrationAtRef.current < COOLDOWN_MS && active?.type !== 'dayComplete') {
        return;
      }

      if (type === 'dayComplete' && active?.type === 'dayComplete' && now - lastCelebrationAtRef.current < 650) {
        return;
      }

      sequenceRef.current += 1;
      const nextCelebration: ActiveCelebration = {
        id: sequenceRef.current,
        type,
        completedToday: normalizeCount(input?.completedToday) ?? undefined,
        totalToday: normalizeCount(input?.totalToday) ?? undefined,
        remainingToday: normalizeCount(input?.remainingToday) ?? undefined,
      };
      clearDismissTimer();
      startedCelebrationIdRef.current = null;
      activeCelebrationRef.current = nextCelebration;
      setActiveCelebration(nextCelebration);
      lastCelebrationAtRef.current = now;
    },
    [clearDismissTimer]
  );

  const startCelebration = useCallback(
    (celebration: ActiveCelebration) => {
      if (startedCelebrationIdRef.current === celebration.id) {
        return;
      }

      startedCelebrationIdRef.current = celebration.id;
      playCelebrationHaptics(celebration.type);
      void playCelebrationSound(celebration.type);

      clearDismissTimer();
      const duration = celebration.type === 'dayComplete' ? DAY_COMPLETE_DURATION_MS : TASK_DURATION_MS;
      timeoutRef.current = setTimeout(() => {
        if (activeCelebrationRef.current?.id !== celebration.id) return;
        startedCelebrationIdRef.current = null;
        activeCelebrationRef.current = null;
        setActiveCelebration(null);
      }, duration);
    },
    [clearDismissTimer, playCelebrationHaptics, playCelebrationSound]
  );

  const value = useMemo<CelebrationContextValue>(
    () => ({
      showCelebration,
    }),
    [showCelebration]
  );

  return (
    <CelebrationContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {activeCelebration
          ? Platform.OS === 'web'
            ? (
                <CelebrationOverlay
                  celebration={activeCelebration}
                  reduceMotionEnabled={reduceMotionEnabled}
                  onStart={startCelebration}
                  onDismiss={dismissCelebration}
                />
              )
            : (
                <Modal
                  visible
                  transparent
                  animationType="none"
                  statusBarTranslucent
                  presentationStyle="overFullScreen"
                  onRequestClose={dismissCelebration}
                >
                  <CelebrationOverlay
                    celebration={activeCelebration}
                    reduceMotionEnabled={reduceMotionEnabled}
                    onStart={startCelebration}
                    onDismiss={dismissCelebration}
                  />
                </Modal>
              )
          : null}
      </View>
    </CelebrationContext.Provider>
  );
}

export function useCelebration() {
  return useContext(CelebrationContext);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlayWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
  dimBackground: {
    backgroundColor: '#000',
  },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 217, 123, 0.95)',
    shadowColor: '#20a95f',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  checkBubbleDayComplete: {
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowOpacity: 0.56,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
  },
  checkGlow: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  checkGlowDayComplete: {
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: 'rgba(255, 255, 255, 0.36)',
  },
  checkText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 3,
  },
  rocketWrap: {
    position: 'absolute',
    bottom: -24,
    marginLeft: -5,
    alignItems: 'center',
    zIndex: 7,
  },
  rocketWrapTask: {
    bottom: -12,
  },
  rocketBody: {
    width: 8,
    height: 34,
    borderRadius: 4,
    shadowColor: '#fff',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  rocketHead: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
  },
  rocketFlame: {
    width: 10,
    height: 16,
    marginTop: 2,
    borderRadius: 999,
    backgroundColor: '#ffd166',
    shadowColor: '#ff9f1c',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  burstRing: {
    position: 'absolute',
    bottom: -55,
    marginLeft: -55,
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    zIndex: 8,
  },
  burstRingTask: {
    marginLeft: -44,
    width: 88,
    height: 88,
    bottom: -44,
    borderRadius: 44,
    borderWidth: 3,
  },
  burstCore: {
    position: 'absolute',
    bottom: -18,
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    zIndex: 9,
    shadowColor: '#fff',
    shadowOpacity: 0.75,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  burstCoreTask: {
    marginLeft: -14,
    width: 28,
    height: 28,
    bottom: -14,
    borderRadius: 14,
  },
  fountainSpark: {
    position: 'absolute',
    bottom: 22,
    borderRadius: 999,
    zIndex: 8,
    shadowColor: '#fff',
    shadowOpacity: 0.65,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  fountainSparkTask: {
    bottom: 14,
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  fountainEmitter: {
    position: 'absolute',
    bottom: 0,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 214, 102, 0.28)',
    borderWidth: 2,
    borderColor: 'rgba(255, 214, 102, 0.5)',
    shadowColor: '#ffd166',
    shadowOpacity: 0.95,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 7,
  },
  fountainEmitterLeft: {
    left: '10%',
  },
  fountainEmitterRight: {
    right: '10%',
  },
  fountainEmitterTask: {
    width: 52,
    height: 52,
    borderRadius: 26,
    bottom: 4,
  },
  debugBadge: {
    position: 'absolute',
    top: 18,
    left: 12,
    right: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.56)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    zIndex: 20,
  },
  debugText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
  messageWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 40,
    elevation: 40,
  },
  messageCard: {
    marginTop: 168,
    width: '78%',
    maxWidth: 420,
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingVertical: 18,
    backgroundColor: 'rgba(20,24,31,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  messageCardTask: {
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  messageCardDayComplete: {
    borderRadius: 26,
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
  },
  messageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 26,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  messageTitleDayComplete: {
    fontSize: 23,
    lineHeight: 28,
  },
  messageSubtitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
    textAlign: 'center',
  },
  messageProgress: {
    marginTop: 10,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  messageProgressDayComplete: {
    marginTop: 12,
  },
  srOnly: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
});
