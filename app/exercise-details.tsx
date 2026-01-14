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
  Linking,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

type Exercise = {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  difficulty: number | null;
  position: string | null;
  category_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const clampDifficulty = (value: any): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
};

export default function ExerciseDetailsScreen() {
  const router = useRouter();
  const theme = getColors(useColorScheme() === 'dark');
  const params = useLocalSearchParams();

  const exerciseId = useMemo(() => {
    const raw = (params as any)?.exerciseId;
    if (raw == null) return null;
    return String(Array.isArray(raw) ? raw[0] : raw).trim() || null;
  }, [params]);

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [exercise, setExercise] = useState<Exercise | null>(null);

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

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleOpenVideo = useCallback(async () => {
    const url = exercise?.video_url;
    if (!url) return;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('Kunne ikke åbne link', 'Linket kan ikke åbnes på denne enhed.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Kunne ikke åbne link', 'Prøv igen senere.');
    }
  }, [exercise?.video_url]);

  const difficulty = useMemo(() => clampDifficulty(exercise?.difficulty), [exercise?.difficulty]);
  const thumbUri = useMemo(() => exercise?.thumbnail_url || 'https://placehold.co/900x600/e2e8f0/e2e8f0', [exercise?.thumbnail_url]);

  if (!exerciseId) {
    return (
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
    );
  }

  return (
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
              <Image source={{ uri: thumbUri }} style={styles.thumb} />

              {exercise.video_url ? (
                <TouchableOpacity onPress={handleOpenVideo} activeOpacity={0.9} style={[styles.videoButton, { backgroundColor: theme.primary }]}>
                  <IconSymbol ios_icon_name="play.fill" android_material_icon_name="play_arrow" size={18} color="#fff" />
                  <Text style={styles.videoButtonText}>Åbn video</Text>
                </TouchableOpacity>
              ) : null}

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

                {exercise.position ? (
                  <View style={[styles.positionPill, { backgroundColor: theme.highlight }]}>
                    <Text style={[styles.positionPillText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {exercise.position}
                    </Text>
                  </View>
                ) : null}
              </View>

              {exercise.description ? (
                <Text style={[styles.description, { color: theme.textSecondary }]}>{exercise.description}</Text>
              ) : (
                <Text style={[styles.descriptionMuted, { color: theme.textSecondary }]}>Ingen beskrivelse endnu.</Text>
              )}
            </View>

            <View style={{ height: 24 }} />
          </>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>
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
  iconButton: { padding: 6 },
  topTitle: { fontSize: 18, fontWeight: '900' },

  contentPad: { paddingHorizontal: 18, paddingBottom: 18 },

  card: {
    borderRadius: 18,
    padding: 14,
  },

  thumb: {
    width: '100%',
    height: 210,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },

  videoButton: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  videoButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },

  title: { marginTop: 14, fontSize: 22, fontWeight: '900' },

  metaRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  starRow: { flexDirection: 'row', gap: 2 },

  positionPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, maxWidth: 180 },
  positionPillText: { fontSize: 12, fontWeight: '800' },

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

  thumbSkeleton: { width: '100%', height: 210, borderRadius: 16 },
  lineSkeleton: { height: 14, borderRadius: 8 },
});
