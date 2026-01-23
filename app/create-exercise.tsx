import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  useColorScheme,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';

const clampDifficulty = (value: number) => Math.max(0, Math.min(5, Math.round(value)));

export default function CreateExerciseScreen() {
  const router = useRouter();
  const theme = getColors(useColorScheme() === 'dark');
  const roleInfo = useUserRole() as any;
  const roleLoading = roleInfo?.isLoading ?? roleInfo?.loading ?? false;
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
  const { subscriptionTier } = useSubscriptionFeatures();
  const isTrainerByTier = subscriptionTier?.startsWith('trainer') ?? false;
  const canCreate = isAdmin || isTrainerLike || isTrainerByTier;

  const [userId, setUserId] = useState<string | null>(null);
  const [fetchingUser, setFetchingUser] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [categoryPath, setCategoryPath] = useState('');
  const [difficulty, setDifficulty] = useState(3);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setFetchingUser(true);
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error) throw error;
        setUserId(data?.user?.id ?? null);
      } catch (err: any) {
        if (!cancelled) {
          setErrorMessage(err?.message ?? 'Kunne ikke hente bruger.');
        }
      } finally {
        if (!cancelled) {
          setFetchingUser(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleAdjustDifficulty = useCallback((delta: number) => {
    setDifficulty(prev => clampDifficulty(prev + delta));
  }, []);

  const canSave = canCreate && !saving && title.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!canCreate) {
      Alert.alert('Kun for trænere', 'Opret øvelse kræver et træner-abonnement.');
      return;
    }
    if (!userId) {
      Alert.alert('Ingen bruger', 'Du skal være logget ind for at oprette en øvelse.');
      return;
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Tilføj en titel til øvelsen.');
      return;
    }

    // canCreate already enforces trainer/admin access

    setSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        title: trimmedTitle,
        trainer_id: userId,
        description: description.trim() ? description.trim() : null,
        video_url: videoUrl.trim() ? videoUrl.trim() : null,
        category_path: categoryPath.trim() ? categoryPath.trim() : null,
        difficulty,
        is_system: false,
      };

      const { data, error } = await supabase.from('exercise_library').insert(payload).select('id').single();

      if (error) throw error;

      const newId = data?.id ? String(data.id) : null;
      if (newId) {
        router.replace({ pathname: '/exercise-details', params: { exerciseId: newId } } as any);
      } else {
        router.back();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Kunne ikke oprette øvelse.');
    } finally {
      setSaving(false);
    }
  }, [canCreate, userId, categoryPath, description, difficulty, router, title, videoUrl, saving]);

  const renderStars = useMemo(
    () => (
      <View style={styles.starRow}>
        {Array.from({ length: 5 }).map((_, index) => (
          <IconSymbol
            key={`difficulty-${index}`}
            ios_icon_name="star.fill"
            android_material_icon_name="star"
            size={16}
            color={index < difficulty ? colors.warning : theme.highlight}
          />
        ))}
      </View>
    ),
    [difficulty, theme.highlight]
  );

  const renderForm = () => (
    <ScrollView contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Titel *</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Eks. Aflevering på førsteberøring"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.highlight }]}
          autoCapitalize="sentences"
          autoCorrect
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Beskrivelse</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Tilføj noter, fokuspunkter og coaching cues"
          placeholderTextColor={theme.textSecondary}
          style={[styles.multilineInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.highlight }]}
          autoCapitalize="sentences"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Kategori (valgfri)</Text>
        <TextInput
          value={categoryPath}
          onChangeText={setCategoryPath}
          placeholder="f.eks. holdtraening_back"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.highlight }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>Brug holdtraening_* for at placere øvelsen under FootballCoach.</Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Video-link (valgfri)</Text>
        <TextInput
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="https://"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.highlight }]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Sværhedsgrad</Text>
        <View style={[styles.difficultyCard, { backgroundColor: theme.card }]}> 
          <View style={styles.difficultyHeader}>
            <Text style={[styles.difficultyValue, { color: theme.text }]}>{difficulty}</Text>
            {renderStars}
          </View>
          <View style={styles.difficultyActions}>
            <TouchableOpacity
              onPress={() => handleAdjustDifficulty(-1)}
              activeOpacity={0.8}
              disabled={difficulty <= 0}
              style={[styles.adjustButton, { borderColor: theme.highlight }, difficulty <= 0 ? { opacity: 0.4 } : null]}
            >
              <IconSymbol ios_icon_name="minus" android_material_icon_name="remove" size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAdjustDifficulty(1)}
              activeOpacity={0.8}
              disabled={difficulty >= 5}
              style={[styles.adjustButton, { borderColor: theme.highlight }, difficulty >= 5 ? { opacity: 0.4 } : null]}
            >
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );

  const screenHeader = <Stack.Screen options={{ headerShown: false, title: 'Opret øvelse' }} />;

  if (roleLoading || fetchingUser) {
    return (
      <>
        {screenHeader}
        <View style={[styles.lockedContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.lockedSubtitle, { marginTop: 12 }]}>Indlæser...</Text>
        </View>
      </>
    );
  }

  if (!canCreate) {
    return (
      <>
        {screenHeader}
        <View style={[styles.lockedContainer, { backgroundColor: theme.background }]}>
          <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={48} color={colors.textSecondary} />
          <Text style={styles.lockedTitle}>Ingen adgang</Text>
          <Text style={styles.lockedSubtitle}>Opret øvelse kræver et træner-abonnement. Gå til din profil for at opgradere.</Text>
          <TouchableOpacity style={styles.lockedButton} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.lockedButtonText}>Gå til profil</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      {screenHeader}
      <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={styles.iconButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron_left" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Opret øvelse</Text>
          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.9}
            disabled={!canSave}
            style={[styles.saveButton, { backgroundColor: theme.primary }, !canSave ? { opacity: 0.5 } : null]}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Gemmer...' : 'Gem'}</Text>
          </TouchableOpacity>
        </View>

        {errorMessage ? (
          <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
        ) : null}

        {renderForm()}
      </KeyboardAvoidingView>
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
  title: { fontSize: 20, fontWeight: '900' },
  saveButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  errorText: {
    marginHorizontal: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  contentPad: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  multilineInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    minHeight: 140,
  },
  helperText: { fontSize: 12, marginTop: 6 },
  difficultyCard: {
    borderRadius: 16,
    padding: 14,
  },
  difficultyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  difficultyValue: { fontSize: 22, fontWeight: '900' },
  difficultyActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 12,
  },
  adjustButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  starRow: { flexDirection: 'row', gap: 4 },
  stateCard: {
    marginHorizontal: 18,
    marginTop: 24,
    padding: 18,
    borderRadius: 16,
  },
  stateTitle: { fontSize: 16, fontWeight: '800' },
  stateMessage: { marginTop: 8, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  primaryButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  saveDisabled: { opacity: 0.5 },
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockedTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  lockedSubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  lockedButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  lockedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
