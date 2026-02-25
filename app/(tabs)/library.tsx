import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  Image,
  Modal,
  Platform,
  useColorScheme,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';
import { useFootball } from '@/contexts/FootballContext';
import { Task } from '@/types';
import { extractVideoKey, resolveVideoUrl } from '@/utils/videoKey';

type RootFolderId = 'personal' | 'trainer' | 'footballcoach';

type NavigationState = {
  root: RootFolderId | null;
  level2Id: string | null;
  level3Id: string | null;
};

type Exercise = {
  id: string;
  trainer_id: string | null;
  title: string;
  description: string | null;
  video_key: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_system: boolean | null;
  category_path: string | null;
  difficulty: number | null;
  "position": string | null;
  trainer_name?: string | null;
  last_score?: number | null;
  execution_count?: number | null;
  is_added_to_tasks?: boolean | null;
};

type ExerciseCounterOverride = {
  last_score: number | null;
  execution_count: number | null;
};

type FolderVM = {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  subtitle?: string;
  icon: { ios: string; android: string; color: string; bg: string };
  rightBadgeText?: string;
  chevron?: boolean;
  kind: RootFolderId | 'trainer' | 'footballcoach_category' | 'footballcoach_position';
  payload?: { root?: RootFolderId; level2Id?: string; level3Id?: string };
};

type LibrarySection =
  | { key: 'folders'; title?: string; data: FolderVM[] }
  | { key: 'exercises'; title?: string; data: Exercise[] };

const HOLDTRAINING_POSITIONS = [
  { id: 'holdtraening_faelles', name: 'Fælles (alle positioner)', icon: { ios: 'star.fill', android: 'star' } },
  { id: 'holdtraening_maalmand', name: 'Målmand', icon: { ios: 'hand.raised.fill', android: 'sports_soccer' } },
  { id: 'holdtraening_back', name: 'Back', icon: { ios: 'arrow.left.and.right.circle', android: 'swap_horiz' } },
  { id: 'holdtraening_midterforsvarer', name: 'Midterforsvarer', icon: { ios: 'shield.fill', android: 'shield' } },
  { id: 'holdtraening_central_midtbane', name: 'Central midtbane (6/8)', icon: { ios: 'circle.grid.cross.fill', android: 'grid_on' } },
  { id: 'holdtraening_offensiv_midtbane', name: 'Offensiv midtbane (10)', icon: { ios: 'sparkles', android: 'flare' } },
  { id: 'holdtraening_kant', name: 'Kant', icon: { ios: 'arrow.triangle.turn.up.right.circle.fill', android: 'open_with' } },
  { id: 'holdtraening_angriber', name: 'Angriber', icon: { ios: 'flame.fill', android: 'whatshot' } },
];

const FOOTBALLCOACH_STRUCTURE = [
  {
    id: 'holdtraening',
    name: 'Holdtræning',
    icon: { ios: 'person.3.fill', android: 'groups' },
    positions: HOLDTRAINING_POSITIONS,
  },
] as const;

const KNOWN_HOLDTRAINING_POSITION_IDS = new Set(HOLDTRAINING_POSITIONS.map(pos => pos.id));
const FOOTBALLCOACH_POS_NAME_BY_ID = new Map<string, string>(HOLDTRAINING_POSITIONS.map(pos => [pos.id, pos.name]));

const formatHoldtraeningSlug = (posId: string) =>
  posId
    .replace(/^holdtraening_/i, '')
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const getHoldtraeningPositionTitle = (posId: string) =>
  FOOTBALLCOACH_POS_NAME_BY_ID.get(posId) ?? `Andre: ${formatHoldtraeningSlug(posId)}`;

const buildHoldtraeningFolderVm = (posId: string, count: number): FolderVM => ({
  id: posId,
  level: 3,
  title: getHoldtraeningPositionTitle(posId),
  subtitle: `${count} øvelser`,
  rightBadgeText: String(count),
  icon: buildIcon('footballcoach_position'),
  chevron: true,
  kind: 'footballcoach_position',
  payload: { root: 'footballcoach', level2Id: 'holdtraening', level3Id: posId },
});

const clampDifficulty = (value: any): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
};

const formatLatestScoreLine = (lastScore?: number | null) =>
  typeof lastScore === 'number' ? `Senest: ${lastScore}/10` : 'Senest: –/10';

const formatExecutionCountLine = (executionCount?: number | null) =>
  typeof executionCount === 'number' && executionCount > 0 ? `Udført: ${executionCount}x` : 'Udført: –x';

const normalizeSignatureText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSignatureVideo = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const key = extractVideoKey(raw);
  return key ? key.toLowerCase() : raw.toLowerCase();
};

const buildExerciseSignature = (exercise: Pick<Exercise, 'title' | 'description' | 'video_key' | 'video_url'>): string => {
  const title = normalizeSignatureText(exercise.title);
  if (!title) return '';
  const description = normalizeSignatureText(exercise.description ?? '');
  const video = normalizeSignatureVideo(exercise.video_key || exercise.video_url);
  return `${title}::${description}::${video}`;
};

const buildTaskSignature = (task: Pick<Task, 'title' | 'description' | 'videoUrl'>): string => {
  const title = normalizeSignatureText(task.title);
  if (!title) return '';
  const description = normalizeSignatureText(task.description ?? '');
  const video = normalizeSignatureVideo(task.videoUrl);
  return `${title}::${description}::${video}`;
};

const CARD_SCENE_IMAGES = [
  'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1517747614396-d21a78b850e8?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1587329310686-91414b8e3cb7?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1434648957308-5e6a859697e8?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1546608235-3310a2494cdf?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1486286701208-1d58e9338013?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1511886929837-354d827aae26?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1739550635585-484633b21450?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1618073193718-23a66109f4e6?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1574772135913-d519461c3996?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1527950285759-4d9f1b69c461?auto=format&fit=crop&w=1400&q=80',
  'https://images.unsplash.com/photo-1652190416284-10debef71bfa?auto=format&fit=crop&w=1400&q=80',
] as const;

const SCENE_IMAGE_REPEAT_COOLDOWN = 5;

const hashTextToIndex = (value: string, modulo: number): number => {
  if (!value) return 0;
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
};

