
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

// Store console logs in memory
const MAX_LOGS = 500;
const consoleLogs: Array<{ timestamp: string; type: string; message: string }> = [];

// Override console methods to capture logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args: any[]) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  consoleLogs.push({
    timestamp: new Date().toISOString(),
    type: 'log',
    message,
  });
  
  if (consoleLogs.length > MAX_LOGS) {
    consoleLogs.shift();
  }
  
  originalLog(...args);
};

console.error = (...args: any[]) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  consoleLogs.push({
    timestamp: new Date().toISOString(),
    type: 'error',
    message,
  });
  
  if (consoleLogs.length > MAX_LOGS) {
    consoleLogs.shift();
  }
  
  originalError(...args);
};

console.warn = (...args: any[]) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  consoleLogs.push({
    timestamp: new Date().toISOString(),
    type: 'warn',
    message,
  });
  
  if (consoleLogs.length > MAX_LOGS) {
    consoleLogs.shift();
  }
  
  originalWarn(...args);
};

export default function ConsoleLogsScreen() {
  const router = useRouter();
  const [logs, setLogs] = useState(consoleLogs);
  const [filter, setFilter] = useState<'all' | 'notification' | 'error'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollViewRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    // Update logs every second
    const interval = setInterval(() => {
      setLogs([...consoleLogs]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (autoScroll && scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [logs, autoScroll]);

  const getFilteredLogs = () => {
    if (filter === 'all') {
      return logs;
    } else if (filter === 'notification') {
      return logs.filter(log => 
        log.message.includes('🔔') ||
        log.message.includes('📅') ||
        log.message.includes('📤') ||
        log.message.includes('💾') ||
        log.message.toLowerCase().includes('notification') ||
        log.message.toLowerCase().includes('notifikation')
      );
    } else if (filter === 'error') {
      return logs.filter(log => log.type === 'error' || log.message.includes('❌'));
    }
    return logs;
  };

  const handleShare = async () => {
    const filteredLogs = getFilteredLogs();
    const logsText = filteredLogs.map(log => 
      `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`
    ).join('\n\n');

    try {
      await Share.share({
        message: logsText,
        title: 'Console Logs',
      });
    } catch (error) {
      console.error('Error sharing logs:', error);
    }
  };

  const handleClear = () => {
    consoleLogs.length = 0;
    setLogs([]);
  };

  const filteredLogs = getFilteredLogs();

  const getLogColor = (type: string, message: string) => {
    if (type === 'error' || message.includes('❌')) {
      return colors.error;
    } else if (type === 'warn' || message.includes('⚠️')) {
      return '#ff9800';
    } else if (message.includes('✅')) {
      return colors.success;
    } else if (message.includes('🔔') || message.includes('📅') || message.includes('📤')) {
      return colors.primary;
    }
    return colors.text;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Console Logs (DEV)</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterButtonText, filter === 'all' && styles.filterButtonTextActive]}>
            Alle ({logs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'notification' && styles.filterButtonActive]}
          onPress={() => setFilter('notification')}
        >
          <Text style={[styles.filterButtonText, filter === 'notification' && styles.filterButtonTextActive]}>
            Notifikationer
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'error' && styles.filterButtonActive]}
          onPress={() => setFilter('error')}
        >
          <Text style={[styles.filterButtonText, filter === 'error' && styles.filterButtonTextActive]}>
            Fejl
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.secondary }]}
          onPress={handleShare}
        >
          <IconSymbol
            ios_icon_name="square.and.arrow.up"
            android_material_icon_name="share"
            size={18}
            color="#fff"
          />
          <Text style={styles.actionButtonText}>Del</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.error }]}
          onPress={handleClear}
        >
          <IconSymbol
            ios_icon_name="trash"
            android_material_icon_name="delete"
            size={18}
            color="#fff"
          />
          <Text style={styles.actionButtonText}>Ryd</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: autoScroll ? colors.success : colors.border }]}
          onPress={() => setAutoScroll(!autoScroll)}
        >
          <IconSymbol
            ios_icon_name={autoScroll ? "arrow.down.circle.fill" : "arrow.down.circle"}
            android_material_icon_name={autoScroll ? "arrow_downward" : "arrow_downward"}
            size={18}
            color="#fff"
          />
          <Text style={styles.actionButtonText}>Auto</Text>
        </TouchableOpacity>
      </View>

      {/* Logs */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.logsContainer}
        contentContainerStyle={styles.logsContent}
      >
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Ingen logs at vise</Text>
          </View>
        ) : (
          filteredLogs.map((log, index) => (
            <View key={index} style={styles.logItem}>
              <Text style={styles.logTimestamp}>
                {new Date(log.timestamp).toLocaleTimeString('da-DK')}
              </Text>
              <Text style={[styles.logMessage, { color: getLogColor(log.type, log.message) }]}>
                {log.message}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 60 : 60,
    paddingBottom: 20,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  actionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  logsContainer: {
    flex: 1,
  },
  logsContent: {
    padding: 12,
  },
  logItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  logTimestamp: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  logMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
