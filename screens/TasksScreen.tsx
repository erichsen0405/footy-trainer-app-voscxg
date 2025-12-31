import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  FlatList,
  Alert,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useFootballData } from '@/hooks/useFootballData';
import TaskCard from '@/components/TaskCard';
import { Task } from '@/types';
import { colors, getColors } from '@/styles/commonStyles';

type FolderType = 'personal' | 'trainer' | 'footballcoach';

type FolderItem = {
  id: string;
  name: string;
  type: FolderType;
  tasks: Task[];
};

function organizeFolders(templateTasks: Task[]): FolderItem[] {
  const personalTasks: Task[] = [];
  const trainerFolders = new Map<string, FolderItem>();
  const footballCoachTasks: Task[] = [];

  templateTasks.forEach(task => {
    const sourceFolder = (task as any)?.source_folder as string | undefined;

    if (sourceFolder && sourceFolder.startsWith('Fra træner:')) {
      const trainerName = sourceFolder.replace('Fra træner:', '').trim();
      const trainerId = `trainer_${trainerName || 'unknown'}`;

      if (!trainerFolders.has(trainerId)) {
        trainerFolders.set(trainerId, {
          id: trainerId,
          name: `Fra træner: ${trainerName || 'Ukendt'}`,
          type: 'trainer',
          tasks: [],
        });
      }

      trainerFolders.get(trainerId)!.tasks.push(task);
      return;
    }

    if (sourceFolder === 'FootballCoach Inspiration') {
      footballCoachTasks.push(task);
      return;
    }

    personalTasks.push(task);
  });

  const folders: FolderItem[] = [];

  if (personalTasks.length) {
    folders.push({
      id: 'personal',
      name: 'Personligt oprettet',
      type: 'personal',
      tasks: personalTasks,
    });
  }

  const trainerList = Array.from(trainerFolders.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  folders.push(...trainerList);

  if (footballCoachTasks.length) {
    folders.push({
      id: 'footballcoach',
      name: 'FootballCoach Inspiration',
      type: 'footballcoach',
      tasks: footballCoachTasks,
    });
  }

  return folders;
}

export default function TasksScreen() {
  const { tasks, duplicateTask, deleteTask, refreshData, isLoading } = useFootballData();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getColors(isDark);

  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const folders = useMemo(() => organizeFolders((tasks || []).filter(Boolean) as Task[]), [tasks]);

  useEffect(() => {
    // Auto-expand first folder on first load (and keep user toggles afterwards)
    if (folders.length && expanded.size === 0) {
      setExpanded(new Set([folders[0].id]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } catch (e: any) {
      Alert.alert('Fejl', 'Kunne ikke opdatere: ' + (e?.message || 'Ukendt fejl'));
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  const handleDuplicateTask = useCallback(
    async (taskId: string) => {
      try {
        await duplicateTask(taskId);
      } catch (error: any) {
        Alert.alert(
          'Fejl',
          'Kunne ikke duplikere opgaven: ' + (error?.message || 'Ukendt fejl'),
        );
      }
    },
    [duplicateTask],
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      try {
        await deleteTask(taskId);
      } catch (error: any) {
        Alert.alert('Fejl', 'Kunne ikke slette opgaven: ' + (error?.message || 'Ukendt fejl'));
      }
    },
    [deleteTask],
  );

  const toggleFolder = useCallback((folderId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const renderTask = useCallback(
    ({ item }: { item: Task }) => (
      <TaskCard
        task={item}
        onDuplicate={() => void handleDuplicateTask(item.id)}
        onDelete={() => void handleDeleteTask(item.id)}
      />
    ),
    [handleDuplicateTask, handleDeleteTask],
  );

  const renderFolder = useCallback(
    ({ item }: { item: FolderItem }) => {
      const isOpen = expanded.has(item.id);

      return (
        <View style={styles.folderWrap}>
          <TouchableOpacity style={styles.folderHeader} onPress={() => toggleFolder(item.id)}>
            <Text style={styles.folderTitle}>{item.name}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.tasks.length}</Text>
            </View>
            <Text style={styles.chevron}>{isOpen ? '▾' : '▸'}</Text>
          </TouchableOpacity>

          {isOpen && (
            <View style={styles.folderBody}>
              <FlatList
                data={item.tasks}
                keyExtractor={(t) => t.id}
                renderItem={renderTask}
                scrollEnabled={false}
                removeClippedSubviews={Platform.OS !== 'web'}
                initialNumToRender={6}
                maxToRenderPerBatch={6}
                windowSize={7}
              />
            </View>
          )}
        </View>
      );
    },
    [expanded, toggleFolder, renderTask],
  );

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: themeColors.background },
    content: { paddingHorizontal: 16, paddingVertical: 12 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: themeColors.background },

    folderWrap: { marginBottom: 10 },
    folderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 12,
      backgroundColor: themeColors.cardBackground,
    },
    folderTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: themeColors.text },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: themeColors.primary,
      marginRight: 10,
    },
    badgeText: { color: themeColors.onPrimary, fontSize: 12, fontWeight: '700' },
    chevron: { fontSize: 16, fontWeight: '700', color: themeColors.text },
    folderBody: { marginTop: 8 },

    empty: { padding: 24, alignItems: 'center' },
    emptyText: { fontSize: 14, opacity: 0.7, color: themeColors.textSecondary },
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={folders}
        keyExtractor={(f) => f.id}
        renderItem={renderFolder}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        removeClippedSubviews={Platform.OS !== 'web'}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={10}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Ingen opgaver endnu</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingVertical: 12 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  folderWrap: { marginBottom: 10 },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  folderTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#111',
    marginRight: 10,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chevron: { fontSize: 16, fontWeight: '700' },
  folderBody: { marginTop: 8 },

  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, opacity: 0.7 },
});
