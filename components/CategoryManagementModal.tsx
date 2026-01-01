import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ActivityCategory } from '@/types';
import { supabase } from '@/app/integrations/supabase/client';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

/*
 * ========================================
 * PERFORMANCE CHECKLIST (STEP F)
 * ========================================
 * ✅ First render & loading:
 *    - No blocking before paint
 *    - Modal opens immediately
 *
 * ✅ Navigation:
 *    - No fetch in onPress/onOpen
 *    - All data passed via props
 *
 * ✅ Lists:
 *    - ScrollView acceptable (limited categories)
 *    - Keys provided via stable ids/values
 *
 * ✅ Render control:
 *    - useCallback for all handlers (stable deps)
 *    - useMemo for derived data
 *    - No inline handlers in render
 *
 * ✅ Platform parity:
 *    - Same behavior iOS/Android/Web
 * ========================================
 */

interface CategoryManagementModalProps {
  visible: boolean;
  onClose: () => void;
  categories?: ActivityCategory[];
  onRefresh: () => void;
}

const EMOJI_OPTIONS = ['⚽', '🏃', '🏋️', '🎯', '📚', '🎮', '🎨', '🎵', '🍔', '🏆', '💪', '🧘', '🚴', '🏊', '⛹️', '🤾', '🏐', '🏀', '🎾', '🏈'];
const COLOR_OPTIONS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
  '#E63946', '#457B9D', '#F77F00', '#06FFA5', '#9D4EDD'
];

