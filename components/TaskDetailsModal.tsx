import React, { memo, useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import { IconSymbol } from '@/components/IconSymbol';
import * as CommonStyles from '@/styles/commonStyles';

const FALLBACK_COLORS = {
  primary: '#3B82F6',
};

const colors = ((CommonStyles as any)?.colors as typeof FALLBACK_COLORS | undefined) ?? FALLBACK_COLORS;

export interface TaskDetailsModalProps {
  visible: boolean;
  title: string;
  categoryColor: string;
  isDark: boolean;
  description?: string;
  reminderMinutes?: number | null;
  videoUrl?: string | null;
  completed?: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onComplete: () => void;
}

function clampColorHex(input?: string | null): string {
  const v = String(input ?? '').trim();
  return v.startsWith('#') && (v.length === 7 || v.length === 4) ? v : colors.primary;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function mix(hex: string, target: { r: number; g: number; b: number }, t: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r + (target.r - rgb.r) * t);
  const g = Math.round(rgb.g + (target.g - rgb.g) * t);
  const b = Math.round(rgb.b + (target.b - rgb.b) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lighten(hex: string, t: number): string {
  return mix(hex, { r: 255, g: 255, b: 255 }, t);
}

function TaskDetailsModalComponent({
  visible,
  title,
  categoryColor,
  isDark,
  description,
  reminderMinutes,
  videoUrl,
  completed = false,
  isSaving = false,
  onClose,
  onComplete,
}: TaskDetailsModalProps) {
  const base = useMemo(() => clampColorHex(categoryColor), [categoryColor]);

  const disable = isSaving;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
        <View
          style={[
            styles.backdropContainer,
            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(7, 16, 35, 0.45)' },
          ]}
        >
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} disabled={isSaving} />

          <View style={styles.cardWrapper}>
            <View style={styles.card}>
              <View style={styles.header}>
                <Text style={[styles.title, { color: base }]} numberOfLines={2} ellipsizeMode="tail">
                  {title}
                </Text>

                <Pressable onPress={onClose} hitSlop={12} disabled={isSaving} style={styles.closeButton}>
                  <Text style={styles.closeText}>X</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                showsVerticalScrollIndicator={false}
              >
                {videoUrl ? (
                  <View style={styles.videoSection}>
                    <View style={styles.videoContainer}>
                      <SmartVideoPlayer url={videoUrl} />
                    </View>
                  </View>
                ) : null}

                {description ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Beskrivelse</Text>
                    <Text style={styles.sectionText}>{description}</Text>
                  </View>
                ) : null}

                {reminderMinutes !== null && reminderMinutes !== undefined ? (
                  <View style={styles.section}>
                    <View style={styles.chip}>
                      <IconSymbol
                        ios_icon_name="bell.fill"
                        android_material_icon_name="notifications"
                        size={16}
                        color={base}
                      />
                      <Text style={styles.chipText}>{reminderMinutes} min før</Text>
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  onPress={onComplete}
                  disabled={disable}
                  style={[styles.primaryButtonShadow, { shadowColor: base }, disable && styles.primaryButtonDisabled]}
                >
                  <LinearGradient
                    colors={[base, lighten(base, 0.25)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryButton}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {completed ? 'Markér som ikke udført' : 'Markér som udført'}
                      </Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdropContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWrapper: { width: '100%', paddingHorizontal: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 32,
    padding: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    marginRight: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 241, 245, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3B4256',
  },

  body: { maxHeight: 420 },
  bodyContent: { paddingTop: 6, paddingBottom: 4 },

  section: { marginTop: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.2,
    color: 'rgba(32, 40, 62, 0.6)',
  },
  sectionText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: '#20283E',
  },

  videoSection: { marginTop: 6 },
  videoContainer: { borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(11, 15, 25, 0.08)',
    backgroundColor: 'rgba(240, 242, 247, 0.8)',
  },
  chipText: { fontSize: 14, fontWeight: '700', marginLeft: 8, color: '#3B4256' },

  footer: { marginTop: 18 },
  primaryButtonShadow: {
    borderRadius: 999,
    shadowRadius: 18,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

const TaskDetailsModal = memo(TaskDetailsModalComponent);
export default TaskDetailsModal;
export { TaskDetailsModal };
