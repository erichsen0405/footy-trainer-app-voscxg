import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  Modal,
  ScrollView,
  FlatList,
} from 'react-native';
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as CommonStyles from '@/styles/commonStyles';
import { ActivityCategory } from '@/types';
import { ProgressionMetric, TrendPoint, useProgressionData } from '@/hooks/useProgressionData';

type Props = {
  categories: ActivityCategory[];
};

export function ProgressionSection({ categories }: Props) {
  const colorScheme = useColorScheme();
  const palette = useMemo(() => {
    const fromHelper = typeof CommonStyles.getColors === 'function' ? CommonStyles.getColors(colorScheme as any) : undefined;
    const base = (fromHelper || (CommonStyles as any).colors || {}) as Record<string, string>;
    return {
      primary: base.primary ?? '#4CAF50',
      secondary: base.secondary ?? '#2196F3',
      accent: base.accent ?? '#FF9800',
      background: base.background ?? '#FFFFFF',
      backgroundAlt: base.backgroundAlt ?? '#1C1C1E',
      card: base.card ?? '#F5F5F5',
      highlight: base.highlight ?? '#2C2C2E',
      text: base.text ?? '#333333',
      textSecondary: base.textSecondary ?? '#666666',
      success: base.success ?? '#4CAF50',
      warning: base.warning ?? '#FFC107',
      error: base.error ?? '#F44336',
    };
  }, [colorScheme]);

  const [periodDays, setPeriodDays] = useState(30);
  const [metric, setMetric] = useState<ProgressionMetric>('rating');
  const [selectedFocusId, setSelectedFocusId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedPoint, setSelectedPoint] = useState<TrendPoint | null>(null);
  const [showFocusPicker, setShowFocusPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const { trendPoints, heatmapRows, summary, isLoading, error, rawEntries, focusTemplates, intensityCategoriesWithData } = useProgressionData({
    days: periodDays,
    metric,
    focusTaskTemplateId: metric === 'rating' ? selectedFocusId : null,
    intensityCategoryId: metric === 'intensity' ? selectedCategoryId : null,
    categories,
  });

  const focusOptions = useMemo(() => [{ id: null, name: 'Alle fokusopgaver' }, ...focusTemplates], [focusTemplates]);

  const intensityOptions = useMemo(() => {
    const availableIds = new Set(intensityCategoriesWithData);
    const mapped = categories
      .filter(cat => availableIds.size === 0 || availableIds.has(String((cat as any).id)))
      .map(cat => ({ id: String((cat as any).id), name: cat.name, color: (cat as any).color as string | undefined }));
    return [{ id: null, name: 'Alle kategorier' }, ...mapped];
  }, [categories, intensityCategoriesWithData]);

  const periodOptions = useMemo(
    () => [
      { label: '7 dage', value: 7 },
      { label: '14 dage', value: 14 },
      { label: '30 dage', value: 30 },
      { label: '60 dage', value: 60 },
      { label: '90 dage', value: 90 },
    ],
    []
  );

  const metricOptions: { label: string; value: ProgressionMetric }[] = useMemo(
    () => [
      { label: 'Fokus-score', value: 'rating' },
      { label: 'Intensitet', value: 'intensity' },
    ],
    []
  );

  const chartHeight = 180;
  const chartPadding = 16;

  const handlePointPress = useCallback((point: TrendPoint) => {
    setSelectedPoint(point);
  }, []);

  const resolveValueColor = useCallback(
    (value: number) => {
      if (value >= 8) return palette.success;
      if (value >= 5) return palette.warning;
      return palette.error;
    },
    [palette.error, palette.success, palette.warning]
  );

  const heatColor = useCallback(
    (ratio: number, baseColor?: string) => {
      const clamped = Math.max(0, Math.min(1, ratio));
      const alpha = 0.12 + clamped * 0.78;
      const scaledForThreshold = clamped * 10;
      const thresholdColor = resolveValueColor(scaledForThreshold);
      const colorValue = /^#([0-9a-fA-F]{6})$/.test(baseColor || '') ? (baseColor as string) : thresholdColor;
      return `${colorValue}${Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')}`;
    },
    [resolveValueColor]
  );

  const selectedDetails = useMemo(() => {
    if (!selectedPoint) return null;
    const matched = rawEntries.find(entry => entry.id === selectedPoint.representative.id) || selectedPoint.representative;
    return matched;
  }, [rawEntries, selectedPoint]);

  const renderHeatmapRow = useCallback(
    ({ item }: { item: typeof heatmapRows[number] }) => (
      <View style={[styles.heatmapRow, { borderColor: palette.highlight }]}> 
        <View style={styles.heatmapLabel}>
          <View style={[styles.colorDot, { backgroundColor: item.color || palette.primary }]} />
          <View>
            <Text style={[styles.heatmapTitle, { color: palette.text }]}>{item.focusName}</Text>
            <Text style={[styles.heatmapSubtitle, { color: palette.textSecondary }]}>Fuldført {item.totalCompleted} / {item.totalPossible || item.totalCompleted || 1}</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.heatmapCells}>
            {item.weeks.map(week => (
              <View
                key={`${item.focusId ?? 'none'}-${week.weekStart}`}
                style={[styles.heatCell, { backgroundColor: heatColor(week.ratio, item.color) }]}
              >
                <Text style={[styles.heatCellValue, { color: palette.text }]}>
                  {week.completed}/{week.possible || week.completed || 1}
                </Text>
                <Text style={[styles.heatCellLabel, { color: palette.textSecondary }]}>{Math.round(week.ratio * 100)}% · {week.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    ),
    [heatColor, palette.highlight, palette.primary, palette.text, palette.textSecondary]
  );

  const renderBadge = useCallback(
    ({ item }: { item: string }) => (
      <View style={[styles.badge, { backgroundColor: palette.highlight }]}> 
        <Text style={[styles.badgeText, { color: palette.text }]}>{item}</Text>
      </View>
    ),
    [palette.highlight, palette.text]
  );

  return (
    <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.highlight }]}> 
      <Text style={[styles.title, { color: palette.text }]}>Progressions-visualisering</Text>
      <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
        Se hvordan dine fokusområder og intensitet udvikler sig over tid.
      </Text>

      <View style={styles.filterRow}>
        {periodOptions.map(option => {
          const active = periodDays === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => setPeriodDays(option.value)}
              style={[styles.chip, { borderColor: palette.highlight }, active && { backgroundColor: palette.primary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : palette.text }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.filterRow}>
        {metricOptions.map(option => {
          const active = metric === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => {
                setMetric(option.value);
                setSelectedPoint(null);
              }}
              style={[styles.chip, { borderColor: palette.highlight }, active && { backgroundColor: palette.secondary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : palette.text }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {metric === 'rating' ? (
        <View>
          <TouchableOpacity
            onPress={() => setShowFocusPicker(true)}
            style={[styles.dropdown, { borderColor: palette.highlight }]}
            accessibilityRole="button"
          >
            <Text style={[styles.dropdownLabel, { color: palette.textSecondary }]}>Fokusopgave</Text>
            <Text style={[styles.dropdownValue, { color: palette.text }]}>
              {focusOptions.find(opt => opt.id === selectedFocusId)?.name || 'Alle fokusopgaver'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <TouchableOpacity
            onPress={() => setShowCategoryPicker(true)}
            style={[styles.dropdown, { borderColor: palette.highlight }]}
            accessibilityRole="button"
          >
            <Text style={[styles.dropdownLabel, { color: palette.textSecondary }]}>Aktivitetskategori</Text>
            <Text style={[styles.dropdownValue, { color: palette.text }]}>
              {intensityOptions.find(opt => opt.id === selectedCategoryId)?.name || 'Alle kategorier'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.summaryCard, { backgroundColor: palette.highlight }]}> 
        <View style={styles.summaryLeft}>
          <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>
            {metric === 'rating' ? 'Fuldført fokusopgaver' : 'Registreret intensitet'}
          </Text>
          <Text style={[styles.summaryValue, { color: palette.text }]}>{summary.scorePercent}%</Text>
          <Text style={[styles.summaryDelta, { color: summary.deltaPercentPoints >= 0 ? palette.success : palette.error }]}>
            {summary.deltaPercentPoints >= 0 ? '↑' : '↓'} {Math.abs(summary.deltaPercentPoints)}% vs. forrige periode
          </Text>
          <Text style={[styles.summaryMeta, { color: palette.textSecondary }]}>Periode: {periodDays} dage</Text>
          <Text style={[styles.summaryMeta, { color: palette.textSecondary }]}>Sammenlignes med: forrige {periodDays} dage</Text>
          <Text style={[styles.summaryMeta, { color: palette.textSecondary }]}>Gns: {summary.avgCurrent.toFixed(1)} (forrige {summary.avgPrevious.toFixed(1)})</Text>
        </View>
        <View style={styles.summaryRight}>
          <Text style={[styles.summaryMeta, { color: palette.textSecondary }]}>Muligt</Text>
          <Text style={[styles.summaryMetaValue, { color: palette.text }]}>{summary.possibleCount}</Text>
          <Text style={[styles.summaryMeta, { color: palette.textSecondary }]}>Fuldført</Text>
          <Text style={[styles.summaryMetaValue, { color: palette.text }]}>{summary.completedCount}</Text>
          <Text style={[styles.summaryMeta, { color: palette.textSecondary }]}>Streak</Text>
          <Text style={[styles.summaryMetaValue, { color: palette.text }]}>{summary.streakDays} dage</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.textSecondary }]}>Henter progression...</Text>
        </View>
      ) : null}

      {error ? <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text> : null}

      {!trendPoints.length && !isLoading ? (
        <View style={[styles.emptyState, { backgroundColor: palette.highlight }]}> 
          <Text style={[styles.emptyTitle, { color: palette.text }]}>Ingen data endnu</Text>
          <Text style={[styles.emptyText, { color: palette.textSecondary }]}>Log træningsfeedback for at se din progression.</Text>
        </View>
      ) : null}

      {!!trendPoints.length && (
        <View
          style={[styles.chartCard, { backgroundColor: palette.backgroundAlt, borderColor: palette.highlight }]}
          onLayout={event => setChartWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: palette.text }]}>Trend ({metric === 'rating' ? 'Fokus' : 'Intensitet'})</Text>
            <Text style={[styles.chartSubtitle, { color: palette.textSecondary }]}>{trendPoints.length} datapunkter</Text>
          </View>

          {chartWidth > 0 && (
            <Svg height={chartHeight} width={chartWidth}>
              <Defs>
                <LinearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor={palette.primary} stopOpacity={0.9} />
                  <Stop offset="100%" stopColor={palette.secondary} stopOpacity={0.9} />
                </LinearGradient>
              </Defs>
              {trendPoints.length > 1 && (
                <Polyline
                  points={trendPoints
                    .map((point, idx) => {
                      const x = trendPoints.length === 1 ? chartWidth / 2 : (idx / (trendPoints.length - 1)) * (chartWidth - chartPadding * 2) + chartPadding;
                      const clamped = Math.max(0, Math.min(10, point.value));
                      const y = (1 - clamped / 10) * (chartHeight - chartPadding * 2) + chartPadding;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="url(#lineGradient)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {trendPoints.map((point, idx) => {
                const x = trendPoints.length === 1 ? chartWidth / 2 : (idx / (trendPoints.length - 1)) * (chartWidth - chartPadding * 2) + chartPadding;
                const clamped = Math.max(0, Math.min(10, point.value));
                const y = (1 - clamped / 10) * (chartHeight - chartPadding * 2) + chartPadding;
                const pointColor = resolveValueColor(point.value);

                return (
                  <Circle
                    key={point.id}
                    cx={x}
                    cy={y}
                    r={8}
                    fill={colorScheme === 'dark' ? palette.background : '#fff'}
                    stroke={pointColor}
                    strokeWidth={3}
                    onPress={() => handlePointPress(point)}
                  />
                );
              })}
            </Svg>
          )}

          <View style={styles.chartLegend}>
            <Text style={[styles.legendItem, { color: palette.text }]}>8-10 grøn</Text>
            <Text style={[styles.legendItem, { color: palette.text }]}>5-7 orange</Text>
            <Text style={[styles.legendItem, { color: palette.text }]}>1-4 rød</Text>
          </View>
        </View>
      )}

      {!!heatmapRows.length && (
        <View style={[styles.heatmapCard, { backgroundColor: palette.backgroundAlt, borderColor: palette.highlight }]}> 
          <Text style={[styles.chartTitle, { color: palette.text }]}>
            {metric === 'rating' ? 'Frekvens pr. fokus (uge)' : 'Frekvens pr. kategori (uge)'} · {periodDays} dage
          </Text>
          <FlatList
            data={[...heatmapRows].sort((a, b) => b.totalCompleted - a.totalCompleted)}
            keyExtractor={(item, index) => `${item.focusId ?? 'none'}-${index}`}
            renderItem={renderHeatmapRow}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            scrollEnabled={false}
          />
        </View>
      )}

      <View style={styles.badgesRow}>
        <FlatList
          data={summary.badges.length ? summary.badges : ['På vej']}
          keyExtractor={item => item}
          renderItem={renderBadge}
          horizontal
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
        />
      </View>

      <Modal visible={!!selectedPoint} transparent animationType="fade" onRequestClose={() => setSelectedPoint(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.card }]}> 
            <Text style={[styles.modalTitle, { color: palette.text }]}>Detaljer</Text>
            {selectedDetails ? (
              <>
                <Text style={[styles.modalText, { color: palette.textSecondary }]}>Dato: {selectedPoint?.dateLabel}</Text>
                {metric === 'rating' ? (
                  <>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>Fokusopgave: {selectedDetails.focusName}</Text>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>Score: {selectedDetails.rating ?? '—'}</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>Kategori: {selectedDetails.focusName}</Text>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>Aktivitet: {selectedDetails.activityTitle || 'Aktivitet'}</Text>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>Intensitet: {selectedDetails.intensity ?? '—'}</Text>
                  </>
                )}
                <Text style={[styles.modalText, { color: palette.textSecondary }]}>Note: {selectedDetails.note || 'Ingen note'}</Text>
              </>
            ) : null}
            <TouchableOpacity
              onPress={() => setSelectedPoint(null)}
              style={[styles.closeButton, { backgroundColor: palette.primary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.closeButtonText, { color: '#fff' }]}>Luk</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showFocusPicker} transparent animationType="fade" onRequestClose={() => setShowFocusPicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.card }]}> 
            <Text style={[styles.modalTitle, { color: palette.text }]}>Vælg fokusopgave</Text>
            <FlatList
              data={focusOptions}
              keyExtractor={item => item.id ?? 'alle'}
              renderItem={({ item }) => {
                const active = item.id === selectedFocusId;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedFocusId(item.id ?? null);
                      setShowFocusPicker(false);
                    }}
                    style={[styles.optionRow, active && { backgroundColor: palette.highlight }]}
                  >
                    <Text style={[styles.optionText, { color: palette.text }]}>{item.name}</Text>
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
            <TouchableOpacity
              onPress={() => setShowFocusPicker(false)}
              style={[styles.closeButton, { backgroundColor: palette.primary, marginTop: 12 }]}
            >
              <Text style={[styles.closeButtonText, { color: '#fff' }]}>Luk</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCategoryPicker} transparent animationType="fade" onRequestClose={() => setShowCategoryPicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.card }]}> 
            <Text style={[styles.modalTitle, { color: palette.text }]}>Vælg kategori</Text>
            <FlatList
              data={intensityOptions}
              keyExtractor={item => item.id ?? 'alle'}
              renderItem={({ item }) => {
                const active = item.id === selectedCategoryId;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedCategoryId(item.id ?? null);
                      setShowCategoryPicker(false);
                    }}
                    style={[styles.optionRow, active && { backgroundColor: palette.highlight }]}
                  >
                    <Text style={[styles.optionText, { color: palette.text }]}>{item.name}</Text>
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
            <TouchableOpacity
              onPress={() => setShowCategoryPicker(false)}
              style={[styles.closeButton, { backgroundColor: palette.primary, marginTop: 12 }]}
            >
              <Text style={[styles.closeButtonText, { color: '#fff' }]}>Luk</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dropdown: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
  },
  dropdownLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  dropdownValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  focusRow: {
    gap: 8,
    paddingVertical: 6,
  },
  focusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  focusChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 13,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  summaryDelta: {
    fontSize: 13,
    marginTop: 4,
  },
  summaryMeta: {
    fontSize: 12,
  },
  summaryMetaValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLeft: {
    gap: 4,
  },
  summaryRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  loadingText: {
    fontSize: 14,
  },
  errorText: {
    marginTop: 6,
  },
  emptyState: {
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
  },
  chartCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  chartSubtitle: {
    fontSize: 12,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  legendItem: {
    fontSize: 12,
  },
  heatmapCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  heatmapRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  heatmapLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  heatmapTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  heatmapSubtitle: {
    fontSize: 12,
  },
  heatmapCells: {
    flexDirection: 'row',
    gap: 8,
  },
  heatCell: {
    minWidth: 64,
    padding: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  heatCellValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  heatCellLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  badgesRow: {
    marginTop: 14,
  },
  badge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    marginBottom: 4,
  },
  closeButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  optionRow: {
    borderRadius: 12,
    padding: 12,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
