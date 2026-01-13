import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Platform,
  FlatList,
  Image,
} from 'react-native';
import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Types
interface Exercise {
  id: string;
  trainer_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
  is_system: boolean;
  category_path: string | null;
  difficulty: number | null;
  position: string | null;
  // Dynamic properties
  trainer_name?: string;
  last_score?: number | null;
  execution_count?: number;
  is_added_to_tasks?: boolean;
}

interface Folder {
  id: string;
  name: string;
  type: 'root' | 'category' | 'position';
  icon: string;
  androidIcon: string;
  count?: number;
  subfolders?: Folder[];
}

type NavigationPath = { id: string; name: string };

// Constants
const ROOT_FOLDERS_TRAINER: Folder[] = [
  { id: 'personal', name: 'Personlige øvelser', type: 'root', icon: 'person.fill', androidIcon: 'person' },
  { id: 'footballcoach', name: 'FootballCoach fokusområder', type: 'root', icon: 'star.fill', androidIcon: 'star' },
];

const ROOT_FOLDERS_PLAYER: Folder[] = [
  { id: 'trainer', name: 'Øvelser fra træner', type: 'root', icon: 'person.2.fill', androidIcon: 'groups' },
  { id: 'footballcoach', name: 'FootballCoach fokusområder', type: 'root', icon: 'star.fill', androidIcon: 'star' },
];

const FOOTBALLCOACH_STRUCTURE: Folder[] = [
  {
    id: 'holdtraening',
    name: 'Holdtræning',
    type: 'category',
    icon: 'person.3.fill',
    androidIcon: 'groups',
    subfolders: [
      { id: 'holdtraening_faelles', name: 'Fælles (alle positioner)', type: 'position', icon: 'star.fill', androidIcon: 'star' },
      { id: 'holdtraening_maalmand', name: 'Målmand', type: 'position', icon: 'hand.raised.fill', androidIcon: 'sports_soccer' },
      { id: 'holdtraening_forsvar', name: 'Forsvar', type: 'position', icon: 'shield.fill', androidIcon: 'shield' },
      { id: 'holdtraening_midtbane', name: 'Midtbane', type: 'position', icon: 'circle.grid.cross.fill', androidIcon: 'grid_on' },
      { id: 'holdtraening_angriber', name: 'Angriber', type: 'position', icon: 'flame.fill', androidIcon: 'local_fire_department' },
    ],
  },
  {
    id: 'selvtraening',
    name: 'Selvtræning',
    type: 'category',
    icon: 'person.fill',
    androidIcon: 'person',
    subfolders: [
      { id: 'selvtraening_faelles', name: 'Fælles', type: 'position', icon: 'star.fill', androidIcon: 'star' },
      { id: 'selvtraening_maalmand', name: 'Målmand', type: 'position', icon: 'hand.raised.fill', androidIcon: 'sports_soccer' },
      { id: 'selvtraening_forsvar', name: 'Forsvar', type: 'position', icon: 'shield.fill', androidIcon: 'shield' },
      { id: 'selvtraening_midtbane', name: 'Midtbane', type: 'position', icon: 'circle.grid.cross.fill', androidIcon: 'grid_on' },
      { id: 'selvtraening_angriber', name: 'Angriber', type: 'position', icon: 'flame.fill', androidIcon: 'local_fire_department' },
    ],
  },
];

// Skeleton Components
const FolderSkeleton = () => {
  const theme = getColors(useColorScheme() === 'dark');
  return (
    <View style={[styles.folderRow, { backgroundColor: theme.card }]}>
      <View style={[styles.skeleton, { width: 24, height: 24, borderRadius: 12 }]} />
      <View style={[styles.skeleton, { flex: 1, height: 20, borderRadius: 4 }]} />
      <View style={[styles.skeleton, { width: 20, height: 20, borderRadius: 4 }]} />
    </View>
  );
};

const ExerciseSkeleton = () => {
  const theme = getColors(useColorScheme() === 'dark');
  return (
    <View style={[styles.exerciseCard, { backgroundColor: theme.card }]}>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flex: 1, gap: 12 }}>
          <View style={[styles.skeleton, { height: 20, width: '80%', borderRadius: 4 }]} />
          <View style={[styles.skeleton, { height: 16, width: '60%', borderRadius: 4 }]} />
          <View style={[styles.skeleton, { height: 14, width: '40%', borderRadius: 4 }]} />
        </View>
        <View style={[styles.skeleton, { width: 80, height: 80, borderRadius: 8 }]} />
      </View>
    </View>
  );
};

