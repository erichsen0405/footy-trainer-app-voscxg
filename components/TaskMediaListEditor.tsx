import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/IconSymbol';
import { normalizeTaskMediaNames, reorderTaskMedia } from '@/utils/taskVideos';

const ROW_HEIGHT = 72;
const ROW_GAP = 8;
const ROW_SLOT_HEIGHT = ROW_HEIGHT + ROW_GAP;

type TaskMediaListEditorProps = {
  urls: string[];
  names?: string[];
  onChange: (urls: string[], names: string[]) => void;
  getLabel: (url: string) => string;
  onRemove: (index: number) => void;
  onPreview?: (index: number) => void;
  onRename?: (index: number, name: string) => void;
  disabled?: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  secondaryTextColor: string;
  accentColor: string;
  dangerColor: string;
  testIDPrefix?: string;
  onDragStateChange?: (isDragging: boolean) => void;
};

type TaskMediaRowProps = TaskMediaListEditorProps & {
  url: string;
  name: string;
  index: number;
  itemCount: number;
  activeIndex: number | null;
  hoverIndex: number | null;
  onMove: (fromIndex: number, toIndex: number) => void;
  onHover: (fromIndex: number, toIndex: number) => void;
  onDragEnd: () => void;
};

function getShiftForRow(rowIndex: number, activeIndex: number | null, hoverIndex: number | null): number {
  if (activeIndex === null || hoverIndex === null || activeIndex === hoverIndex || rowIndex === activeIndex) {
    return 0;
  }

  if (activeIndex < hoverIndex && rowIndex > activeIndex && rowIndex <= hoverIndex) {
    return -ROW_SLOT_HEIGHT;
  }

  if (activeIndex > hoverIndex && rowIndex >= hoverIndex && rowIndex < activeIndex) {
    return ROW_SLOT_HEIGHT;
  }

  return 0;
}

function TaskMediaRow(props: TaskMediaRowProps) {
  const {
    url,
    name,
    index,
    itemCount,
    activeIndex,
    hoverIndex,
    getLabel,
    onMove,
    onHover,
    onDragEnd,
    onRemove,
    onPreview,
    onRename,
    disabled,
    backgroundColor,
    borderColor,
    textColor,
    secondaryTextColor,
    accentColor,
    dangerColor,
    testIDPrefix,
    onDragStateChange,
  } = props;

  const translateY = useRef(new Animated.Value(0)).current;
  const isDraggingRef = useRef(false);
  const canDrag = !disabled && itemCount > 1;
  const rowShift = getShiftForRow(index, activeIndex, hoverIndex);
  const canRename = !!onRename && !disabled;
  const label = getLabel(url);
  const setDragging = useCallback(
    (isDragging: boolean) => {
      if (isDraggingRef.current === isDragging) return;
      isDraggingRef.current = isDragging;
      onDragStateChange?.(isDragging);
    },
    [onDragStateChange],
  );
  const resetPosition = useCallback(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      speed: 24,
      bounciness: 4,
    }).start();
  }, [translateY]);
  const getTargetIndex = useCallback(
    (dy: number) => {
      const offset = Math.round(dy / ROW_SLOT_HEIGHT);
      return Math.max(0, Math.min(itemCount - 1, index + offset));
    },
    [index, itemCount],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canDrag,
        onStartShouldSetPanResponderCapture: () => canDrag,
        onMoveShouldSetPanResponder: (_event, gesture) => canDrag && Math.abs(gesture.dy) > 4,
        onMoveShouldSetPanResponderCapture: (_event, gesture) => canDrag && Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          setDragging(true);
          translateY.setValue(0);
        },
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(gesture.dy);
          onHover(index, getTargetIndex(gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          const nextIndex = getTargetIndex(gesture.dy);
          setDragging(false);
          onDragEnd();
          resetPosition();
          if (nextIndex !== index) {
            onMove(index, nextIndex);
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          setDragging(false);
          onDragEnd();
          resetPosition();
        },
        onShouldBlockNativeResponder: () => canDrag,
      }),
    [canDrag, getTargetIndex, index, onDragEnd, onHover, onMove, resetPosition, setDragging, translateY],
  );

  return (
    <Animated.View
      style={[
        styles.row,
        {
          backgroundColor,
          borderColor,
          transform: [{ translateY: rowShift }, { translateY }],
        },
        canDrag && styles.rowDraggable,
        activeIndex === index && styles.rowActive,
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
      </TouchableOpacity>

      <View style={styles.textWrap}>
        {canRename ? (
          <TextInput
            style={[styles.titleInput, { color: textColor, borderColor }]}
            value={name}
            onChangeText={(nextName) => onRename?.(index, nextName)}
            placeholder="Media name"
            placeholderTextColor={secondaryTextColor}
            selectTextOnFocus={false}
            testID={testIDPrefix ? `${testIDPrefix}.nameInput.${index}` : undefined}
          />
        ) : (
          <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
            {name}
          </Text>
        )}
        <Text style={[styles.subtitle, { color: secondaryTextColor }]} numberOfLines={1}>
          {label}
        </Text>
      </View>

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
  const { urls, names, onChange, onDragStateChange } = props;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const normalizedUrls = useMemo(() => (Array.isArray(urls) ? urls : []), [urls]);
  const normalizedNames = useMemo(
    () => normalizeTaskMediaNames(names, normalizedUrls),
    [names, normalizedUrls],
  );
  const handleDragStateChange = useCallback(
    (isDragging: boolean) => {
      if (!isDragging) {
        setActiveIndex(null);
        setHoverIndex(null);
      }
      onDragStateChange?.(isDragging);
    },
    [onDragStateChange],
  );
  const handleHover = useCallback((fromIndex: number, toIndex: number) => {
    setActiveIndex(fromIndex);
    setHoverIndex(toIndex);
  }, []);
  const handleDragEnd = useCallback(() => {
    setActiveIndex(null);
    setHoverIndex(null);
  }, []);
  const handleMove = useMemo(
    () => (fromIndex: number, toIndex: number) => {
      const nextMedia = reorderTaskMedia(normalizedUrls, normalizedNames, fromIndex, toIndex);
      onChange(nextMedia.urls, nextMedia.names);
    },
    [normalizedNames, normalizedUrls, onChange],
  );

  if (!normalizedUrls.length) return null;

  return (
    <View style={styles.list}>
      {normalizedUrls.map((url, index) => (
        <TaskMediaRow
          key={`${url}-${index}`}
          {...props}
          url={url}
          name={normalizedNames[index] ?? ''}
          index={index}
          itemCount={normalizedUrls.length}
          activeIndex={activeIndex}
          hoverIndex={hoverIndex}
          onMove={handleMove}
          onHover={handleHover}
          onDragEnd={handleDragEnd}
          onDragStateChange={handleDragStateChange}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: ROW_GAP,
    marginTop: 10,
    marginBottom: 12,
  },
  row: {
    height: ROW_HEIGHT,
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
  rowActive: {
    zIndex: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  dragHandle: {
    width: 34,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButton: {
    width: 34,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
  },
  titleInput: {
    height: 30,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
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
