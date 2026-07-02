import React, { useMemo, useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/IconSymbol';
import { reorderTaskMediaUrls } from '@/utils/taskMediaOrder';

const ROW_HEIGHT = 64;

type TaskMediaListEditorProps = {
  urls: string[];
  onChange: (urls: string[]) => void;
  getLabel: (url: string) => string;
  onRemove: (index: number) => void;
  onPreview?: (index: number) => void;
  disabled?: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  secondaryTextColor: string;
  accentColor: string;
  dangerColor: string;
  testIDPrefix?: string;
};

type TaskMediaRowProps = TaskMediaListEditorProps & {
  url: string;
  index: number;
  itemCount: number;
  onMove: (fromIndex: number, toIndex: number) => void;
};

function TaskMediaRow(props: TaskMediaRowProps) {
  const {
    url,
    index,
    itemCount,
    getLabel,
    onMove,
    onRemove,
    onPreview,
    disabled,
    backgroundColor,
    borderColor,
    textColor,
    secondaryTextColor,
    accentColor,
    dangerColor,
    testIDPrefix,
  } = props;

  const translateY = useRef(new Animated.Value(0)).current;
  const canDrag = !disabled && itemCount > 1;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canDrag,
        onMoveShouldSetPanResponder: (_event, gesture) => canDrag && Math.abs(gesture.dy) > 4,
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_event, gesture) => {
          const offset = Math.round(gesture.dy / ROW_HEIGHT);
          const nextIndex = Math.max(0, Math.min(itemCount - 1, index + offset));
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 24,
            bounciness: 4,
          }).start();
          if (nextIndex !== index) {
            onMove(index, nextIndex);
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 24,
            bounciness: 4,
          }).start();
        },
      }),
    [canDrag, index, itemCount, onMove, translateY],
  );

  return (
    <Animated.View
      style={[
        styles.row,
        { backgroundColor, borderColor, transform: [{ translateY }] },
        canDrag && styles.rowDraggable,
      ]}
      testID={testIDPrefix ? `${testIDPrefix}.row.${index}` : undefined}
    >
      <View
        style={[styles.dragHandle, !canDrag && styles.disabledControl]}
        {...(canDrag ? panResponder.panHandlers : {})}
        testID={testIDPrefix ? `${testIDPrefix}.dragHandle.${index}` : undefined}
      >
        <IconSymbol ios_icon_name="line.3.horizontal" android_material_icon_name="drag_handle" size={22} color={secondaryTextColor} />
      </View>

      <TouchableOpacity
        style={styles.previewButton}
        onPress={() => onPreview?.(index)}
        disabled={!onPreview}
        activeOpacity={0.85}
        testID={testIDPrefix ? `${testIDPrefix}.preview.${index}` : undefined}
      >
        <IconSymbol
          ios_icon_name={onPreview ? 'play.circle.fill' : 'doc.fill'}
          android_material_icon_name={onPreview ? 'play_circle' : 'insert_drive_file'}
          size={24}
          color={accentColor}
        />
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: textColor }]}>Media {index + 1}</Text>
          <Text style={[styles.subtitle, { color: secondaryTextColor }]} numberOfLines={1}>
            {getLabel(url)}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.iconButton, disabled && styles.disabledControl]}
        onPress={() => onRemove(index)}
        disabled={disabled}
        activeOpacity={0.8}
        testID={testIDPrefix ? `${testIDPrefix}.remove.${index}` : undefined}
      >
        <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={18} color={dangerColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function TaskMediaListEditor(props: TaskMediaListEditorProps) {
  const { urls, onChange } = props;

  const normalizedUrls = useMemo(() => (Array.isArray(urls) ? urls : []), [urls]);
  const handleMove = useMemo(
    () => (fromIndex: number, toIndex: number) => {
      onChange(reorderTaskMediaUrls(normalizedUrls, fromIndex, toIndex));
    },
    [normalizedUrls, onChange],
  );

  if (!normalizedUrls.length) return null;

  return (
    <View style={styles.list}>
      {normalizedUrls.map((url, index) => (
        <TaskMediaRow
          key={`${url}-${index}`}
          {...props}
          url={url}
          index={index}
          itemCount={normalizedUrls.length}
          onMove={handleMove}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  row: {
    minHeight: ROW_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowDraggable: {
    zIndex: 2,
    elevation: 2,
  },
  dragHandle: {
    width: 34,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  iconButton: {
    width: 34,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledControl: {
    opacity: 0.45,
  },
});