// UI Components
const Breadcrumb = memo(({ path, onNavigate, color }: { path: NavigationPath[]; onNavigate: (index: number) => void; color: string }) => (
  <View style={styles.breadcrumbContainer}>
    <TouchableOpacity onPress={() => onNavigate(-1)} style={styles.breadcrumbItem}>
      <Text style={[styles.breadcrumbText, { color }]}>Mapper</Text>
    </TouchableOpacity>
    {path.map((p, i) => (
      <React.Fragment key={p.id}>
        <Text style={[styles.breadcrumbSeparator, { color }]}>›</Text>
        <TouchableOpacity onPress={() => onNavigate(i)} style={styles.breadcrumbItem}>
          <Text style={[styles.breadcrumbText, { color }]}>{p.name}</Text>
        </TouchableOpacity>
      </React.Fragment>
    ))}
  </View>
));

const FolderRow = memo(({ folder, onPress }: { folder: Folder; onPress: (folder: Folder) => void }) => {
  const theme = getColors(useColorScheme() === 'dark');
  const handlePress = useCallback(() => onPress(folder), [onPress, folder]);

  return (
    <TouchableOpacity style={[styles.folderRow, { backgroundColor: theme.card }]} onPress={handlePress}>
      <IconSymbol ios_icon_name={folder.icon} android_material_icon_name={folder.androidIcon} size={24} color={theme.primary} />
      <Text style={[styles.folderName, { color: theme.text }]}>{folder.name}</Text>
      {folder.count !== undefined && (
        <View style={[styles.countBadge, { backgroundColor: theme.highlight }]}>
          <Text style={[styles.countText, { color: theme.textSecondary }]}>{folder.count}</Text>
        </View>
      )}
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={20} color={theme.textSecondary} />
    </TouchableOpacity>
  );
});