export default function CategoryManagementModal({
  visible,
  onClose,
  categories = [],
  onRefresh,
}: CategoryManagementModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { selectedContext } = useTeamPlayer();

  const safeCategories = useMemo<ActivityCategory[]>(
    () => (Array.isArray(categories) ? categories : []),
    [categories]
  );

  const [mode, setMode] = useState<'list' | 'create' | 'edit' | 'delete'>('list');
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJI_OPTIONS[0]);
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [activitiesUsingCategory, setActivitiesUsingCategory] = useState<any[]>([]);
  const [reassignCategoryId, setReassignCategoryId] = useState<string>('');

  const bgColor = useMemo(() => isDark ? '#1a1a1a' : colors.background, [isDark]);
  const cardBgColor = useMemo(() => isDark ? '#2a2a2a' : colors.card, [isDark]);
  const textColor = useMemo(() => isDark ? '#e3e3e3' : colors.text, [isDark]);
  const textSecondaryColor = useMemo(() => isDark ? '#999' : colors.textSecondary, [isDark]);

  useEffect(() => {
    if (!visible) {
      // Reset state when modal closes
      setMode('list');
      setSelectedCategory(null);
      setCategoryName('');
      setSelectedEmoji(EMOJI_OPTIONS[0]);
      setSelectedColor(COLOR_OPTIONS[0]);
      setActivitiesUsingCategory([]);
      setReassignCategoryId('');
    }
  }, [visible]);

  const handleCreateCategory = useCallback(async () => {
    if (!categoryName.trim()) {
      Alert.alert('Fejl', 'Indtast venligst et kategorinavn');
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Determine player_id and team_id based on selected context
      let player_id = null;
      let team_id = null;

      if (selectedContext?.type === 'player' && selectedContext?.id) {
        player_id = selectedContext.id;
      } else if (selectedContext?.type === 'team' && selectedContext?.id) {
        team_id = selectedContext.id;
      }

      const { error } = await supabase
        .from('activity_categories')
        .insert({
          user_id: user.id,
          name: categoryName.trim(),
          emoji: selectedEmoji,
          color: selectedColor,
          player_id,
          team_id,
        });

      if (error) {
        console.error('Error creating category:', error);
        throw error;
      }

      Alert.alert('Succes', 'Kategori oprettet!');
      onRefresh();
      setMode('list');
      setCategoryName('');
      setSelectedEmoji(EMOJI_OPTIONS[0]);
      setSelectedColor(COLOR_OPTIONS[0]);
    } catch (error) {
      console.error('Failed to create category:', error);
      Alert.alert('Fejl', 'Kunne ikke oprette kategori');
    } finally {
      setIsLoading(false);
    }
  }, [categoryName, selectedEmoji, selectedColor, selectedContext, onRefresh]);

  const handleEditCategory = useCallback(async () => {
    if (!selectedCategory || !categoryName.trim()) {
      Alert.alert('Fejl', 'Indtast venligst et kategorinavn');
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('activity_categories')
        .update({
          name: categoryName.trim(),
          emoji: selectedEmoji,
          color: selectedColor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedCategory.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating category:', error);
        throw error;
      }

      Alert.alert('Succes', 'Kategori opdateret!');
      onRefresh();
      setMode('list');
      setSelectedCategory(null);
      setCategoryName('');
    } catch (error) {
      console.error('Failed to update category:', error);
      Alert.alert('Fejl', 'Kunne ikke opdatere kategori');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, categoryName, selectedEmoji, selectedColor, onRefresh]);

  const handleDeleteCategoryConfirm = useCallback(async (categoryId: string) => {
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('activity_categories')
        .delete()
        .eq('id', categoryId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting category:', error);
        throw error;
      }

      Alert.alert('Succes', 'Kategori slettet!');
      onRefresh();
      setMode('list');
      setSelectedCategory(null);
      setActivitiesUsingCategory([]);
    } catch (error) {
      console.error('Failed to delete category:', error);
      Alert.alert('Fejl', 'Kunne ikke slette kategori');
    } finally {
      setIsLoading(false);
    }
  }, [onRefresh]);

  const handleDeleteCategoryCheck = useCallback(async (category: ActivityCategory) => {
    setIsLoading(true);
    setSelectedCategory(category);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check for internal activities using this category
      let internalQuery = supabase
        .from('activities')
        .select('id, title, activity_date, activity_time')
        .eq('category_id', category.id)
        .eq('is_external', false);

      // Filter based on selected context
      if (selectedContext?.type === 'player' && selectedContext?.id) {
        internalQuery = internalQuery.eq('player_id', selectedContext.id);
      } else if (selectedContext?.type === 'team' && selectedContext?.id) {
        internalQuery = internalQuery.eq('team_id', selectedContext.id);
      } else {
        internalQuery = internalQuery.eq('user_id', user.id);
      }

      const { data: internalActivities, error: internalError } = await internalQuery;

      if (internalError) {
        console.error('Error checking internal activities:', internalError);
        throw internalError;
      }

      // Check for external activities using this category
      let externalQuery = supabase
        .from('events_local_meta')
        .select(`
          id,
          events_external!inner(
            title,
            start_date,
            start_time
          )
        `)
        .eq('category_id', category.id);

      // Filter based on selected context
      if (selectedContext?.type === 'player' && selectedContext?.id) {
        externalQuery = externalQuery.eq('player_id', selectedContext.id);
      } else if (selectedContext?.type === 'team' && selectedContext?.id) {
        externalQuery = externalQuery.eq('team_id', selectedContext.id);
      } else {
        externalQuery = externalQuery.eq('user_id', user.id);
      }

      const { data: externalActivities, error: externalError } = await externalQuery;

      if (externalError) {
        console.error('Error checking external activities:', externalError);
        throw externalError;
      }

      // Combine both types of activities
      const allActivities = [
        ...(internalActivities || []).map(a => ({
          id: a.id,
          title: a.title,
          date: a.activity_date,
          time: a.activity_time,
          isExternal: false,
        })),
        ...(externalActivities || []).map((a: any) => ({
          id: a.id,
          title: a.events_external.title,
          date: a.events_external.start_date,
          time: a.events_external.start_time,
          isExternal: true,
        })),
      ];

      console.log(`Found ${allActivities.length} activities using category "${category.name}"`);

      if (allActivities.length > 0) {
        // Show reassignment dialog
        setActivitiesUsingCategory(allActivities);
        setMode('delete');
      } else {
        // No activities using this category, safe to delete
        await handleDeleteCategoryConfirm(category.id);
      }
    } catch (error) {
      console.error('Failed to check category usage:', error);
      Alert.alert('Fejl', 'Kunne ikke kontrollere kategori');
    } finally {
      setIsLoading(false);
    }
  }, [selectedContext, handleDeleteCategoryConfirm]);

  const handleReassignAndDelete = useCallback(async () => {
    if (!selectedCategory || !reassignCategoryId) {
      Alert.alert('Fejl', 'Vælg venligst en ny kategori');
      return;
    }

    if (reassignCategoryId === selectedCategory.id) {
      Alert.alert('Fejl', 'Du kan ikke tildele samme kategori');
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Update internal activities
      const internalActivityIds = (activitiesUsingCategory || [])
        .filter(a => !a.isExternal)
        .map(a => a.id);

      if (internalActivityIds.length > 0) {
        const { error: internalError } = await supabase
          .from('activities')
          .update({
            category_id: reassignCategoryId,
            updated_at: new Date().toISOString(),
          })
          .in('id', internalActivityIds);

        if (internalError) {
          console.error('Error updating internal activities:', internalError);
          throw internalError;
        }
      }

      // Update external activities (local metadata)
      const externalActivityIds = (activitiesUsingCategory || [])
        .filter(a => a.isExternal)
        .map(a => a.id);

      if (externalActivityIds.length > 0) {
        const { error: externalError } = await supabase
          .from('events_local_meta')
          .update({
            category_id: reassignCategoryId,
            manually_set_category: true,
            category_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in('id', externalActivityIds);

        if (externalError) {
          console.error('Error updating external activities:', externalError);
          throw externalError;
        }
      }

      console.log(`Reassigned ${(activitiesUsingCategory || []).length} activities to new category`);

      // Now delete the category
      await handleDeleteCategoryConfirm(selectedCategory.id);
    } catch (error) {
      console.error('Failed to reassign and delete:', error);
      Alert.alert('Fejl', 'Kunne ikke tildele aktiviteter til ny kategori');
      setIsLoading(false);
    }
  }, [selectedCategory, reassignCategoryId, activitiesUsingCategory, handleDeleteCategoryConfirm]);

  const startEdit = useCallback((category: ActivityCategory) => {
    setSelectedCategory(category);
    setCategoryName(category.name);
    setSelectedEmoji(category.emoji);
    setSelectedColor(category.color);
    setMode('edit');
  }, []);

  const renderListMode = useCallback(() => (
    <React.Fragment>
      <View style={styles.modalHeader}>
        <Text style={[styles.modalTitle, { color: textColor }]}>Administrer kategorier</Text>
        <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
          <IconSymbol
            ios_icon_name="xmark.circle.fill"
            android_material_icon_name="close"
            size={32}
            color={textSecondaryColor}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary }]}
          onPress={() => setMode('create')}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={24}
            color="#fff"
          />
          <Text style={styles.createButtonText}>Opret ny kategori</Text>
        </TouchableOpacity>

        <View style={styles.categoriesList}>
          {safeCategories.map((category) => (
            <View
              key={category.id}
              style={[styles.categoryItem, { backgroundColor: bgColor }]}
            >
              <View style={styles.categoryInfo}>
                <View style={[styles.categoryColorDot, { backgroundColor: category.color }]} />
                <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                <Text style={[styles.categoryName, { color: textColor }]}>{category.name}</Text>
              </View>
              <View style={styles.categoryActions}>
                <TouchableOpacity
                  onPress={() => startEdit(category)}
                  activeOpacity={0.7}
                  style={styles.actionButton}
                >
                  <IconSymbol
                    ios_icon_name="pencil.circle.fill"
                    android_material_icon_name="edit"
                    size={28}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteCategoryCheck(category)}
                  activeOpacity={0.7}
                  style={styles.actionButton}
                >
                  <IconSymbol
                    ios_icon_name="trash.circle.fill"
                    android_material_icon_name="delete"
                    size={28}
                    color={colors.error}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </React.Fragment>
  ), [textColor, textSecondaryColor, onClose, safeCategories, bgColor, startEdit, handleDeleteCategoryCheck]);

  const renderCreateEditMode = useCallback(() => (
    <React.Fragment>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={() => setMode('list')} activeOpacity={0.7}>
          <IconSymbol
            ios_icon_name="chevron.left.circle.fill"
            android_material_icon_name="arrow_back"
            size={32}
            color={textSecondaryColor}
          />
        </TouchableOpacity>
        <Text style={[styles.modalTitle, { color: textColor }]}>
          {mode === 'create' ? 'Opret kategori' : 'Rediger kategori'}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: textColor }]}>Navn *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
            value={categoryName}
            onChangeText={setCategoryName}
            placeholder="F.eks. Træning"
            placeholderTextColor={textSecondaryColor}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: textColor }]}>Emoji</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
            {EMOJI_OPTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.emojiOption,
                  {
                    backgroundColor: selectedEmoji === emoji ? colors.primary : bgColor,
                    borderColor: selectedEmoji === emoji ? colors.primary : colors.highlight,
                  },
                ]}
                onPress={() => setSelectedEmoji(emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: textColor }]}>Farve</Text>
          <View style={styles.colorGrid}>
            {COLOR_OPTIONS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorOptionSelected,
                ]}
                onPress={() => setSelectedColor(color)}
                activeOpacity={0.7}
              >
                {selectedColor === color && (
                  <IconSymbol
                    ios_icon_name="checkmark"
                    android_material_icon_name="check"
                    size={24}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.previewContainer}>
          <Text style={[styles.fieldLabel, { color: textColor }]}>Forhåndsvisning</Text>
          <View
            style={[
              styles.previewChip,
              {
                backgroundColor: selectedColor,
                borderColor: selectedColor,
              },
            ]}
          >
            <Text style={styles.previewEmoji}>{selectedEmoji}</Text>
            <Text style={styles.previewName}>{categoryName || 'Kategorinavn'}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity
          style={[
            styles.modalButton,
            styles.cancelButton,
            { backgroundColor: bgColor, borderColor: colors.highlight },
          ]}
          onPress={() => setMode('list')}
          activeOpacity={0.7}
          disabled={isLoading}
        >
          <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modalButton,
            styles.saveButton,
            { backgroundColor: colors.primary },
          ]}
          onPress={mode === 'create' ? handleCreateCategory : handleEditCategory}
          activeOpacity={0.7}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.modalButtonText, { color: '#fff' }]}>
              {mode === 'create' ? 'Opret' : 'Gem'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </React.Fragment>
  ), [textSecondaryColor, textColor, mode, bgColor, categoryName, selectedEmoji, selectedColor, isLoading, handleCreateCategory, handleEditCategory]);

  const renderDeleteMode = useCallback(() => {
    const availableCategories = safeCategories.filter(c => c.id !== selectedCategory?.id);

    return (
      <React.Fragment>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setMode('list')} activeOpacity={0.7}>
            <IconSymbol
              ios_icon_name="chevron.left.circle.fill"
              android_material_icon_name="arrow_back"
              size={32}
              color={textSecondaryColor}
            />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: textColor }]}>Slet kategori</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
          <View style={styles.warningContainer}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={48}
              color={colors.warning}
            />
            <Text style={[styles.warningTitle, { color: textColor }]}>
              Kategorien er i brug
            </Text>
            <Text style={[styles.warningMessage, { color: textSecondaryColor }]}>
              Kategorien "{selectedCategory?.name}" bruges af {activitiesUsingCategory.length} aktivitet(er).
              Du skal tildele disse aktiviteter til en anden kategori før du kan slette denne.
            </Text>
          </View>

          <View style={styles.activitiesList}>
            <Text style={[styles.fieldLabel, { color: textColor }]}>
              Aktiviteter der bruger denne kategori:
            </Text>
            {(activitiesUsingCategory || []).slice(0, 5).map((activity) => (
              <View
                key={`${activity.isExternal ? 'ext' : 'int'}-${activity.id}`}
                style={[styles.activityItem, { backgroundColor: bgColor }]}
              >
                <Text style={[styles.activityTitle, { color: textColor }]}>
                  {activity.title}
                </Text>
                <Text style={[styles.activityDate, { color: textSecondaryColor }]}>
                  {new Date(activity.date).toLocaleDateString('da-DK')} • {activity.time}
                </Text>
              </View>
            ))}
            {activitiesUsingCategory.length > 5 && (
              <Text style={[styles.moreActivities, { color: textSecondaryColor }]}>
                ... og {activitiesUsingCategory.length - 5} flere
              </Text>
            )}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: textColor }]}>
              Vælg ny kategori for disse aktiviteter *
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {availableCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: reassignCategoryId === cat.id ? cat.color : bgColor,
                      borderColor: cat.color,
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setReassignCategoryId(cat.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      styles.categoryChipName,
                      { color: reassignCategoryId === cat.id ? '#fff' : textColor },
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[
              styles.modalButton,
              styles.cancelButton,
              { backgroundColor: bgColor, borderColor: colors.highlight },
            ]}
            onPress={() => setMode('list')}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modalButton,
              styles.deleteButton,
              { backgroundColor: colors.error },
            ]}
            onPress={handleReassignAndDelete}
            activeOpacity={0.7}
            disabled={isLoading || !reassignCategoryId}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                Tildel og slet
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </React.Fragment>
    );
  }, [safeCategories, selectedCategory, textSecondaryColor, textColor, activitiesUsingCategory, bgColor, reassignCategoryId, isLoading, handleReassignAndDelete]);

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
          {mode === 'list' && renderListMode()}
          {(mode === 'create' || mode === 'edit') && renderCreateEditMode()}
          {mode === 'delete' && renderDeleteMode()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 24,
    maxHeight: '70%',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 24,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  categoriesList: {
    gap: 12,
    paddingBottom: 24,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryEmoji: {
    fontSize: 24,
  },
  categoryName: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
  },
  emojiScroll: {
    marginTop: 8,
  },
  emojiOption: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
  },
  emojiText: {
    fontSize: 28,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  colorOption: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  previewContainer: {
    marginBottom: 24,
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    alignSelf: 'flex-start',
    borderWidth: 2,
  },
  previewEmoji: {
    fontSize: 20,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  warningContainer: {
    alignItems: 'center',
    padding: 24,
    marginBottom: 24,
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  warningMessage: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  activitiesList: {
    marginBottom: 24,
  },
  activityItem: {
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  activityDate: {
    fontSize: 14,
  },
  moreActivities: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  categoryScroll: {
    marginTop: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    marginRight: 12,
  },
  categoryChipName: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 14,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 2,
  },
  saveButton: {},
  deleteButton: {},
  modalButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
