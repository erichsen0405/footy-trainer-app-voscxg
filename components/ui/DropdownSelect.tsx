import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import * as CommonStyles from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

interface Option {
  label: string;
  value: any;
}

interface Props {
  options: Option[];
  selectedValue: any;
  onSelect: (value: any) => void;
  label?: string;
  flex?: number;
}

export function DropdownSelect({ options, selectedValue, onSelect, label, flex = 1 }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const colorScheme = useColorScheme();
  const palette = useMemo(() => CommonStyles.getColors(colorScheme), [colorScheme]);

  const selectedLabel = useMemo(
    () => options.find(opt => opt.value === selectedValue)?.label || options[0]?.label || 'Vælg',
    [options, selectedValue]
  );

  const handleSelect = (value: any) => {
    onSelect(value);
    setModalVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.dropdownButton, { backgroundColor: palette.card, flex }]}
        onPress={() => setModalVisible(true)}
      >
        {label && <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>}
        <View style={styles.valueContainer}>
          <Text style={[styles.selectedValue, { color: palette.text }]}>{selectedLabel}</Text>
          <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="arrow_drop_down" size={20} color={palette.textSecondary} />
        </View>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalBackdrop} onTouchEnd={() => setModalVisible(false)}>
          <View style={[styles.modalContent, { backgroundColor: palette.backgroundAlt }]} onTouchEnd={e => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>{label || 'Vælg en mulighed'}</Text>
            <FlatList
              data={options}
              keyExtractor={item => String(item.value)}
              renderItem={({ item }) => {
                const isSelected = item.value === selectedValue;
                return (
                  <TouchableOpacity
                    style={[styles.optionRow, isSelected && { backgroundColor: palette.primary }]}
                    onPress={() => handleSelect(item.value)}
                  >
                    <Text style={[styles.optionText, { color: isSelected ? '#fff' : palette.text }]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: palette.highlight }]} />}
            />
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: palette.card }]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={[styles.closeButtonText, { color: palette.text }]}>Annuller</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dropdownButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  valueContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  optionRow: {
    padding: 16,
    borderRadius: 12,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  separator: {
    height: 1,
  },
  closeButton: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
