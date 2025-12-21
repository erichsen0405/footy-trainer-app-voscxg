
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

import CreateActivityModal from '@/components/CreateActivityModal';
import { useHomeActivities } from '@/hooks/useHomeActivities';

export default function HomeScreen() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    activities,
    categories,
    loading,
    refetchActivities,
    refetchCategories,
  } = useHomeActivities();

  useEffect(() => {
    refetchActivities();
    refetchCategories();
  }, [refetchActivities, refetchCategories]);

  return (
    <View style={styles.container}>
      {/* 🔹 HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>Aktiviteter</Text>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>Opret aktivitet</Text>
        </TouchableOpacity>
      </View>

      {/* 🔹 CONTENT */}
      <View style={styles.content}>
        {loading && <ActivityIndicator />}

        {!loading && activities.length === 0 && (
          <Text style={styles.emptyText}>
            Ingen aktiviteter endnu.
          </Text>
        )}

        {!loading &&
          activities.map(activity => (
            <View key={activity.id} style={styles.activityCard}>
              <Text style={styles.activityTitle}>
                {activity.title}
              </Text>
              <Text style={styles.activityMeta}>
                {activity.date} – {activity.time}
              </Text>
            </View>
          ))}
      </View>

      {/* 🔹 MODAL (OVERLAY) */}
      {showCreateModal && (
        <CreateActivityModal
          visible
          onClose={() => setShowCreateModal(false)}
          onCreateActivity={async () => {
            await refetchActivities();
            setShowCreateModal(false);
          }}
          categories={categories}
          onRefreshCategories={refetchCategories}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  createButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  emptyText: {
    marginTop: 40,
    fontSize: 16,
    color: '#666',
  },
  activityCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    marginBottom: 12,
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  activityMeta: {
    marginTop: 4,
    fontSize: 14,
    color: '#555',
  },
});
