import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
  useColorScheme,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';

import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { AssignExerciseModal } from '@/components/AssignExerciseModal';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { resolveVideoUrl } from '@/utils/videoKey';

type Exercise = {
  id: string;
  title: string;
  description: string | null;
  video_key: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  difficulty: number | null;
  position: string | null;
  category_path: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_score?: number | null;
  execution_count?: number | null;
  trainer_id: string | null;
  is_system: boolean | null;
};

const clampDifficulty = (value: any): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
};

const formatMetaLine = (lastScore?: number | null, executionCount?: number | null) => {
  const scorePart = typeof lastScore === 'number' ? `Senest: ${lastScore}/10` : 'Senest: –/10';
  const countPart = typeof executionCount === 'number' && executionCount > 0 ? `Udført: ${executionCount}x` : 'Udført: –x';
  return `${scorePart}  |  ${countPart}`;
};

const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?v=)([^&?/]+)/i,
  /(?:youtu\.be\/)([^&?/]+)/i,
  /(?:youtube\.com\/embed\/)([^&?/]+)/i,
];

const VIMEO_PATTERNS = [
  /(?:player\.vimeo\.com\/video\/)(\d+)/i,
  /(?:vimeo\.com\/)(\d+)/i,
];

function deriveThumbnailFromVideoUrl(videoUrl: string | null): string | null {
  if (!videoUrl) return null;
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = videoUrl.match(pattern);
    if (match?.[1]) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  }
  for (const pattern of VIMEO_PATTERNS) {
    const match = videoUrl.match(pattern);
    if (match?.[1]) return `https://vumbnail.com/${match[1]}.jpg`;
  }
  return null;
}