const withAlpha = (color: string, alpha: number): string => {
  const clamped = Math.max(0, Math.min(1, alpha));
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${clamped})`;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = parseInt(`${hex[1]}${hex[1]}`, 16);
    const g = parseInt(`${hex[2]}${hex[2]}`, 16);
    const b = parseInt(`${hex[3]}${hex[3]}`, 16);
    return `rgba(${r},${g},${b},${clamped})`;
  }
  return color;
};

const resolvePreferredSceneIndex = (exercise: Pick<Exercise, 'id' | 'title' | 'description'>): number => {
  const text = `${exercise.title ?? ''} ${exercise.description ?? ''}`.toLowerCase();
  if (/(første touch|modtag|kropsstilling|first touch|receive|orientering)/i.test(text)) return 0;
  if (/(omstilling|genpres|transition|counter|recovery|tempo)/i.test(text)) return 1;
  if (/(aflever|pasning|cutback|assist|third man|væg|wall pass)/i.test(text)) return 2;
  if (/(afslut|finish|skud|mål|scoring)/i.test(text)) return 3;
  if (/(1v1|drible|dribling|dribbling|kant)/i.test(text)) return 4;
  if (/(duel|press|pres|vinklet pres|forsvar|defend)/i.test(text)) return 5;
  if (/(løb|run in behind|dybde|sprint|hurtig)/i.test(text)) return 6;
  if (/(position|placering|scan|overblik|perception)/i.test(text)) return 7;
  if (/(kommunik|call|leder|coaching|signal)/i.test(text)) return 8;
  if (/(målmand|keeper|goalkeeper)/i.test(text)) return 9;
  if (/(first.?time|førsteberøring|one.?touch)/i.test(text)) return 10;
  if (/(acceleration|eksplosiv|hurtighed)/i.test(text)) return 11;
  if (/(cross|indlæg|wing)/i.test(text)) return 12;
  if (/(balance|koordination|koordiner)/i.test(text)) return 13;
  if (/(afskærm|shield|holde bolden)/i.test(text)) return 14;
  if (/(returløb|recovery run|defensiv transition)/i.test(text)) return 15;
  if (/(orienteret|scan før modtag|scan before receive)/i.test(text)) return 16;
  if (/(frispark|set piece|dødbold)/i.test(text)) return 17;
  if (/(split pass|gennembrud|through ball)/i.test(text)) return 18;
  if (/(preslinje|compact|blok)/i.test(text)) return 19;
  return hashTextToIndex(`${exercise.id ?? ''}|${exercise.title ?? ''}`, CARD_SCENE_IMAGES.length);
};

const buildExerciseSceneImageById = (exercises: Exercise[]): Record<string, string> => {
  const sceneById: Record<string, string> = {};
  const recent: number[] = [];

  exercises.forEach((exercise) => {
    const preferred = resolvePreferredSceneIndex(exercise);
    const seed = hashTextToIndex(
      `${exercise.id ?? ''}|${exercise.title ?? ''}|${exercise.description ?? ''}`,
      CARD_SCENE_IMAGES.length
    );

    const candidates: number[] = [preferred];
    for (let i = 0; i < CARD_SCENE_IMAGES.length; i += 1) {
      const idx = (seed + i) % CARD_SCENE_IMAGES.length;
      if (!candidates.includes(idx)) candidates.push(idx);
    }

    const recentSet = new Set(recent);
    const chosen = candidates.find(idx => !recentSet.has(idx)) ?? candidates[0];
    sceneById[exercise.id] = CARD_SCENE_IMAGES[chosen];

    recent.push(chosen);
    if (recent.length > SCENE_IMAGE_REPEAT_COOLDOWN) {
      recent.shift();
    }
  });

  return sceneById;
};

const buildIcon = (kind: FolderVM['kind']): FolderVM['icon'] => {
  switch (kind) {
    case 'personal':
      return { ios: 'folder.fill', android: 'folder', color: '#8B6B2E', bg: 'rgba(139,107,46,0.15)' };
    case 'trainer':
      return { ios: 'folder.fill', android: 'folder', color: '#2F6B4E', bg: 'rgba(47,107,78,0.15)' };
    case 'footballcoach':
      return { ios: 'star.fill', android: 'stars', color: '#E0A336', bg: 'rgba(224,163,54,0.18)' };
    case 'footballcoach_category':
      return { ios: 'folder.fill', android: 'folder', color: '#5A6CE8', bg: 'rgba(90,108,232,0.12)' };
    case 'footballcoach_position':
      return { ios: 'folder.fill', android: 'folder', color: '#5A6CE8', bg: 'rgba(90,108,232,0.12)' };
    default:
      return { ios: 'folder.fill', android: 'folder', color: '#999', bg: 'rgba(153,153,153,0.12)' };
  }
};

const FolderRow = memo(function FolderRow({
  item,
  onPress,
  isSelected,
}: {
  item: FolderVM;
  onPress: (folder: FolderVM) => void;
  isSelected: boolean;
}) {
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  const handlePress = useCallback(() => onPress(item), [onPress, item]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      testID={`library.folder.${item.id}`}
      style={[
        styles.folderRow,
        { backgroundColor: theme.card },
        item.level > 1 ? { marginLeft: (item.level - 1) * 14 } : null,
        isSelected
          ? { borderColor: colors.success, borderWidth: 2 }
          : { borderColor: 'transparent', borderWidth: 2 },
      ]}
    >
      <View style={[styles.folderIconWrap, { backgroundColor: item.icon.bg }]}>
        <IconSymbol ios_icon_name={item.icon.ios} android_material_icon_name={item.icon.android} size={18} color={item.icon.color} />
      </View>

      <View style={styles.folderTextWrap}>
        <Text style={[styles.folderTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text style={[styles.folderSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>

      {item.rightBadgeText ? (
        <View style={[styles.folderRightBadge, { backgroundColor: theme.highlight }]}>
          <Text style={[styles.folderRightBadgeText, { color: theme.textSecondary }]}>{item.rightBadgeText}</Text>
        </View>
      ) : null}

      {item.chevron !== false ? (
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={18} color={theme.textSecondary} />
      ) : null}
    </TouchableOpacity>
  );
});

const ExerciseCard = memo(function ExerciseCard({
  exercise,
  onPressCard,
  onPressCta,
  positionLabelOverride,
  isAddingToTasks,
  previewImageUri,
}: {
  exercise: Exercise;
  onPressCard: (exercise: Exercise) => void;
  onPressCta: (exercise: Exercise) => void;
  positionLabelOverride?: string | null;
  isAddingToTasks?: boolean;
  previewImageUri: string;
}) {
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);

  const handleCardPress = useCallback(() => onPressCard(exercise), [onPressCard, exercise]);
  const handleCtaPress = useCallback(() => onPressCta(exercise), [onPressCta, exercise]);

  const difficulty = clampDifficulty(exercise.difficulty);
  const latestScoreLine = formatLatestScoreLine(exercise.last_score ?? null);
  const executionCountLine = formatExecutionCountLine(exercise.execution_count ?? null);
  const isAdded = !!exercise.is_added_to_tasks;
  const isAdding = !!isAddingToTasks;
  const ctaDisabled = isAdded || isAdding;

  const positionLabel = positionLabelOverride ?? exercise.position ?? null;
  const positionText = positionLabel ? positionLabel : 'Position: –';
  const positionIsPlaceholder = !positionLabel;

  const hasTrophy = typeof exercise.last_score === 'number' && Number.isFinite(exercise.last_score);
  const resolvedVideoUrl = resolveVideoUrl(exercise.video_key || exercise.video_url);
  const hasAnimation = !!resolvedVideoUrl;
  const pendingStateTestId = `library.animationPending.${exercise.id}`;
  const cardFadeColor = theme.card;

  return (
    <View style={[styles.exerciseCard, styles.exerciseCardShadow, { backgroundColor: theme.card }]}>
      <View style={styles.exerciseTop}>
        <Pressable onPress={handleCardPress} style={styles.exerciseLeft} android_ripple={{ color: 'rgba(0,0,0,0.05)' }}>
          <View style={styles.trophyWrap}>
            <Text style={[styles.trophyEmoji, !hasTrophy ? { opacity: 0.25 } : null]}>🏆</Text>
          </View>

          <Text style={[styles.exerciseTitle, { color: theme.text }]} numberOfLines={2}>
            {exercise.title}
          </Text>

          <View style={styles.exerciseRatingRow}>
            <View style={styles.starRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <IconSymbol
                  key={`star-${exercise.id}-${i}`}
                  ios_icon_name="star.fill"
                  android_material_icon_name="star"
                  size={14}
                  color={i < difficulty ? colors.warning : theme.highlight}
                />
              ))}
            </View>
            <Text
              pointerEvents="none"
              style={[styles.difficultyValue, { color: theme.textSecondary }]}
              numberOfLines={1}
              ellipsizeMode="clip"
            >
              Sværhedsgrad {difficulty}/5
            </Text>
          </View>

          <View
            style={[styles.positionPill, { backgroundColor: theme.highlight }, positionIsPlaceholder ? { opacity: 0.55 } : null]}
          >
            <Text style={[styles.positionPillText, { color: theme.textSecondary }]} numberOfLines={1}>
              {positionText}
            </Text>
          </View>

          <View style={styles.exerciseStatsRow}>
            <View style={[styles.statPill, { backgroundColor: theme.highlight }]} testID={`library.badge.lastScore.${exercise.id}`}>
              <Text
                style={[styles.exerciseMetaLine, { color: theme.textSecondary }]}
                testID={`library.counter.lastScore.${exercise.id}`}
                numberOfLines={1}
              >
                {latestScoreLine}
              </Text>
            </View>
            <View
              style={[styles.statPill, { backgroundColor: theme.highlight }]}
              testID={`library.badge.executionCount.${exercise.id}`}
            >
              <Text
                style={[styles.exerciseMetaLine, { color: theme.textSecondary }]}
                testID={`library.counter.executionCount.${exercise.id}`}
                numberOfLines={1}
              >
                {executionCountLine}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.exerciseRightColumn}>
          <View style={styles.exerciseRight}>
            <Pressable onPress={handleCardPress} style={styles.exerciseMediaPressable} android_ripple={{ color: 'rgba(0,0,0,0.05)' }}>
            <Image
              source={{ uri: previewImageUri }}
              style={styles.thumb}
              testID={hasAnimation ? `library.videoPreview.${exercise.id}` : undefined}
            />
	            <LinearGradient
	              pointerEvents="none"
	              colors={['rgba(15,23,42,0.01)', 'rgba(15,23,42,0.08)']}
	              start={{ x: 0.5, y: 0 }}
	              end={{ x: 0.5, y: 1 }}
	              style={styles.mediaShade}
	            />
	            <LinearGradient
	              pointerEvents="none"
	              // Shorter fade that reaches full white sooner (removes the visible seam).
	              colors={[
	                withAlpha(cardFadeColor, 1),
	                withAlpha(cardFadeColor, 1),
	                withAlpha(cardFadeColor, 0.95),
	                withAlpha(cardFadeColor, 0.8),
	                withAlpha(cardFadeColor, 0.55),
	                withAlpha(cardFadeColor, 0.25),
	                withAlpha(cardFadeColor, 0.1),
	                withAlpha(cardFadeColor, 0),
	                withAlpha(cardFadeColor, 0),
	              ]}
	              locations={[0, 0.16, 0.22, 0.28, 0.36, 0.44, 0.5, 0.57, 1]}
	              start={{ x: 0, y: 0.5 }}
	              end={{ x: 1, y: 0.5 }}
	              style={styles.mediaEdgeFade}
	            />
            </Pressable>
          </View>

          {!hasAnimation ? (
            <View style={styles.pendingThumb} testID={pendingStateTestId}>
              <Text style={styles.pendingThumbText}>Animation kommer snart</Text>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={handleCtaPress}
            activeOpacity={0.9}
            style={[
              styles.ctaBadge,
              styles.ctaBadgeOverlay,
              styles.ctaBadgeShadow,
              isAdded ? { backgroundColor: theme.highlight } : styles.ctaBadgeTransparent,
            ]}
            disabled={ctaDisabled}
            testID={`library.addToTasksButton.${exercise.id}`}
            accessibilityLabel={isAdded ? 'tilføjet' : 'Tilføj til opgaver'}
          >
            {isAdding ? (
              <>
                <ActivityIndicator size="small" color={isAdded ? theme.textSecondary : '#fff'} />
                <Text style={[styles.ctaText, { color: isAdded ? theme.textSecondary : '#fff' }]}>Tilføjer...</Text>
              </>
            ) : (
              <>
                {!isAdded ? (
                  <LinearGradient
                    colors={['#53C761', '#2DA94A', '#0F7F34']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ctaGradientFill}
                  />
                ) : null}
                {isAdded ? (
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={9} color={theme.textSecondary} />
                ) : null}
                <Text style={[styles.ctaText, { color: isAdded ? theme.textSecondary : '#fff' }]}>
                  {isAdded ? 'tilføjet' : 'Tilføj til opgaver'}
                </Text>
                {!isAdded ? (
                  <View style={styles.ctaChevronWrap}>
                    <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={11} color="#fff" />
                  </View>
                ) : null}
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const SkeletonFolderRow = memo(function SkeletonFolderRow({ level }: { level: 1 | 2 | 3 }) {
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  return (
    <View
      style={[
        styles.folderRow,
        { backgroundColor: theme.card, borderWidth: 2, borderColor: 'transparent' },
        level > 1 ? { marginLeft: (level - 1) * 14 } : null,
      ]}
    >
      <View style={[styles.skeleton, { width: 34, height: 34, borderRadius: 10 }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[styles.skeleton, { width: '55%', height: 14, borderRadius: 6 }]} />
        <View style={[styles.skeleton, { width: '35%', height: 12, borderRadius: 6 }]} />
      </View>
      <View style={[styles.skeleton, { width: 18, height: 18, borderRadius: 6 }]} />
    </View>
  );
});

const SkeletonExerciseCard = memo(function SkeletonExerciseCard() {
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  return (
    <View style={[styles.exerciseCard, { backgroundColor: theme.card }]}>
      <View style={styles.exerciseTop}>
        <View style={styles.exerciseLeft}>
          <View style={[styles.skeleton, { width: 26, height: 18, borderRadius: 6 }]} />
          <View style={[styles.skeleton, { width: '85%', height: 18, borderRadius: 6, marginTop: 10 }]} />
          <View style={[styles.skeleton, { width: '70%', height: 18, borderRadius: 6 }]} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={[styles.skeleton, { width: 90, height: 14, borderRadius: 6 }]} />
            <View style={[styles.skeleton, { width: 70, height: 18, borderRadius: 10 }]} />
          </View>
          <View style={[styles.skeleton, { width: '60%', height: 14, borderRadius: 6, marginTop: 10 }]} />
        </View>
        <View style={styles.exerciseRightColumn}>
          <View style={[styles.skeleton, { width: '100%', height: 230, borderRadius: 30 }]} />
          <View style={[styles.skeleton, { width: '92%', height: 40, borderRadius: 999, marginTop: -58, alignSelf: 'center' }]} />
        </View>
      </View>
    </View>
  );
});

const ALL_FC_POS_IDS = new Set<string>(KNOWN_HOLDTRAINING_POSITION_IDS); // compatibility for other uses
const normalizeForMatch = (value: string) =>
  (value || '')
    .toLowerCase()
    .trim()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '_');

const resolveFootballCoachPosId = (categoryPath: string | null): string | null => {
  if (!categoryPath) return null;
  if (KNOWN_HOLDTRAINING_POSITION_IDS.has(categoryPath)) return categoryPath;
  if (categoryPath.startsWith('holdtraening_')) return categoryPath;
  return null;
};

export default function LibraryScreen() {
  const roleInfo = useUserRole() as any;
  const roleRaw = roleInfo?.userRole ?? roleInfo?.role ?? null;
  const roleStr = typeof roleRaw === 'string' ? roleRaw.toLowerCase() : '';
  const isTrainerLike =
    !!roleInfo?.isTrainer ||
    roleStr.includes('trainer') ||
    roleStr.includes('coach');
  const isAdmin =
    !!roleInfo?.isAdmin ||
    roleStr === 'admin' ||
    roleStr.includes('admin');
  const { featureAccess, isLoading: subscriptionFeaturesLoading, subscriptionTier } = useSubscriptionFeatures();
  const isTrainerByTier = subscriptionTier?.startsWith('trainer') ?? false;
  const canCreateExercise = isAdmin || isTrainerLike || isTrainerByTier;
  const isCreator = canCreateExercise;

  const { teams } = useTeamPlayer();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  const { addTask: addTaskToContext, tasks: tasksFromContext } = useFootball();
  const isTrainerUser = isAdmin || isTrainerLike || isTrainerByTier;

  const [status, setStatus] = useState<'loading' | 'success' | 'empty' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [personalExercises, setPersonalExercises] = useState<Exercise[]>([]);
  const [trainerFolders, setTrainerFolders] = useState<{ trainerId: string; trainerName: string; exercises: Exercise[] }[]>([]);
  const [footballCoachExercises, setFootballCoachExercises] = useState<Exercise[]>([]);

  const [nav, setNav] = useState<NavigationState>({ root: null, level2Id: null, level3Id: null });

  // Search (local only)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // CTA state: local optimistic only (no fetch in onPress)
  const [addedToTasksIds, setAddedToTasksIds] = useState<Set<string>>(() => new Set());
  const addedToTasksIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    addedToTasksIdsRef.current = addedToTasksIds;
  }, [addedToTasksIds]);

  const [exerciseTaskMap, setExerciseTaskMap] = useState<Record<string, string>>({});
  const exerciseTaskMapRef = useRef<Record<string, string>>({});
  useEffect(() => {
    exerciseTaskMapRef.current = exerciseTaskMap;
  }, [exerciseTaskMap]);

  const [counterOverrides, setCounterOverrides] = useState<Record<string, ExerciseCounterOverride>>({});
  const counterOverridesRef = useRef<Record<string, ExerciseCounterOverride>>({});
  useEffect(() => {
    counterOverridesRef.current = counterOverrides;
  }, [counterOverrides]);

  const appliedFeedbackEventsRef = useRef<
    Record<
      string,
      {
        exerciseId: string;
        rollback: ExerciseCounterOverride;
        executionIdentity: string | null;
        seenAdded: boolean;
      }
    >
  >({});
  const pendingRollbackByExerciseRef = useRef<Record<string, ExerciseCounterOverride>>({});
  const seenExecutionIdentitiesRef = useRef<Set<string>>(new Set());

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalExercise, setAddModalExercise] = useState<Exercise | null>(null);
  const [isAddModalSaving, setIsAddModalSaving] = useState(false);
  const [addingTaskIds, setAddingTaskIds] = useState<Set<string>>(() => new Set());
  const addingTaskIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    addingTaskIdsRef.current = addingTaskIds;
  }, [addingTaskIds]);

  const updateExerciseAddingState = useCallback((exerciseId: string, inFlight: boolean) => {
    if (!exerciseId) return;
    setAddingTaskIds(prev => {
      const next = new Set(prev);
      if (inFlight) next.add(exerciseId);
      else next.delete(exerciseId);
      return next;
    });
  }, []);

  const isExerciseAddInFlight = useCallback((exerciseId: string) => addingTaskIdsRef.current.has(exerciseId), []);

  const isExerciseAlreadyAdded = useCallback((exercise?: Exercise | null) => {
    if (!exercise) return false;
    if (exercise.is_added_to_tasks) return true;
    return addedToTasksIdsRef.current.has(exercise.id);
  }, []);

  const buildTaskPayload = useCallback(
    (exerciseNode: Exercise): Omit<Task, 'id'> => ({
      title: exerciseNode.title,
      description: exerciseNode.description ?? '',
      completed: false,
      isTemplate: true,
      categoryIds: [],
      reminder: undefined,
      subtasks: [] as Task['subtasks'],
      videoUrl: exerciseNode.video_url ?? undefined,
      afterTrainingEnabled: false,
      afterTrainingDelayMinutes: null,
      afterTrainingFeedbackEnableScore: true,
      afterTrainingFeedbackScoreExplanation: null,
      afterTrainingFeedbackEnableIntensity: false,
      afterTrainingFeedbackEnableNote: true,
    }),
    []
  );

  const deriveSourceFolder = useCallback(
    (exerciseNode: Exercise): string | null => {
      if (exerciseNode?.is_system) return 'FootballCoach inspiration';
      if (!isTrainerUser) {
        const trainerName = (exerciseNode?.trainer_name || '').trim();
        if (trainerName.length) return `Fra træner: ${trainerName}`;
        if (exerciseNode?.trainer_id) return 'Fra træner';
      }
      return null;
    },
    [isTrainerUser]
  );

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const normalizeExercise = useCallback((row: any): Exercise => {
    const rawVideoKey = extractVideoKey(row?.video_key ?? row?.video_url) ?? null;
    const rawVideoUrl = typeof row?.video_url === 'string' ? row.video_url.trim() : '';
    const resolvedVideoUrl = rawVideoKey
      ? resolveVideoUrl(rawVideoKey)
      : /^https?:\/\//i.test(rawVideoUrl)
      ? rawVideoUrl
      : null;

    const rawThumbValue = typeof row?.thumbnail_url === 'string' ? row.thumbnail_url.trim() : '';
    const rawThumbKey = extractVideoKey(rawThumbValue) ?? null;
    const resolvedThumbUrl = rawThumbKey
      ? resolveVideoUrl(rawThumbKey)
      : /^https?:\/\//i.test(rawThumbValue)
      ? rawThumbValue
      : null;

    return {
      id: String(row?.id ?? ''),
      trainer_id: row?.trainer_id ? String(row.trainer_id) : null,
      title: String(row?.title ?? ''),
      description: row?.description ?? null,
      video_key: rawVideoKey,
      video_url: resolvedVideoUrl,
      thumbnail_url: resolvedThumbUrl,
      created_at: row?.created_at ?? null,
      updated_at: row?.updated_at ?? null,
      is_system: typeof row?.is_system === 'boolean' ? row.is_system : !!row?.is_system,
      category_path: row?.category_path ?? null,
      difficulty: typeof row?.difficulty === 'number' ? row.difficulty : row?.difficulty != null ? Number(row.difficulty) : null,
      "position": row?.position ?? row?.player_position ?? null,
      trainer_name: row?.trainer_name ?? null,
      last_score: typeof row?.last_score === 'number' ? row.last_score : row?.last_score != null ? Number(row.last_score) : null,
      execution_count: typeof row?.execution_count === 'number' ? row.execution_count : row?.execution_count != null ? Number(row.execution_count) : null,
      is_added_to_tasks: typeof row?.is_added_to_tasks === 'boolean' ? row.is_added_to_tasks : null,
    };
  }, []);

  const applyAdded = useCallback((xs: Exercise[]) => {
    const set = addedToTasksIdsRef.current;
    if (!set || set.size === 0) return xs;
    return xs.map(e => ({ ...e, is_added_to_tasks: set.has(e.id) ? true : e.is_added_to_tasks }));
  }, []);

  const applyCounterOverrides = useCallback((xs: Exercise[]) => {
    const map = counterOverridesRef.current;
    const ids = Object.keys(map || {});
    if (!ids.length) return xs;
    return xs.map((exercise) => {
      const override = map[exercise.id];
      if (!override) return exercise;
      return {
        ...exercise,
        last_score: override.last_score,
        execution_count: override.execution_count,
      };
    });
  }, []);

  const allKnownExercises = useMemo(() => {
    const merged: Exercise[] = [];
    const seen = new Set<string>();
    const addUnique = (exercise: Exercise) => {
      if (!exercise?.id || seen.has(exercise.id)) return;
      seen.add(exercise.id);
      merged.push(exercise);
    };

    personalExercises.forEach(addUnique);
    footballCoachExercises.forEach(addUnique);
    trainerFolders.forEach((folder) => {
      (folder.exercises || []).forEach(addUnique);
    });

    return merged;
  }, [personalExercises, footballCoachExercises, trainerFolders]);

  const loadLibraryData = useCallback(
    async (userId: string) => {
      try {
        setStatus('loading');
        setErrorMessage('');

        const systemPromise = supabase
          .from('exercise_library')
          .select('*')
          .eq('is_system', true)
          .order('created_at', { ascending: true });

        const personalPromise = isCreator
          ? supabase
              .from('exercise_library')
              .select('*')
              .eq('trainer_id', userId)
              .eq('is_system', false)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null } as any);

        const teamIds = (teams || []).map(t => t.id).filter(Boolean);
        const assignmentsPromise = !isCreator
          ? supabase
              .from('exercise_assignments')
              .select('*')
              .or(teamIds.length ? `player_id.eq.${userId},team_id.in.(${teamIds.join(',')})` : `player_id.eq.${userId}`)
          : Promise.resolve({ data: [], error: null } as any);
        const libraryTaskLinksPromise = supabase
          .from('task_templates')
          .select('id, library_exercise_id')
          .not('library_exercise_id', 'is', null)
          .order('created_at', { ascending: true });

        const [systemRes, personalRes, assignmentsRes, libraryTaskLinksRes] = await Promise.all([
          systemPromise,
          personalPromise,
          assignmentsPromise,
          libraryTaskLinksPromise,
        ]);

        if (systemRes.error) throw systemRes.error;
        if (personalRes?.error) throw personalRes.error;
        if (assignmentsRes?.error) throw assignmentsRes.error;
        if (libraryTaskLinksRes?.error) throw libraryTaskLinksRes.error;

        const system = (systemRes.data || []) as any[];
        const personal = (personalRes?.data || []) as any[];
        const assignments = (assignmentsRes?.data || []) as any[];
        const libraryTaskLinks = (libraryTaskLinksRes?.data || []) as any[];

        const linkedExerciseIds = new Set<string>();
        const linkedExerciseTaskMap: Record<string, string> = {};
        libraryTaskLinks.forEach((row: any) => {
          const exerciseId = String(row?.library_exercise_id ?? '').trim();
          const taskTemplateId = String(row?.id ?? '').trim();
          if (!exerciseId || !taskTemplateId) return;
          if (linkedExerciseTaskMap[exerciseId]) return;
          linkedExerciseTaskMap[exerciseId] = taskTemplateId;
          linkedExerciseIds.add(exerciseId);
        });

        const applyLinkedAdded = (xs: Exercise[]) =>
          xs.map(exercise => (linkedExerciseIds.has(exercise.id) ? { ...exercise, is_added_to_tasks: true } : exercise));

        const systemExercises = applyCounterOverrides(applyLinkedAdded(applyAdded(system.map(normalizeExercise))));

        let trainerGrouped: { trainerId: string; trainerName: string; exercises: Exercise[] }[] = [];
        if (!isCreator) {
          const exerciseIds = Array.from(new Set(assignments.map((a: any) => String(a.exercise_id)).filter(Boolean)));
          let assignedExercises: Exercise[] = [];

          if (exerciseIds.length) {
            const { data: exerciseRows, error: exErr } = await supabase.from('exercise_library').select('*').in('id', exerciseIds);
            if (exErr) throw exErr;
            assignedExercises = applyCounterOverrides(applyAdded((exerciseRows || []).map(normalizeExercise)));
          }

          const trainerIds = Array.from(new Set(assignments.map((a: any) => String(a.trainer_id)).filter(Boolean)));
          let trainerProfiles: { user_id: string; full_name: string | null }[] = [];

          if (trainerIds.length) {
            const { data: profRows, error: profErr } = await supabase.from('profiles').select('user_id, full_name').in('user_id', trainerIds);
            if (profErr) throw profErr;
            trainerProfiles = (profRows || []) as any;
          }

          const profileName = (trainerId: string) =>
            trainerProfiles.find(p => String(p.user_id) === String(trainerId))?.full_name || 'Ukendt træner';

          const grouped = new Map<string, Exercise[]>();
          const seenTrainerExercisePairs = new Set<string>();
          assignments.forEach((a: any) => {
            const tid = String(a.trainer_id || '');
            const eid = String(a.exercise_id || '');
            if (!tid || !eid) return;
            const pairKey = `${tid}::${eid}`;
            if (seenTrainerExercisePairs.has(pairKey)) return;
            seenTrainerExercisePairs.add(pairKey);
            const ex = assignedExercises.find(e => String(e.id) === eid);
            if (!ex) return;

            const next = grouped.get(tid) || [];
            next.push({ ...ex, trainer_name: profileName(tid) });
            grouped.set(tid, next);
          });

          trainerGrouped = Array.from(grouped.entries()).map(([trainerId, exercises]) => ({
            trainerId,
            trainerName: profileName(trainerId),
            exercises,
          }));
        }

        const personalExercises = isCreator
          ? applyCounterOverrides(applyLinkedAdded(applyAdded(personal.map(normalizeExercise))))
          : [];

        if (!isMountedRef.current) return;

        setFootballCoachExercises(systemExercises);
        setPersonalExercises(personalExercises);
        setTrainerFolders(trainerGrouped);
        setExerciseTaskMap(prev => ({ ...prev, ...linkedExerciseTaskMap }));
        setAddedToTasksIds(prev => {
          if (!linkedExerciseIds.size) return prev;
          const next = new Set(prev);
          linkedExerciseIds.forEach(id => next.add(id));
          return next;
        });

        const hasAny =
          systemExercises.length > 0 ||
          personalExercises.length > 0 ||
          trainerGrouped.some(g => g.exercises.length > 0);

        setStatus(hasAny ? 'success' : 'empty');
      } catch (e: any) {
        if (!isMountedRef.current) return;
        setStatus('error');
        setErrorMessage(e?.message || 'Kunne ikke hente bibliotek');
      }
    },
    [isCreator, teams, normalizeExercise, applyAdded, applyCounterOverrides]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setCurrentUserId(data?.user?.id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      setReloadNonce(n => n + 1);
    }, [])
  );

  useEffect(() => {
    const tasks = (tasksFromContext || []) as Task[];
    if (!tasks.length || !allKnownExercises.length) return;

    const signatureToExerciseId = new Map<string, string>();
    const duplicateSignatures = new Set<string>();
    allKnownExercises.forEach((exercise) => {
      const signature = buildExerciseSignature(exercise);
      if (!signature || duplicateSignatures.has(signature)) return;
      const existing = signatureToExerciseId.get(signature);
      if (existing && existing !== exercise.id) {
        duplicateSignatures.add(signature);
        signatureToExerciseId.delete(signature);
        return;
      }
      signatureToExerciseId.set(signature, exercise.id);
    });

    const inferredMap: Record<string, string> = {};
    const inferredAdded = new Set<string>();

    tasks.forEach((task) => {
      const taskTemplateId = String(task?.taskTemplateId ?? task?.id ?? '').trim();
      if (!taskTemplateId) return;

      const signature = buildTaskSignature(task);
      if (!signature || duplicateSignatures.has(signature)) return;

      const exerciseId = signatureToExerciseId.get(signature);
      if (!exerciseId) return;

      inferredMap[exerciseId] = taskTemplateId;
      inferredAdded.add(exerciseId);
    });

    if (!Object.keys(inferredMap).length) return;

    setExerciseTaskMap((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(inferredMap).forEach(([exerciseId, taskTemplateId]) => {
        if (next[exerciseId] !== taskTemplateId) {
          next[exerciseId] = taskTemplateId;
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setAddedToTasksIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      inferredAdded.forEach((exerciseId) => {
        if (!next.has(exerciseId)) {
          next.add(exerciseId);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tasksFromContext, allKnownExercises]);

  useEffect(() => {
    const findExerciseById = (exerciseId: string): Exercise | null => {
      const fromPersonal = personalExercises.find((exercise) => exercise.id === exerciseId);
      if (fromPersonal) return fromPersonal;
      const fromCoach = footballCoachExercises.find((exercise) => exercise.id === exerciseId);
      if (fromCoach) return fromCoach;
      for (const folder of trainerFolders) {
        const match = (folder.exercises || []).find((exercise) => exercise.id === exerciseId);
        if (match) return match;
      }
      return null;
    };

    const savedSub = DeviceEventEmitter.addListener('feedback:saved', (payload: any) => {
      const templateId = String(payload?.templateId ?? '').trim();
      const optimisticId = String(payload?.optimisticId ?? '').trim();
      const rating = typeof payload?.rating === 'number' ? payload.rating : null;
      const activityId = String(payload?.activityId ?? '').trim();
      const taskInstanceId = String(payload?.taskInstanceId ?? '').trim();

      if (optimisticId && appliedFeedbackEventsRef.current[optimisticId]) {
        setReloadNonce(n => n + 1);
        return;
      }

      if (templateId) {
        const entry = Object.entries(exerciseTaskMapRef.current).find(([, taskTemplateId]) => String(taskTemplateId) === templateId);
        const exerciseId = entry?.[0];
        if (exerciseId) {
          const pendingRollback = pendingRollbackByExerciseRef.current[exerciseId];
          const previous = counterOverridesRef.current[exerciseId];
          const exercise = findExerciseById(exerciseId);
          const rollback: ExerciseCounterOverride = pendingRollback ?? previous ?? {
            last_score:
              typeof exercise?.last_score === 'number'
                ? exercise.last_score
                : null,
            execution_count:
              typeof exercise?.execution_count === 'number'
                ? exercise.execution_count
                : null,
          };
          const baseCount =
            typeof pendingRollback?.execution_count === 'number'
              ? pendingRollback.execution_count
              : typeof previous?.execution_count === 'number'
              ? previous.execution_count
              : typeof exercise?.execution_count === 'number'
              ? exercise.execution_count
              : 0;
          const executionIdentity =
            activityId && (taskInstanceId || templateId)
              ? `${exerciseId}::${activityId}::${taskInstanceId || templateId}`
              : null;
          const alreadySeen =
            executionIdentity ? seenExecutionIdentitiesRef.current.has(executionIdentity) : false;
          const increment = alreadySeen ? 0 : 1;
          if (executionIdentity && !alreadySeen) {
            seenExecutionIdentitiesRef.current.add(executionIdentity);
          }

          setCounterOverrides((prev) => ({
            ...prev,
            [exerciseId]: {
              last_score: rating,
              execution_count: Math.max(0, baseCount + increment),
            },
          }));

          if (optimisticId) {
            appliedFeedbackEventsRef.current[optimisticId] = {
              exerciseId,
              rollback,
              executionIdentity,
              seenAdded: increment === 1,
            };
          }
          delete pendingRollbackByExerciseRef.current[exerciseId];
        }
      }

      setReloadNonce(n => n + 1);
    });
    const failedSub = DeviceEventEmitter.addListener('feedback:save_failed', (payload: any) => {
      const optimisticId = String(payload?.optimisticId ?? '').trim();
      if (!optimisticId) return;
      const applied = appliedFeedbackEventsRef.current[optimisticId];
      if (!applied?.exerciseId) return;
      const { exerciseId, rollback, executionIdentity, seenAdded } = applied;
      pendingRollbackByExerciseRef.current[exerciseId] = rollback;
      if (seenAdded && executionIdentity) {
        seenExecutionIdentitiesRef.current.delete(executionIdentity);
      }
      setCounterOverrides((prev) => {
        return {
          ...prev,
          [exerciseId]: rollback,
        };
      });
      delete appliedFeedbackEventsRef.current[optimisticId];
    });
    return () => {
      savedSub.remove();
      failedSub.remove();
    };
  }, [personalExercises, footballCoachExercises, trainerFolders]);

  const isPlayer = !isAdmin && !isTrainerLike && !isTrainerByTier;
  const entitlementsReady = !subscriptionFeaturesLoading;
  const gateLibrary = entitlementsReady && isPlayer && !featureAccess?.library;

  useEffect(() => {
    if (!currentUserId || gateLibrary) return;
    loadLibraryData(currentUserId);
  }, [currentUserId, reloadNonce, loadLibraryData, gateLibrary]);

  const footballCoachCountsByPosition = useMemo(() => {
    const m = new Map<string, number>();
    footballCoachExercises.forEach(e => {
      const posId = resolveFootballCoachPosId(e.category_path);
      if (!posId) return;
      m.set(posId, (m.get(posId) || 0) + 1);
    });
    return m;
  }, [footballCoachExercises]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log('[Library] roleInfo', roleInfo);
    console.log('[Library] derived', { isAdmin, isCreator, roleStr, isTrainerLike, isTrainerByTier, subscriptionTier, canCreateExercise, isPlayer });
  }, [roleInfo, isAdmin, isCreator, roleStr, isTrainerLike, isTrainerByTier, subscriptionTier, canCreateExercise, isPlayer]);

  const footballCoachCountsByCategory = useMemo(() => {
    const m = new Map<string, number>();
    FOOTBALLCOACH_STRUCTURE.forEach(cat => {
      const sum = cat.positions.reduce((acc, pos) => acc + (footballCoachCountsByPosition.get(pos.id) || 0), 0);
      m.set(cat.id, sum);
    });
    return m;
  }, [footballCoachCountsByPosition]);

  const trainerTotalExercises = useMemo(() => {
    return trainerFolders.reduce((acc, t) => acc + (t.exercises?.length || 0), 0);
  }, [trainerFolders]);

  const rootFolders: FolderVM[] = useMemo(() => {
    if (isCreator) {
      return [
        {
          id: 'personal',
          level: 1,
          title: 'Personlige øvelser',
          subtitle: `${personalExercises.length} øvelser`,
          rightBadgeText: String(personalExercises.length),
          icon: buildIcon('personal'),
          chevron: true,
          kind: 'personal',
          payload: { root: 'personal' },
        },
        {
          id: 'footballcoach',
          level: 1,
          title: 'FootballCoach fokusområder',
          subtitle: `${footballCoachExercises.length} øvelser`,
          rightBadgeText: String(footballCoachExercises.length),
          icon: buildIcon('footballcoach'),
          chevron: true,
          kind: 'footballcoach',
          payload: { root: 'footballcoach' },
        },
      ];
    }
    return [
      {
        id: 'trainer',
        level: 1,
        title: 'Øvelser fra træner',
        subtitle: `${trainerTotalExercises} øvelser`,
        rightBadgeText: String(trainerTotalExercises),
        icon: buildIcon('trainer'),
        chevron: true,
        kind: 'trainer',
        payload: { root: 'trainer' },
      },
      {
        id: 'footballcoach',
        level: 1,
        title: 'FootballCoach fokusområder',
        subtitle: `${footballCoachExercises.length} øvelser`,
        rightBadgeText: String(footballCoachExercises.length),
        icon: buildIcon('footballcoach'),
        chevron: true,
        kind: 'footballcoach',
        payload: { root: 'footballcoach' },
      },
    ];
  }, [isCreator, personalExercises.length, footballCoachExercises.length, trainerTotalExercises]);

  const footballCoachCategories: FolderVM[] = useMemo(() => {
    return FOOTBALLCOACH_STRUCTURE.map(cat => {
      const count = footballCoachCountsByCategory.get(cat.id) || 0;
      return {
        id: cat.id,
        level: 2,
        title: cat.name,
        subtitle: `${count} øvelser`,
        rightBadgeText: String(count),
        icon: buildIcon('footballcoach_category'),
        chevron: true,
        kind: 'footballcoach_category',
        payload: { root: 'footballcoach', level2Id: cat.id },
      };
    });
  }, [footballCoachCountsByCategory]);

  const footballCoachPositions: FolderVM[] = useMemo(() => {
    if (nav.root !== 'footballcoach' || !nav.level2Id) return [];
    const cat = FOOTBALLCOACH_STRUCTURE.find(c => c.id === nav.level2Id);
    if (!cat) return [];
    const base = cat.positions.map(pos => buildHoldtraeningFolderVm(pos.id, footballCoachCountsByPosition.get(pos.id) || 0));
    if (nav.level2Id !== 'holdtraening') return base;
    const dynamic = Array.from(footballCoachCountsByPosition.entries())
      .filter(([posId, count]) => posId.startsWith('holdtraening_') && !KNOWN_HOLDTRAINING_POSITION_IDS.has(posId) && count > 0)
      .map(([posId, count]) => buildHoldtraeningFolderVm(posId, count))
      .sort((a, b) => a.title.localeCompare(b.title));
    return [...base, ...dynamic];
  }, [nav.root, nav.level2Id, footballCoachCountsByPosition]);

  const trainerLevel2Folders: FolderVM[] = useMemo(() => {
    if (nav.root !== 'trainer') return [];
    return trainerFolders.map(tf => ({
      id: tf.trainerId,
      level: 2,
      title: tf.trainerName,
      subtitle: `${tf.exercises.length} øvelser`,
      rightBadgeText: String(tf.exercises.length),
      icon: buildIcon('trainer'),
      chevron: true,
      kind: 'trainer',
      payload: { root: 'trainer', level2Id: tf.trainerId },
    }));
  }, [nav.root, trainerFolders]);

  const selectedExerciseHeaderTitle = useMemo(() => {
    if (!nav.root) return '';
    if (searchOpen && searchQuery.trim().length > 0) return 'Søgeresultater';
    if (nav.root === 'personal') return 'Personlige øvelser';
    if (nav.root === 'trainer') {
      const t = trainerFolders.find(x => x.trainerId === nav.level2Id);
      return t ? t.trainerName : 'Øvelser fra træner';
    }
    if (nav.root === 'footballcoach') {
      if (nav.level3Id) return getHoldtraeningPositionTitle(nav.level3Id);
      const cat = FOOTBALLCOACH_STRUCTURE.find(c => c.id === nav.level2Id);
      return cat?.name || 'FootballCoach fokusområder';
    }
    return '';
  }, [nav, trainerFolders, searchOpen, searchQuery]);

  const visibleFolderStack: FolderVM[] = useMemo(() => {
    const rows: FolderVM[] = [...rootFolders];
    if (nav.root === 'footballcoach') {
      rows.push(...footballCoachCategories);
      if (nav.level2Id) rows.push(...footballCoachPositions);
    }
    if (nav.root === 'trainer') {
      rows.push(...trainerLevel2Folders);
    }
    return rows;
  }, [rootFolders, nav.root, nav.level2Id, footballCoachCategories, footballCoachPositions, trainerLevel2Folders]);

  const selectedPathIds = useMemo(() => {
    const s = new Set<string>();
    if (!nav.root) return s;
    if (nav.root === 'personal') {
      s.add('personal');
      return s;
    }
    if (nav.root === 'trainer') {
      s.add('trainer');
      if (nav.level2Id) s.add(nav.level2Id);
      return s;
    }
    if (nav.root === 'footballcoach') {
      s.add('footballcoach');
      if (nav.level2Id) s.add(nav.level2Id);
      if (nav.level3Id) s.add(nav.level3Id);
      return s;
    }
    return s;
  }, [nav]);

  const exercisesInCurrentView: Exercise[] = useMemo(() => {
    let list: Exercise[] = [];
    if (nav.root === 'personal') {
      list = personalExercises;
    } else if (nav.root === 'trainer') {
      if (!nav.level2Id) list = [];
      else list = trainerFolders.find(t => t.trainerId === nav.level2Id)?.exercises ?? [];
    } else if (nav.root === 'footballcoach') {
      if (!nav.level3Id) list = [];
      else {
        list = footballCoachExercises.filter(e => resolveFootballCoachPosId(e.category_path) === nav.level3Id);
      }
    }
    return list;
  }, [nav, personalExercises, trainerFolders, footballCoachExercises]);

  const dedupeById = useCallback((xs: Exercise[]) => {
    const seen = new Set<string>();
    const out: Exercise[] = [];
    xs.forEach(e => {
      if (!e?.id) return;
      if (seen.has(e.id)) return;
      seen.add(e.id);
      out.push(e);
    });
    return out;
  }, []);

  const allExercisesForSearch = useMemo(() => {
    if (!nav.root) return [];
    if (nav.root === 'personal') return personalExercises;
    if (nav.root === 'trainer') {
      const flat = trainerFolders.flatMap(t => t.exercises || []);
      return dedupeById(flat);
    }
    return footballCoachExercises;
  }, [nav.root, personalExercises, trainerFolders, footballCoachExercises, dedupeById]);

  const displayedExercises: Exercise[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isSearching = searchOpen && q.length > 0;
    let list = isSearching ? allExercisesForSearch : exercisesInCurrentView;
    if (isSearching) {
      list = list.filter(e => {
        const hay = `${e.title ?? ''} ${e.description ?? ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return [...list].sort((a, b) => {
      const au = a.updated_at || a.created_at || '';
      const bu = b.updated_at || b.created_at || '';
      return String(bu).localeCompare(String(au));
    });
  }, [searchOpen, searchQuery, allExercisesForSearch, exercisesInCurrentView]);

  const isAtExerciseLevel = useMemo(() => {
    if (nav.root === 'personal') return true;
    if (nav.root === 'trainer') return !!nav.level2Id || (searchOpen && searchQuery.trim().length > 0);
    if (nav.root === 'footballcoach') return !!nav.level3Id || (searchOpen && searchQuery.trim().length > 0);
    return false;
  }, [nav, searchOpen, searchQuery]);

  const listRef = useRef<SectionList<any>>(null);
  const pendingScrollToExercisesRef = useRef(false);

  const handleFolderPress = useCallback((folder: FolderVM) => {
    const root = folder.payload?.root ?? null;
    setSearchOpen(false);
    setSearchQuery('');
    setNav(prev => {
      if (!root) return prev;
      if (folder.level === 1) {
        if (prev.root === root) return { root: null, level2Id: null, level3Id: null };
        if (root === 'personal') pendingScrollToExercisesRef.current = true;
        return { root, level2Id: null, level3Id: null };
      }
      if (root === 'trainer' && folder.level === 2) {
        const nextLevel2 = folder.payload?.level2Id ?? null;
        const isSame = prev.root === 'trainer' && prev.level2Id === nextLevel2;
        pendingScrollToExercisesRef.current = true;
        return isSame ? prev : { root: 'trainer', level2Id: nextLevel2, level3Id: null };
      }
      if (root === 'footballcoach') {
        if (folder.level === 2) {
          return { root: 'footballcoach', level2Id: folder.payload?.level2Id ?? null, level3Id: null };
        }
        if (folder.level === 3) {
          const nextL2 = folder.payload?.level2Id ?? null;
          const nextL3 = folder.payload?.level3Id ?? null;
          const isSame = prev.root === 'footballcoach' && prev.level2Id === nextL2 && prev.level3Id === nextL3;
          pendingScrollToExercisesRef.current = true;
          return isSame ? prev : { root: 'footballcoach', level2Id: nextL2, level3Id: nextL3 };
        }
      }
      return prev;
    });
  }, []);

  const handlePressCard = useCallback(
    (exercise: Exercise) => {
      router.push({ pathname: '/exercise-details', params: { exerciseId: exercise.id } } as any);
    },
    [router]
  );

  const handlePressCta = useCallback(
    (exercise: Exercise) => {
      if (!exercise) return;
      if (!addTaskToContext) {
        Alert.alert('Ikke tilgængelig', 'Kan ikke tilføje opgaver lige nu. Prøv igen om lidt.');
        return;
      }
      if (isExerciseAlreadyAdded(exercise)) {
        Alert.alert('Allerede tilføjet', 'Denne øvelse ligger allerede i dine opgaver.');
        return;
      }
      if (isExerciseAddInFlight(exercise.id)) {
        return;
      }
      setAddModalExercise(exercise);
      setAddModalOpen(true);
    },
    [addTaskToContext, isExerciseAddInFlight, isExerciseAlreadyAdded]
  );

  const handleCloseAddModal = useCallback(() => {
    setAddModalOpen(false);
    setAddModalExercise(null);
  }, []);

  const handleConfirmAddToTasks = useCallback(async () => {
    if (!addModalExercise) return;
    if (!addTaskToContext) {
      Alert.alert('Ikke tilgængelig', 'Kan ikke tilføje opgaver lige nu. Prøv igen senere.');
      return;
    }
    if (isExerciseAlreadyAdded(addModalExercise)) {
      Alert.alert('Allerede tilføjet', 'Denne øvelse ligger allerede i dine opgaver.');
      handleCloseAddModal();
      return;
    }

    const targetExercise = addModalExercise;
    setIsAddModalSaving(true);
    updateExerciseAddingState(targetExercise.id, true);

    try {
      const created = await addTaskToContext(buildTaskPayload(targetExercise), {
        skipRefresh: true,
        sourceFolder: deriveSourceFolder(targetExercise),
        libraryExerciseId: targetExercise.id,
      });

      setExerciseTaskMap(prev => ({
        ...prev,
        [targetExercise.id]: String(created.id),
      }));
      setAddedToTasksIds(prev => {
        const next = new Set(prev);
        next.add(targetExercise.id);
        return next;
      });
      handleCloseAddModal();
    } catch (error: any) {
      console.error('[Library] Failed to add exercise to tasks', error);
      const message = typeof error?.message === 'string' ? error.message : 'Kunne ikke tilføje øvelse til opgaver.';
      Alert.alert('Noget gik galt', message);
    } finally {
      if (isMountedRef.current) {
        setIsAddModalSaving(false);
        updateExerciseAddingState(targetExercise.id, false);
      }
    }
  }, [
    addModalExercise,
    addTaskToContext,
    buildTaskPayload,
    deriveSourceFolder,
    handleCloseAddModal,
    isExerciseAlreadyAdded,
    updateExerciseAddingState,
  ]);

  const handleRetry = useCallback(() => {
    setReloadNonce(n => n + 1);
  }, []);

  const handleToggleSearch = useCallback(() => {
    setSearchOpen(prev => {
      const next = !prev;
      if (!next) setSearchQuery('');
      return next;
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleCreateExercise = useCallback(() => {
    router.push('/create-exercise');
  }, [router]);

  useEffect(() => {
    if (!addedToTasksIds.size) return;
    setPersonalExercises(prev => prev.map(e => (addedToTasksIds.has(e.id) ? { ...e, is_added_to_tasks: true } : e)));
    setFootballCoachExercises(prev => prev.map(e => (addedToTasksIds.has(e.id) ? { ...e, is_added_to_tasks: true } : e)));
    setTrainerFolders(prev =>
      prev.map(t => ({ ...t, exercises: t.exercises.map(e => (addedToTasksIds.has(e.id) ? { ...e, is_added_to_tasks: true } : e)) }))
    );
  }, [addedToTasksIds]);

  useEffect(() => {
    const ids = Object.keys(counterOverrides);
    if (!ids.length) return;
    const set = new Set(ids);
    setPersonalExercises((prev) =>
      prev.map((exercise) => {
        if (!set.has(exercise.id)) return exercise;
        const override = counterOverrides[exercise.id];
        return override
          ? { ...exercise, last_score: override.last_score, execution_count: override.execution_count }
          : exercise;
      })
    );
    setFootballCoachExercises((prev) =>
      prev.map((exercise) => {
        if (!set.has(exercise.id)) return exercise;
        const override = counterOverrides[exercise.id];
        return override
          ? { ...exercise, last_score: override.last_score, execution_count: override.execution_count }
          : exercise;
      })
    );
    setTrainerFolders((prev) =>
      prev.map((folder) => ({
        ...folder,
        exercises: (folder.exercises || []).map((exercise) => {
          if (!set.has(exercise.id)) return exercise;
          const override = counterOverrides[exercise.id];
          return override
            ? { ...exercise, last_score: override.last_score, execution_count: override.execution_count }
            : exercise;
        }),
      }))
    );
  }, [counterOverrides]);

  useEffect(() => {
    const map = exerciseTaskMapRef.current;
    const exerciseIds = Object.keys(map || {});
    if (!exerciseIds.length) return;

    const existingTaskIds = new Set((tasksFromContext ?? []).map(t => String((t as any)?.id ?? '')));
    const removedExerciseIds = exerciseIds.filter(exId => {
      const taskId = map[exId];
      return !!taskId && !existingTaskIds.has(String(taskId));
    });

    if (!removedExerciseIds.length) return;

    const removedSet = new Set(removedExerciseIds);

    setExerciseTaskMap(prev => {
      const next = { ...prev };
      removedExerciseIds.forEach(id => {
        delete next[id];
      });
      return next;
    });

    setAddedToTasksIds(prev => {
      if (!prev.size) return prev;
      const next = new Set(prev);
      removedExerciseIds.forEach(id => next.delete(id));
      return next;
    });

    setPersonalExercises(prev => prev.map(e => (removedSet.has(e.id) ? { ...e, is_added_to_tasks: false } : e)));
    setFootballCoachExercises(prev => prev.map(e => (removedSet.has(e.id) ? { ...e, is_added_to_tasks: false } : e)));
    setTrainerFolders(prev =>
      prev.map(t => ({
        ...t,
        exercises: t.exercises.map(e => (removedSet.has(e.id) ? { ...e, is_added_to_tasks: false } : e)),
      }))
    );
  }, [tasksFromContext]);

  const sections: LibrarySection[] = useMemo(() => {
    const folderSection: LibrarySection = { key: 'folders', data: visibleFolderStack };
    const exerciseSection: LibrarySection = { key: 'exercises', title: selectedExerciseHeaderTitle, data: displayedExercises };
    return [folderSection, exerciseSection];
  }, [visibleFolderStack, selectedExerciseHeaderTitle, displayedExercises]);

  const exerciseSceneImageById = useMemo(
    () => buildExerciseSceneImageById(displayedExercises),
    [displayedExercises]
  );

  const scrollToTop = useCallback(() => {
    const ref = listRef.current as any;
    try {
      if (typeof ref?.scrollToOffset === 'function') {
        ref.scrollToOffset({ offset: 0, animated: true });
        return;
      }
      if (typeof ref?.scrollToLocation === 'function') {
        ref.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewPosition: 0, animated: true });
      }
    } catch {}
  }, []);

  const scrollToExercises = useCallback(() => {
    const ref = listRef.current as any;
    try {
      if (typeof ref?.scrollToLocation === 'function') {
        ref.scrollToLocation({ sectionIndex: 1, itemIndex: 0, viewPosition: 0, animated: true });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!pendingScrollToExercisesRef.current) return;
    if (!displayedExercises.length) {
      pendingScrollToExercisesRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      scrollToExercises();
      pendingScrollToExercisesRef.current = false;
    }, 60);
    return () => clearTimeout(t);
  }, [nav.root, nav.level2Id, nav.level3Id, displayedExercises.length, scrollToExercises]);

  const showAddModal = addModalOpen && !!addModalExercise;

  const renderSectionHeader = useCallback(
    ({ section }: { section: LibrarySection }) => {
      if (section.key !== 'exercises') return null;
      return (
        <View style={styles.exerciseHeaderRow}>
          <Pressable onPress={scrollToTop} style={styles.exerciseHeaderTitlePressable}>
            <Text style={[styles.exerciseHeaderTitle, { color: theme.text }]} numberOfLines={2}>
              {section.title || ''}
            </Text>
          </Pressable>
        </View>
      );
    },
    [theme, scrollToTop]
  );

  const renderItem = useCallback(
    ({ item, section }: { item: any; section: LibrarySection }) => {
      if (section.key === 'folders') {
        const folder = item as FolderVM;
        const isSelected = selectedPathIds.has(folder.id);
        return <FolderRow item={folder} onPress={handleFolderPress} isSelected={isSelected} />;
      }
      const ex = item as Exercise;
      let positionOverride: string | null = null;
      const isSearching = searchOpen && searchQuery.trim().length > 0;
      if (nav.root === 'footballcoach') {
        if (isSearching) {
          const posId = resolveFootballCoachPosId(ex.category_path);
          positionOverride = posId ? getHoldtraeningPositionTitle(posId) : null;
        } else if (nav.level3Id) {
          positionOverride = getHoldtraeningPositionTitle(nav.level3Id);
        }
      }
      return (
        <ExerciseCard
          exercise={ex}
          onPressCard={handlePressCard}
          onPressCta={handlePressCta}
          positionLabelOverride={positionOverride}
          isAddingToTasks={addingTaskIds.has(ex.id)}
          previewImageUri={exerciseSceneImageById[ex.id] ?? CARD_SCENE_IMAGES[0]}
        />
      );
    },
    [
      handleFolderPress,
      handlePressCard,
      handlePressCta,
      selectedPathIds,
      nav.root,
      nav.level3Id,
      searchOpen,
      searchQuery,
      addingTaskIds,
      exerciseSceneImageById,
    ]
  );

  const keyExtractor = useCallback((item: any, index: number) => {
    if ((item as FolderVM)?.kind) return `folder-${(item as FolderVM).id}`;
    if ((item as Exercise)?.id) return `exercise-${(item as Exercise).id}`;
    return `row-${index}`;
  }, []);

  const renderUpgradeGate = () => (
    <View style={[styles.stateCard, { backgroundColor: theme.card, gap: 16 }]}>
      <PremiumFeatureGate
        title="Biblioteket kræver Premium"
        description="Se FootballCoach øvelser, gem favorittræning og få fuld adgang ved at opgradere til Premium Spiller."
        onPress={() => router.push({ pathname: '/(tabs)/profile', params: { upgradeTarget: 'library' } })}
        icon={{ ios: 'book.fill', android: 'menu_book' }}
      />
    </View>
  );

  const renderTopBar = () => (
    <View style={styles.topBar}>
      <Text
        style={[styles.screenTitle, { color: theme.text }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        Bibliotek
      </Text>
      <View style={styles.topBarRight}>
        {canCreateExercise ? (
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.createButton, { backgroundColor: theme.primary }]}
            onPress={handleCreateExercise}
            testID="library.createExerciseButton"
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color="#fff" />
            <Text style={styles.createButtonText}>Opret øvelse</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity activeOpacity={0.8} style={styles.iconButton} onPress={handleToggleSearch}>
          <IconSymbol
            ios_icon_name={searchOpen ? 'xmark' : 'magnifyingglass'}
            android_material_icon_name={searchOpen ? 'close' : 'search'}
            size={22}
            color={theme.text}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderLoadingSkeleton = () => (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {renderTopBar()}
      {searchOpen ? (
        <View style={[styles.searchBarWrap, { backgroundColor: theme.card, borderColor: theme.highlight }]}>
          <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Søg øvelser..."
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.trim().length > 0 ? (
            <TouchableOpacity onPress={handleClearSearch} style={styles.iconButton} activeOpacity={0.8}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <View style={styles.listPad}>
        <SkeletonFolderRow level={1} />
        <SkeletonFolderRow level={1} />
        <SkeletonFolderRow level={1} />
        <View style={{ height: 12 }} />
        <SkeletonExerciseCard />
        <SkeletonExerciseCard />
      </View>
    </View>
  );

  if (isPlayer && subscriptionFeaturesLoading) {
    return renderLoadingSkeleton();
  }

  if (gateLibrary) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        {renderTopBar()}
        <View style={styles.listPad}>{renderUpgradeGate()}</View>
      </View>
    );
  }

  if (status === 'loading') {
    return renderLoadingSkeleton();
  }

  if (status === 'error') {
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        {renderTopBar()}
        {searchOpen ? (
          <View style={[styles.searchBarWrap, { backgroundColor: theme.card, borderColor: theme.highlight }]}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={theme.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Søg øvelser..."
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            <TouchableOpacity onPress={handleToggleSearch} style={styles.iconButton} activeOpacity={0.8}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={[styles.stateCard, { backgroundColor: theme.card }]} testID="library.errorState">
          <Text style={[styles.stateTitle, { color: theme.error }]}>Kunne ikke hente bibliotek</Text>
          <Text style={[styles.stateMessage, { color: theme.textSecondary }]}>{errorMessage}</Text>
          <TouchableOpacity
            onPress={handleRetry}
            activeOpacity={0.9}
            style={[styles.retryButton, { backgroundColor: theme.primary }]}
            testID="library.error.retryButton"
          >
            <Text style={styles.retryButtonText}>Prøv igen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]} testID="library.screen">
      {renderTopBar()}
      {searchOpen ? (
        <View style={[styles.searchBarWrap, { backgroundColor: theme.card, borderColor: theme.highlight }]}>
          <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Søg øvelser..."
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.trim().length > 0 ? (
            <TouchableOpacity onPress={handleClearSearch} style={styles.iconButton} activeOpacity={0.8}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <SectionList
        sections={sections as any}
        keyExtractor={keyExtractor}
        renderItem={renderItem as any}
        renderSectionHeader={renderSectionHeader as any}
        contentContainerStyle={styles.listPad}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={11}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS !== 'web'}
        ListEmptyComponent={
          isAtExerciseLevel ? (
            <View style={[styles.stateCard, { backgroundColor: theme.card }]}>
              {searchOpen && searchQuery.trim().length > 0 ? (
                <>
                  <Text style={[styles.stateTitle, { color: theme.text }]}>Ingen resultater</Text>
                  <Text style={[styles.stateMessage, { color: theme.textSecondary }]}>Prøv en anden søgning.</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.stateTitle, { color: theme.text }]}>Denne mappe er tom</Text>
                  <Text style={[styles.stateMessage, { color: theme.textSecondary }]}>Der er ingen øvelser i denne mappe endnu.</Text>
                  {canCreateExercise ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.retryButton, { backgroundColor: theme.primary }]}
                      onPress={handleCreateExercise}
                    >
                      <Text style={styles.retryButtonText}>Opret øvelse</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={<View style={{ height: 90 }} />}
        ref={listRef}
      />
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isAddModalSaving) {
            handleCloseAddModal();
          }
        }}
      >
        <Pressable style={styles.modalBackdrop} onPress={isAddModalSaving ? undefined : handleCloseAddModal}>
          <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Tilføj til opgaver</Text>
              <TouchableOpacity onPress={handleCloseAddModal} style={styles.iconButton} disabled={isAddModalSaving}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>
            {addModalExercise ? (
              <>
                <Text style={[styles.modalExerciseName, { color: theme.text }]} numberOfLines={2}>
                  {addModalExercise.title}
                </Text>
                <Text style={[styles.modalBodyText, { color: theme.textSecondary }]}>
                  Øvelsen tilføjes som opgave og vises straks under Tasks. Du kan redigere den senere fra Opgaver-fanen.
                </Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.modalActionPrimary, { backgroundColor: colors.success }]}
                    onPress={handleConfirmAddToTasks}
                    disabled={isAddModalSaving}
                    testID="library.addToTasksModal.confirmButton"
                  >
                    {isAddModalSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalActionPrimaryText}>Tilføj</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[styles.modalActionSecondary, { borderColor: theme.highlight }]}
                    onPress={handleCloseAddModal}
                    disabled={isAddModalSaving}
                  >
                    <Text style={[styles.modalActionSecondaryText, { color: theme.textSecondary }]}>Annuller</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    paddingTop: Platform.OS === 'android' ? 54 : 56,
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screenTitle: {
    fontSize: 34,
    fontWeight: '800',
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  topBarRight: { flexDirection: 'row', gap: 12, alignItems: 'center', flexShrink: 0 },
  iconButton: { padding: 6 },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  createButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  searchBarWrap: {
    marginHorizontal: 18,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },

  listPad: { paddingHorizontal: 18, paddingBottom: 16 },

  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  folderIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderTextWrap: { flex: 1, gap: 2 },
  folderTitle: { fontSize: 16, fontWeight: '700' },
  folderSubtitle: { fontSize: 13, fontWeight: '500' },
  folderRightBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 6,
  },
  folderRightBadgeText: { fontSize: 12, fontWeight: '800' },

  exerciseHeaderRow: {
    marginTop: 6,
    marginBottom: 10,
    gap: 10,
  },
  exerciseHeaderTitlePressable: { width: '100%' },
  exerciseHeaderTitle: { fontSize: 24, lineHeight: 30, fontWeight: '800', width: '100%' },

  exerciseCard: {
    borderRadius: 34,
    paddingLeft: 14,
    paddingTop: 0,
    paddingBottom: 0,
    paddingRight: 0,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
  },
  exerciseCardShadow: {
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 9,
  },
  exerciseTop: { flexDirection: 'row', alignItems: 'stretch', gap: 0, minHeight: 190 },
  // Keep left column above the hero image so the "Sværhedsgrad" text can sit on top of the fade.
  exerciseLeft: { flex: 1, minWidth: 0, paddingTop: 14, paddingBottom: 14, paddingRight: 14, gap: 10, position: 'relative', zIndex: 2 },
  exerciseRightColumn: { width: '50%', alignItems: 'stretch', position: 'relative', zIndex: 1 },
  exerciseRight: {
    flex: 1,
    minHeight: 190,
    position: 'relative',
    overflow: 'hidden',
    borderTopRightRadius: 34,
    borderBottomRightRadius: 34,
    // Make the hero image bleed further left under the fade (reference-like).
    width: '135%',
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
  },
  exerciseMediaPressable: { flex: 1, minHeight: 190 },
  thumb: { width: '100%', height: '100%' },
  mediaEdgeFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
  },
  mediaShade: {
    ...StyleSheet.absoluteFillObject,
  },
  pendingThumb: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  pendingThumbText: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
  },
  trophyWrap: { height: 18, justifyContent: 'center' },
  trophyEmoji: { fontSize: 18, lineHeight: 20 },
  trophySpacer: { height: 20 },

  exerciseTitle: { fontSize: 16, fontWeight: '900', lineHeight: 20, marginTop: 2 },
  exerciseRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    marginRight: -90,
    position: 'relative',
    zIndex: 4,
  },
  starRow: { flexDirection: 'row', gap: 1 },
  difficultyValue: { fontSize: 12, fontWeight: '800', flexShrink: 0 },
  positionPill: { width: '100%', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  positionPillText: { fontSize: 10, fontWeight: '800', lineHeight: 12 },
  exerciseStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  exerciseMetaLine: { fontSize: 10, lineHeight: 12, fontWeight: '800' },

  ctaBadge: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  ctaBadgeOverlay: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  ctaBadgeShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.36,
    shadowRadius: 18,
    elevation: 10,
  },
  ctaBadgeTransparent: { backgroundColor: '#2DA94A' },
  ctaGradientFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  ctaText: { fontSize: 11, fontWeight: '900', lineHeight: 13, flexShrink: 1, maxWidth: '100%', textAlign: 'center' },
  ctaChevronWrap: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  stateCard: {
    marginHorizontal: 18,
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
  },
  stateTitle: { fontSize: 16, fontWeight: '800' },
  stateMessage: { marginTop: 8, fontSize: 13, fontWeight: '500' },
  retryButton: { marginTop: 14, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  skeleton: { backgroundColor: 'rgba(128,128,128,0.20)' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    padding: 18,
  },
  modalSheet: {
    borderRadius: 18,
    padding: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalExerciseName: { marginTop: 8, fontSize: 15, fontWeight: '800' },
  modalBodyText: { marginTop: 10, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  modalActions: { marginTop: 14, gap: 10 },
  modalActionPrimary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalActionPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  modalActionSecondary: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  modalActionSecondaryText: { fontSize: 14, fontWeight: '900' },
});