const ExerciseCard = memo(({ exercise, onAddToTasks, onNavigate }: { exercise: Exercise; onAddToTasks: (exercise: Exercise) => void; onNavigate: (exercise: Exercise) => void }) => {
  const theme = getColors(useColorScheme() === 'dark');
  const handlePress = useCallback(() => onNavigate(exercise), [onNavigate, exercise]);
  const handleCtaPress = useCallback(() => onAddToTasks(exercise), [onAddToTasks, exercise]);

  const metaInfo = [
    exercise.last_score !== null && exercise.last_score !== undefined && `Senest: ${exercise.last_score}/10`,
    exercise.execution_count !== null && exercise.execution_count !== undefined && `Udført: ${exercise.execution_count}x`,
  ].filter(Boolean).join(' | ');

  return (
    <TouchableOpacity style={[styles.exerciseCard, { backgroundColor: theme.card }]} onPress={handlePress}>
      <View style={styles.exerciseContent}>
        <View style={styles.exerciseLeft}>
          {exercise.last_score !== null && exercise.last_score !== undefined && (
            <IconSymbol ios_icon_name="trophy.fill" android_material_icon_name="emoji_events" size={20} color={colors.warning} style={styles.trophyIcon} />
          )}
          <Text style={[styles.exerciseTitle, { color: theme.text }]} numberOfLines={2}>{exercise.title}</Text>
          <View style={styles.metaRow}>
            <View style={styles.starRating}>
              {[...Array(5)].map((_, i) => (
                <IconSymbol key={i} ios_icon_name="star.fill" android_material_icon_name="star" size={14} color={i < (exercise.difficulty || 0) ? colors.warning : theme.highlight} />
              ))}
            </View>
            {exercise.position && (
              <View style={[styles.positionBadge, { backgroundColor: theme.highlight }]}>
                <Text style={[styles.positionText, { color: theme.textSecondary }]}>{exercise.position}</Text>
              </View>
            )}
          </View>
          {metaInfo ? <Text style={[styles.metaInfo, { color: theme.textSecondary }]}>{metaInfo}</Text> : null}
        </View>
        <View style={styles.exerciseRight}>
          <Image source={{ uri: exercise.thumbnail_url || 'https://placehold.co/100x100/e2e8f0/e2e8f0' }} style={styles.thumbnail} />
          {exercise.video_url && (
            <View style={styles.playOverlay}>
              <IconSymbol ios_icon_name="play.circle.fill" android_material_icon_name="play_circle_filled" size={32} color="rgba(255,255,255,0.8)" />
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.ctaButton,
          exercise.is_added_to_tasks ? { backgroundColor: theme.highlight, borderWidth: 0 } : { backgroundColor: colors.success, borderWidth: 0 },
        ]}
        onPress={handleCtaPress}
      >
        {exercise.is_added_to_tasks && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color={theme.textSecondary} />}
        <Text style={[styles.ctaText, exercise.is_added_to_tasks ? { color: theme.textSecondary } : { color: '#fff' }]}>
          {exercise.is_added_to_tasks ? 'Allerede tilføjet til opgaver' : 'Tilføj til opgaver'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default function LibraryScreen() {
  const { isAdmin } = useUserRole();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = getColors(useColorScheme() === 'dark');

  const [status, setStatus] = useState<'loading' | 'success' | 'empty' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [navigationPath, setNavigationPath] = useState<NavigationPath[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Fetch current user ID
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
    };
    fetchUser();
  }, []);

  // Fetch all library data on focus or user change
  useFocusEffect(
    useCallback(() => {
      if (!currentUserId) return;

      let isActive = true;

      const fetchLibraryData = async () => {
        if (!isActive) return;
        setStatus('loading');

        // Try RPC first
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_library_exercises', { p_user_id: currentUserId });

          if (rpcError) {
            const isMissingFunction =
              rpcError.code === 'PGRST202' ||
              (rpcError.message && (rpcError.message.includes('Could not find the function') || rpcError.message.includes('relation "get_user_library_exercises" does not exist')));
            
            if (!isMissingFunction) {
              throw rpcError; // Not a "missing function" error, so treat as a real error
            }
            // If it is a missing function error, we'll fall through to the table-based fallback below.
            console.log('[Library] RPC function not found, falling back to table scan.');
          } else {
            const exercises = Array.isArray(rpcData) ? rpcData : [];
            if (exercises.length > 0) {
              if (isActive) {
                setAllExercises(exercises as Exercise[]);
                setStatus('success');
              }
              return; // Success with RPC
            }
            console.log('[Library] RPC returned 0 rows, falling back to table scan.');
          }
        } catch (err: any) {
           if (isActive) {
            setErrorMessage(err.message || 'Ukendt DB fejl ved RPC kald');
            setStatus('error');
          }
          return; // Hard error from RPC
        }


        // Fallback to table guessing
        const candidates = ['task_templates', 'exercises', 'library_exercises', 'exercise_library', 'exercise_templates'];
        let lastError: any = null;

        const normalize = (row: any, candidate: string, idx: number): Exercise => ({
          id: row.id ?? row.exercise_id ?? row.template_id ?? `${candidate}-${idx}`,
          trainer_id: row.trainer_id ?? row.created_by ?? row.user_id ?? '',
          title: row.title ?? row.name ?? '',
          description: row.description ?? row.notes ?? null,
          video_url: row.video_url ?? row.video ?? null,
          thumbnail_url: row.thumbnail_url ?? row.thumbnail ?? row.image_url ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
          updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
          is_system: Boolean(row.is_system ?? row.isSystem ?? row.system ?? false),
          category_path: row.category_path ?? row.category ?? row.folder_id ?? row.source_folder ?? null,
          difficulty:
            typeof row.difficulty === 'number'
              ? row.difficulty
              : typeof row.stars === 'number'
                ? row.stars
                : null,
          position: row.position ?? row.player_position ?? null,
          trainer_name: row.trainer_name ?? row.author_name ?? undefined,
          last_score: typeof row.last_score === 'number' ? row.last_score : null,
          execution_count: typeof row.execution_count === 'number' ? row.execution_count : undefined,
          is_added_to_tasks: Boolean(row.is_added_to_tasks ?? row.added_to_tasks ?? row.isAddedToTasks ?? false),
        });

        for (const candidate of candidates) {
          try {
            const { data, error } = await supabase.from(candidate).select('*');

            if (error) {
              const msg = error.message || '';
              const isMissingTable =
                error.code === 'PGRST205' ||
                error.code === '42P01' ||
                msg.includes('Could not find the table') ||
                (msg.includes('relation') && msg.includes('does not exist'));

              if (isMissingTable) {
                console.log(`[Library] Relation "${candidate}" not found, trying next...`);
                lastError = error;
                continue;
              }

              throw error;
            }

            if (isActive) {
              const rows = Array.isArray(data) ? data : [];
              const normalized = rows.map((row, idx) => normalize(row, candidate, idx));
              setAllExercises(normalized);
              setStatus(normalized.length > 0 ? 'success' : 'empty');
              return; // Success, stop loop
            }
            return; // Component unmounted, stop.
          } catch (err) {
            lastError = err;
            console.error(`[Library] Error fetching from "${candidate}":`, err);
          }
        }

        if (isActive) {
          setErrorMessage(lastError?.message || 'Ukendt DB fejl');
          setStatus('error');
        }
      };

      fetchLibraryData();

      return () => {
        isActive = false;
      };
    }, [currentUserId, reloadNonce])
  );

  const handleNavigatePath = useCallback((index: number) => {
    setNavigationPath(prev => prev.slice(0, index + 1));
  }, []);

  const handleSelectFolder = useCallback((folder: Folder) => {
    setNavigationPath(prev => [...prev, { id: folder.id, name: folder.name }]);
  }, []);

  const handleAddToTasks = useCallback((exercise: Exercise) => {
    // TODO: Implement modal/bottom sheet for adding to tasks
    console.log('Add to tasks:', exercise.id);
    // Optimistic update
    setAllExercises(prev => prev.map(e => e.id === exercise.id ? { ...e, is_added_to_tasks: !e.is_added_to_tasks } : e));
  }, []);

  const handleNavigateToExercise = useCallback((exercise: Exercise) => {
    router.push({ pathname: '/exercise-details', params: { exerciseId: exercise.id } });
  }, [router]);

  const { currentFolders, currentExercises } = useMemo(() => {
    if (navigationPath.length === 0) {
      const rootFolders = isAdmin ? ROOT_FOLDERS_TRAINER : ROOT_FOLDERS_PLAYER;
      const foldersWithCounts = rootFolders.map(folder => {
        let count = 0;
        if (folder.id === 'personal') {
          count = allExercises.filter(e => !e.is_system && e.trainer_id === currentUserId).length;
        } else if (folder.id === 'trainer') {
          count = allExercises.filter(e => !e.is_system && e.trainer_id !== currentUserId).length;
        } else if (folder.id === 'footballcoach') {
          count = allExercises.filter(e => e.is_system).length;
        }
        return { ...folder, count };
      });
      return { currentFolders: foldersWithCounts, currentExercises: [] };
    }

    const pathIds = navigationPath.map(p => p.id);
    const level = navigationPath.length;
    const rootId = pathIds[0];

    if (rootId === 'footballcoach') {
      if (level === 1) {
        return { currentFolders: FOOTBALLCOACH_STRUCTURE, currentExercises: [] };
      }
      if (level === 2) {
        const category = FOOTBALLCOACH_STRUCTURE.find(c => c.id === pathIds[1]);
        return { currentFolders: category?.subfolders || [], currentExercises: [] };
      }
      if (level === 3) {
        const exercises = allExercises.filter(e => e.category_path === pathIds[2]);
        return { currentFolders: [], currentExercises: exercises };
      }
    }

    if (rootId === 'personal' && isAdmin) {
      const exercises = allExercises.filter(e => !e.is_system && e.trainer_id === currentUserId);
      return { currentFolders: [], currentExercises: exercises };
    }

    if (rootId === 'trainer' && !isAdmin) {
      const exercises = allExercises.filter(e => !e.is_system && e.trainer_id !== currentUserId);
      const trainers = [...new Set(exercises.map(e => e.trainer_name || 'Ukendt træner'))];

      if (level === 1) {
        const trainerFolders = trainers.map(name => ({
          id: `trainer_${name}`,
          name,
          type: 'category' as const,
          icon: 'person.crop.circle.fill',
          androidIcon: 'account_circle',
          count: exercises.filter(e => (e.trainer_name || 'Ukendt træner') === name).length,
        }));
        return { currentFolders: trainerFolders, currentExercises: [] };
      }
      if (level === 2) {
        const trainerName = pathIds[1].replace('trainer_', '');
        const trainerExercises = exercises.filter(e => (e.trainer_name || 'Ukendt træner') === trainerName);
        return { currentFolders: [], currentExercises: trainerExercises };
      }
    }

    return { currentFolders: [], currentExercises: [] };
  }, [navigationPath, allExercises, isAdmin, currentUserId]);

  const renderContent = () => {
    if (status === 'loading') {
      return (
        <View style={styles.contentContainer}>
          {[...Array(4)].map((_, i) => <FolderSkeleton key={`fs-${i}`} />)}
          {[...Array(3)].map((_, i) => <ExerciseSkeleton key={`es-${i}`} />)}
        </View>
      );
    }

    if (status === 'error') {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setReloadNonce(n => n + 1)}>
            <Text style={styles.retryButtonText}>Prøv igen</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === 'empty') {
      return (
        <View style={styles.centerContainer}>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Biblioteket er tomt.</Text>
          {isAdmin && (
            <TouchableOpacity style={styles.createExerciseButton} onPress={() => { /* TODO */ }}>
              <Text style={styles.createExerciseButtonText}>Opret din første øvelse</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    const listData = [
      ...currentFolders.map(item => ({ type: 'folder', item })),
      ...(currentExercises.length > 0 ? [{ type: 'header', title: navigationPath.at(-1)?.name }] : []),
      ...currentExercises.map(item => ({ type: 'exercise', item })),
    ];

    return (
      <FlatList
        data={listData}
        keyExtractor={item => `${item.type}-${item.item?.id || item.title}`}
        contentContainerStyle={styles.contentContainer}
        renderItem={({ item }) => {
          if (item.type === 'folder') {
            return <FolderRow folder={item.item} onPress={handleSelectFolder} />;
          }
          if (item.type === 'exercise') {
            return <ExerciseCard exercise={item.item} onAddToTasks={handleAddToTasks} onNavigate={handleNavigateToExercise} />;
          }
          if (item.type === 'header' && item.title) {
            return <Text style={[styles.listHeader, { color: theme.text }]}>{item.title}</Text>;
          }
          return null;
        }}
        ListEmptyComponent={
          <View style={styles.centerContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Denne mappe er tom.</Text>
          </View>
        }
        initialNumToRender={10}
        windowSize={11}
        removeClippedSubviews={Platform.OS !== 'web'}
      />
    );
  };

  return (
    <LinearGradient colors={[theme.background, theme.backgroundAlt]} style={styles.flexOne}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {navigationPath.length > 0 && (
            <TouchableOpacity onPress={() => handleNavigatePath(navigationPath.length - 2)} style={styles.backButton}>
              <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={theme.text} />
            </TouchableOpacity>
          )}
          <Text style={[styles.title, { color: theme.text }]}>Bibliotek</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity><IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={24} color={theme.text} /></TouchableOpacity>
            <TouchableOpacity><IconSymbol ios_icon_name="person.circle" android_material_icon_name="account_circle" size={26} color={theme.text} /></TouchableOpacity>
          </View>
        </View>
        <View style={[styles.breadcrumbWrapper, { backgroundColor: theme.card }]}>
          <Breadcrumb path={navigationPath} onNavigate={handleNavigatePath} color={theme.textSecondary} />
        </View>
        {renderContent()}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { paddingRight: 8, paddingVertical: 4 },
  title: { fontSize: 34, fontWeight: 'bold' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  breadcrumbWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  breadcrumbContainer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  breadcrumbItem: { paddingVertical: 4 },
  breadcrumbText: { fontSize: 14, fontWeight: '500' },
  breadcrumbSeparator: { marginHorizontal: 8, fontSize: 14 },
  contentContainer: { paddingHorizontal: 16, paddingBottom: 100 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryButton: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptyText: { fontSize: 16, textAlign: 'center' },
  createExerciseButton: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 16 },
  createExerciseButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  listHeader: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, marginTop: 16 },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  folderName: { flex: 1, fontSize: 16, fontWeight: '600' },
  countBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: '700' },
  exerciseCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  exerciseContent: { flexDirection: 'row', gap: 16 },
  exerciseLeft: { flex: 1, gap: 8 },
  trophyIcon: { position: 'absolute', top: -4, left: -4 },
  exerciseTitle: { fontSize: 17, fontWeight: 'bold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  starRating: { flexDirection: 'row' },
  positionBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  positionText: { fontSize: 12, fontWeight: '600' },
  metaInfo: { fontSize: 13, fontWeight: '500' },
  exerciseRight: {},
  thumbnail: { width: 80, height: 80, borderRadius: 8 },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  ctaText: { fontSize: 14, fontWeight: 'bold' },
  skeleton: { backgroundColor: 'rgba(128,128,128,0.2)' },
});