function extractYouTubeId(videoUrl: string | null): string | null {
  if (!videoUrl) return null;
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = videoUrl.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractVimeoId(videoUrl: string | null): string | null {
  if (!videoUrl) return null;
  for (const pattern of VIMEO_PATTERNS) {
    const match = videoUrl.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildInlineVideoHtml(videoUrl: string, posterUrl?: string | null, autoPlay = false): string {
  const youtubeId = extractYouTubeId(videoUrl);
  const vimeoId = extractVimeoId(videoUrl);
  const embedUrl = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}?autoplay=${autoPlay ? 1 : 0}&playsinline=1&rel=0`
    : vimeoId
    ? `https://player.vimeo.com/video/${vimeoId}?autoplay=${autoPlay ? 1 : 0}&playsinline=1`
    : null;

  if (embedUrl) {
    const safeEmbedUrl = escapeHtml(embedUrl);
    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #0b1220;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
        background: #0b1220;
      }
    </style>
  </head>
  <body>
    <iframe src="${safeEmbedUrl}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
  </body>
</html>`;
  }

  const safeVideoUrl = escapeHtml(videoUrl);
  const posterAttr = posterUrl ? `poster="${escapeHtml(posterUrl)}"` : '';
  const autoplayAttr = autoPlay ? 'autoplay' : '';
  return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #0b1220;
      }
      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        background: #0b1220;
      }
    </style>
  </head>
  <body>
    <video id="video" controls playsinline webkit-playsinline preload="auto" ${autoplayAttr} ${posterAttr}>
      <source src="${safeVideoUrl}" />
    </video>
    <script>
      (function () {
        var v = document.getElementById('video');
        if (!v) return;
        if (${autoPlay ? 'true' : 'false'}) {
          function ensurePlaying() {
            try {
              v.muted = false;
              var p = v.play();
              if (p && typeof p.catch === 'function') {
                p.catch(function () {});
              }
            } catch (_) {}
          }
          v.addEventListener('loadeddata', ensurePlaying);
          v.addEventListener('canplay', ensurePlaying);
          ensurePlaying();
        }
      })();
    </script>
  </body>
</html>`;
}

export default function ExerciseDetailsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  const params = useLocalSearchParams();
  const roleInfo = useUserRole() as any;
  const roleRaw = roleInfo?.userRole ?? roleInfo?.role ?? null;
  const roleStr = typeof roleRaw === 'string' ? roleRaw.toLowerCase() : '';
  const isTrainerUser = Boolean(roleInfo?.isTrainer || roleStr.includes('trainer') || roleStr.includes('coach'));

  const exerciseId = useMemo(() => {
    const raw = (params as any)?.exerciseId;
    if (raw == null) return null;
    return String(Array.isArray(raw) ? raw[0] : raw).trim() || null;
  }, [params]);

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInlineVideoPlaying, setIsInlineVideoPlaying] = useState(false);

  const load = useCallback(async (id: string) => {
    try {
      setStatus('loading');
      setErrorMessage('');
      setExercise(null);

      const { data, error } = await supabase
        .from('exercise_library')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Øvelsen blev ikke fundet.');

      const normalized: Exercise = {
        id: String((data as any)?.id ?? ''),
        title: String((data as any)?.title ?? ''),
        description: (data as any)?.description ?? null,
        video_key: (data as any)?.video_key ? String((data as any).video_key) : null,
        video_url: (data as any)?.video_url ?? null,
        thumbnail_url: (data as any)?.thumbnail_url ?? null,
        difficulty:
          typeof (data as any)?.difficulty === 'number'
            ? (data as any).difficulty
            : (data as any)?.difficulty != null
            ? Number((data as any).difficulty)
            : null,
        position: (data as any)?.position ?? (data as any)?.player_position ?? null,
        category_path: (data as any)?.category_path ?? null,
        created_at: (data as any)?.created_at ?? null,
        updated_at: (data as any)?.updated_at ?? null,
        last_score:
          typeof (data as any)?.last_score === 'number'
            ? (data as any).last_score
            : (data as any)?.last_score != null
            ? Number((data as any).last_score)
            : null,
        execution_count:
          typeof (data as any)?.execution_count === 'number'
            ? (data as any).execution_count
            : (data as any)?.execution_count != null
            ? Number((data as any).execution_count)
            : null,
        trainer_id: (data as any)?.trainer_id ? String((data as any).trainer_id) : null,
        is_system: typeof (data as any)?.is_system === 'boolean' ? (data as any).is_system : !!(data as any)?.is_system,
      };

      setExercise(normalized);
      setStatus('success');
    } catch (e: any) {
      setStatus('error');
      setErrorMessage(e?.message || 'Kunne ikke hente øvelse.');
    }
  }, []);

  useEffect(() => {
    if (!exerciseId) return;
    load(exerciseId);
  }, [exerciseId, load]);

  useEffect(() => {
    setIsInlineVideoPlaying(false);
  }, [exercise?.id]);

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

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const resolvedVideoUrl = useMemo(() => resolveVideoUrl(exercise?.video_key || exercise?.video_url), [exercise?.video_key, exercise?.video_url]);
  const resolvedThumbnailUrl = useMemo(
    () => resolveVideoUrl(exercise?.thumbnail_url) || deriveThumbnailFromVideoUrl(resolvedVideoUrl),
    [exercise?.thumbnail_url, resolvedVideoUrl]
  );
  const handleStartVideo = useCallback(() => {
    if (!resolvedVideoUrl) return;
    setIsInlineVideoPlaying(true);
  }, [resolvedVideoUrl]);

  const difficulty = useMemo(() => clampDifficulty(exercise?.difficulty), [exercise?.difficulty]);
  const thumbUri = useMemo(
    () => resolvedThumbnailUrl || 'https://placehold.co/900x600/F1F5F9/0F172A?text=Video+preview',
    [resolvedThumbnailUrl]
  );
  const videoPlayerHtml = useMemo(
    () => (resolvedVideoUrl ? buildInlineVideoHtml(resolvedVideoUrl, resolvedThumbnailUrl, true) : null),
    [resolvedThumbnailUrl, resolvedVideoUrl]
  );

  const positionLabel = exercise?.position ?? 'Position: –';
  const positionIsPlaceholder = !exercise?.position;

  const hasTrophy = typeof exercise?.last_score === 'number' && Number.isFinite(exercise?.last_score);
  const hasVideo = !!resolvedVideoUrl;
  const assignModalExercise = useMemo(() => (exercise ? { id: exercise.id, title: exercise.title } : null), [exercise]);
  const canManageExercise = useMemo(() => {
    if (!exercise || !currentUserId) return false;
    if (exercise.is_system) return false;
    if (!exercise.trainer_id) return false;
    return exercise.trainer_id === currentUserId;
  }, [exercise, currentUserId]);
  const canShowAssignButton = useMemo(() => {
    if (!isTrainerUser) return false;
    return canManageExercise;
  }, [canManageExercise, isTrainerUser]);
  const handleOpenAssignModal = useCallback(() => {
    setAssignModalVisible(true);
  }, []);
  const handleCloseAssignModal = useCallback(() => {
    setAssignModalVisible(false);
  }, []);
  const handleAssignSuccess = useCallback(() => {
    if (exerciseId) {
      load(exerciseId);
    }
  }, [exerciseId, load]);

  const handleEditExercise = useCallback(() => {
    if (!exercise || !canManageExercise) return;
    router.push({ pathname: '/create-exercise', params: { exerciseId: exercise.id, mode: 'edit' } } as any);
  }, [exercise, canManageExercise, router]);

  const executeDeleteExercise = useCallback(async () => {
    if (!exercise || !currentUserId) return;
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('exercise_library')
        .delete()
        .eq('id', exercise.id)
        .eq('trainer_id', currentUserId);
      if (error) throw error;
      router.back();
    } catch (err: any) {
      Alert.alert('Fejl', err?.message || 'Kunne ikke slette øvelsen.');
    } finally {
      setIsDeleting(false);
    }
  }, [exercise, currentUserId, isDeleting, router]);

  const handleDeleteExercise = useCallback(() => {
    if (!exercise || !canManageExercise) return;
    Alert.alert(
      'Slet øvelse',
      `Er du sikker på at du vil slette "${exercise.title}"?`,
      [
        { text: 'Annuller', style: 'cancel' },
        { text: 'Slet', style: 'destructive', onPress: executeDeleteExercise },
      ],
      { cancelable: true }
    );
  }, [canManageExercise, executeDeleteExercise, exercise]);

  // --- JSX render ---
  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: 'Øvelse' }} />
      {!exerciseId ? (
        <View style={[styles.screen, { backgroundColor: theme.background }]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={styles.iconButton}>
              <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron_left" size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.topTitle, { color: theme.text }]} numberOfLines={1}>
              Øvelse
            </Text>
            <View style={{ width: 34 }} />
          </View>
          <View style={[styles.stateCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.stateTitle, { color: theme.text }]}>Mangler øvelse-id</Text>
            <Text style={[styles.stateMessage, { color: theme.textSecondary }]}>
              Prøv at gå tilbage til biblioteket og åbne øvelsen igen.
            </Text>
            <TouchableOpacity onPress={handleBack} activeOpacity={0.9} style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
              <Text style={styles.primaryButtonText}>Tilbage</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.screen, { backgroundColor: theme.background }]}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={styles.iconButton}>
              <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron_left" size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.topTitle, { color: theme.text }]} numberOfLines={1}>
              Øvelse
            </Text>
            <View style={{ width: 34 }} />
          </View>

          <ScrollView contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
            {status === 'loading' || status === 'idle' ? (
              <View style={[styles.card, { backgroundColor: theme.card }]}>
                <View style={[styles.thumbSkeleton, { backgroundColor: theme.highlight }]} />
                <View style={{ height: 14 }} />
                <View style={[styles.lineSkeleton, { width: '70%', backgroundColor: theme.highlight }]} />
                <View style={[styles.lineSkeleton, { width: '55%', backgroundColor: theme.highlight, marginTop: 10 }]} />
                <View style={{ height: 16 }} />
                <ActivityIndicator />
              </View>
            ) : null}

            {status === 'error' ? (
              <View style={[styles.stateCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.stateTitle, { color: theme.error }]}>Kunne ikke åbne øvelse</Text>
                <Text style={[styles.stateMessage, { color: theme.textSecondary }]}>{errorMessage}</Text>
                <TouchableOpacity onPress={() => load(exerciseId)} activeOpacity={0.9} style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
                  <Text style={styles.primaryButtonText}>Prøv igen</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {status === 'success' && exercise ? (
              <>
                <View style={[styles.card, { backgroundColor: theme.card }]}>
                  {/* Trophy badge */}
                  <View style={styles.trophyWrap}>
                    <Text style={[styles.trophyEmoji, !hasTrophy ? { opacity: 0.25 } : null]}>🏆</Text>
                  </View>

                  <View style={styles.thumbContainer}>
                    {hasVideo && isInlineVideoPlaying && videoPlayerHtml ? (
                      <WebView
                        source={{ html: videoPlayerHtml }}
                        style={styles.thumb}
                        allowsInlineMediaPlayback
                        allowsFullscreenVideo
                        javaScriptEnabled
                        domStorageEnabled
                        scrollEnabled={false}
                        bounces={false}
                        mediaPlaybackRequiresUserAction={false}
                        testID="exerciseDetails.videoPlayer"
                      />
                    ) : (
                      <Image source={{ uri: thumbUri }} style={styles.thumb} />
                    )}
                    {hasVideo && !isInlineVideoPlaying ? (
                      <TouchableOpacity
                        onPress={handleStartVideo}
                        activeOpacity={0.9}
                        style={styles.thumbPlayOverlay}
                        testID="exerciseDetails.videoOverlayPlay"
                      >
                        <IconSymbol ios_icon_name="play.fill" android_material_icon_name="play_arrow" size={18} color="#fff" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <Text style={[styles.title, { color: theme.text }]}>{exercise.title}</Text>

                  <View style={styles.metaRow}>
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

                    <View style={[styles.positionPill, { backgroundColor: theme.highlight }, positionIsPlaceholder ? { opacity: 0.55 } : null]}>
                      <Text style={[styles.positionPillText, { color: theme.textSecondary }]} numberOfLines={1}>
                        {positionLabel}
                      </Text>
                    </View>
                  </View>

                  {/* Meta line */}
                  <Text style={[styles.metaLine, { color: theme.textSecondary }]}>
                    {formatMetaLine(exercise.last_score, exercise.execution_count)}
                  </Text>

                  {exercise.description ? (
                    <Text style={[styles.description, { color: theme.textSecondary }]}>{exercise.description}</Text>
                  ) : (
                    <Text style={[styles.descriptionMuted, { color: theme.textSecondary }]}>Ingen beskrivelse endnu.</Text>
                  )}

                  {canShowAssignButton ? (
                    <TouchableOpacity
                      onPress={handleOpenAssignModal}
                      activeOpacity={0.9}
                      style={[styles.assignButton, { backgroundColor: colors.success }]}
                    >
                      <Text style={styles.assignButtonText}>Tildel</Text>
                    </TouchableOpacity>
                  ) : null}

                  {canManageExercise ? (
                    <View style={styles.manageRow}>
                      <TouchableOpacity
                        onPress={handleEditExercise}
                        activeOpacity={0.85}
                        disabled={isDeleting}
                        style={[styles.manageButton, { backgroundColor: theme.highlight }]}
                      >
                        <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={16} color={theme.text} />
                        <Text style={[styles.manageButtonText, { color: theme.text }]}>Rediger</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleDeleteExercise}
                        activeOpacity={0.85}
                        disabled={isDeleting}
                        style={[styles.manageButton, { backgroundColor: 'rgba(255,59,48,0.12)' }]}
                      >
                        {isDeleting ? (
                          <ActivityIndicator size="small" color={colors.error} />
                        ) : (
                          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={16} color={colors.error} />
                        )}
                        <Text style={[styles.manageButtonText, { color: colors.error }]}>{isDeleting ? 'Sletter...' : 'Slet'}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                <View style={{ height: 24 }} />
              </>
            ) : null}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}
      <AssignExerciseModal
        visible={assignModalVisible}
        exercise={assignModalExercise}
        trainerId={currentUserId}
        onClose={handleCloseAssignModal}
        onSuccess={handleAssignSuccess}
      />
    </>
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
  iconButton: { padding: 6 },
  topTitle: { fontSize: 18, fontWeight: '900' },

  contentPad: { paddingHorizontal: 18, paddingBottom: 18 },

  card: {
    borderRadius: 18,
    padding: 14,
    marginTop: 8,
  },

  trophyWrap: { height: 20, justifyContent: 'center', alignItems: 'flex-start', marginBottom: 2 },
  trophyEmoji: { fontSize: 18, lineHeight: 20 },

  thumbContainer: {
    width: '100%',
    height: 210,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: 10,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbPlayOverlay: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: { marginTop: 2, fontSize: 22, fontWeight: '900' },

  metaRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  starRow: { flexDirection: 'row', gap: 2 },

  positionPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, maxWidth: 180 },
  positionPillText: { fontSize: 12, fontWeight: '800' },

  metaLine: { marginTop: 10, fontSize: 13, fontWeight: '600' },

  description: { marginTop: 12, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  descriptionMuted: { marginTop: 12, fontSize: 14, fontWeight: '600', lineHeight: 20, opacity: 0.8 },

  stateCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
  },
  stateTitle: { fontSize: 16, fontWeight: '900' },
  stateMessage: { marginTop: 8, fontSize: 13, fontWeight: '600', lineHeight: 18 },

  primaryButton: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  assignButton: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  assignButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  manageRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  manageButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 10,
  },
  manageButtonText: { fontSize: 13, fontWeight: '800' },

  thumbSkeleton: { width: '100%', height: 210, borderRadius: 16 },
  lineSkeleton: { height: 14, borderRadius: 8 },
});
