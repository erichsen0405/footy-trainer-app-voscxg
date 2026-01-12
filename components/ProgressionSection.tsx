import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, Modal } from 'react-native';
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import * as CommonStyles from '@/styles/commonStyles';
import { ActivityCategory } from '@/types';
import { ProgressionMetric, TrendPoint, useProgressionData, TrendSeries } from '@/hooks/useProgressionData';
import { DropdownSelect } from './ui/DropdownSelect';
import { format, subDays, startOfDay } from 'date-fns';

type Props = {
  categories: ActivityCategory[];
};

export function ProgressionSection({ categories }: Props) {
  const colorScheme = useColorScheme();
  const palette = useMemo(() => CommonStyles.getColors(colorScheme), [colorScheme]);

  const [periodDays, setPeriodDays] = useState(30);
  const [metric, setMetric] = useState<ProgressionMetric>('rating');
  const [selectedFocusId, setSelectedFocusId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedPoint, setSelectedPoint] = useState<TrendPoint | null>(null);

  const { trendPoints, summary, isLoading, error, rawEntries, focusTemplates, intensityCategoriesWithData, possibleCount } =
    useProgressionData({
      days: periodDays,
      metric,
      focusTaskTemplateId: metric === 'rating' ? selectedFocusId : null,
      intensityCategoryId: metric === 'intensity' ? selectedCategoryId : null,
      categories,
    });

  const focusOptions = useMemo(
    () => [{ value: null, label: 'Alle fokusopgaver' }, ...focusTemplates.map(t => ({ value: t.id, label: t.name }))],
    [focusTemplates]
  );

  const intensityOptions = useMemo(() => {
    const availableIds = new Set(intensityCategoriesWithData);
    const mapped = categories
      .filter(cat => availableIds.size === 0 || availableIds.has(String((cat as any).id)))
      .map(cat => ({ value: String((cat as any).id), label: cat.name }));
    return [{ value: null, label: 'Alle kategorier' }, ...mapped];
  }, [categories, intensityCategoriesWithData]);

  const periodOptions = useMemo(
    () => [
      { label: '7 dage', value: 7 },
      { label: '30 dage', value: 30 },
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

  const chartHeight = 220;
  const yAxisWidth = 30;
  const xAxisHeight = 40;
  const chartPadding = { top: 16, right: 24, bottom: xAxisHeight, left: yAxisWidth };

  const handlePointPress = useCallback((point: TrendPoint) => {
    setSelectedPoint(point);
  }, []);

  const resolveValueColor = useCallback(
    (value: number) => {
      if (value >= 8) return palette.success;
      if (value >= 5) return palette.warning;
      return palette.error;
    },
    [palette]
  );

  const colorPalette = useMemo(
    () => ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'],
    []
  );

  const seriesColors = useMemo(() => {
    const colorMap = new Map<string, string>();
    if (metric === 'intensity') {
      categories.forEach(cat => {
        if (cat.color) {
          colorMap.set(String((cat as any).id), cat.color);
        }
      });
    }
    return colorMap;
  }, [metric, categories]);

  const trendSeries = useMemo((): TrendSeries[] => {
    const isMultiSeries = (metric === 'rating' && selectedFocusId === null) || (metric === 'intensity' && selectedCategoryId === null);
    if (!isMultiSeries) {
      return trendPoints.length > 0
        ? [{ id: 'single', name: 'Trend', points: trendPoints, color: 'url(#lineGradient)' }]
        : [];
    }

    const seriesMap = new Map<string, TrendSeries>();
    rawEntries.forEach((entry, index) => {
      const seriesId = entry.focusCategoryId;
      if (!seriesId) return;

      if (!seriesMap.has(seriesId)) {
        const seriesColor =
          entry.focusColor || seriesColors.get(seriesId) || colorPalette[seriesMap.size % colorPalette.length];
        seriesMap.set(seriesId, {
          id: seriesId,
          name: entry.focusName,
          points: [],
          color: seriesColor,
        });
      }

      const series = seriesMap.get(seriesId)!;
      series.points.push({
        id: entry.id,
        dateKey: entry.dateKey,
        dateLabel: format(new Date(entry.dateKey), 'dd MMM'),
        value: metric === 'rating' ? entry.rating ?? 0 : entry.intensity ?? 0,
        representative: entry,
        sampleCount: 1,
        seriesId: series.id,
        seriesName: series.name,
      });
    });

    return Array.from(seriesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawEntries, trendPoints, metric, selectedFocusId, selectedCategoryId, seriesColors, colorPalette]);

  const allPointsSorted = useMemo(() => {
    const all = trendSeries.flatMap(s => s.points);
    return [...all].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [trendSeries]);

  const xAxisPoints = useMemo(() => {
    const uniquePoints = new Map<string, TrendPoint>();
    allPointsSorted.forEach(p => {
      if (!uniquePoints.has(p.dateKey)) {
        uniquePoints.set(p.dateKey, p);
      }
    });
    return Array.from(uniquePoints.values());
  }, [allPointsSorted]);

  const selectedDetails = useMemo(() => {
    if (!selectedPoint) return null;
    const matched = rawEntries.find(entry => entry.id === selectedPoint.representative.id) || selectedPoint.representative;
    return matched;
  }, [rawEntries, selectedPoint]);

  const summaryPrimaryLabel = metric === 'rating' ? 'Progressionsscore' : 'Intensitet';
  const summaryValueColor = resolveValueColor(summary.avgCurrent);

  const previousPeriodText = useMemo(() => {
    const today = startOfDay(new Date());
    const periodStart = startOfDay(subDays(today, periodDays - 1));
    const previousStart = subDays(periodStart, periodDays);
    const previousEnd = subDays(periodStart, 1);
    return `Sammenlignet med forrige ${periodDays} dage (${format(previousStart, 'dd/MM')}–${format(previousEnd, 'dd/MM')})`;
  }, [periodDays]);

  const avgChangeRounded = Math.round(summary.avgChangePercent);
  const previousWasZero = summary.avgPrevious === 0;
  let summaryDeltaText = '0% vs. forrige periode';
  let summaryDeltaColor = palette.textSecondary;

  if (previousWasZero) {
    if (summary.avgCurrent > 0) {
      summaryDeltaText = '↑ 100%+ vs. forrige periode';
      summaryDeltaColor = palette.success;
    }
  } else {
    const arrow = avgChangeRounded > 0 ? '↑' : avgChangeRounded < 0 ? '↓' : '';
    summaryDeltaText = `${arrow ? `${arrow} ` : ''}${Math.abs(avgChangeRounded)}% vs. forrige periode`;
    summaryDeltaColor =
      avgChangeRounded > 0 ? palette.success : avgChangeRounded < 0 ? palette.error : palette.textSecondary;
  }

  const yAxisLabels = [0, 2, 4, 6, 8, 10];
  const isMultiSeries = trendSeries.length > 1;

  return (
    <>
      <View style={styles.filterContainer}>
        <DropdownSelect options={periodOptions} selectedValue={periodDays} onSelect={setPeriodDays} label="Periode" />
        <DropdownSelect options={metricOptions} selectedValue={metric} onSelect={setMetric} label="Score" />
      </View>

      {metric === 'rating' ? (
        <DropdownSelect options={focusOptions} selectedValue={selectedFocusId} onSelect={setSelectedFocusId} label="Fokusopgave" />
      ) : (
        <DropdownSelect
          options={intensityOptions}
          selectedValue={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          label="Kategori"
        />
      )}

      <View style={[styles.summaryCard, { backgroundColor: palette.backgroundAlt, shadowColor: palette.shadow }]}>
        <View style={styles.summaryLeft}>
          <View style={styles.summaryTitleRow}>
            <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>{summaryPrimaryLabel}</Text>
          </View>
          <Text style={[styles.summaryValue, { color: summaryValueColor }]}>{summary.avgCurrent.toFixed(1)}</Text>
          <Text style={[styles.summaryDelta, { color: summaryDeltaColor }]}>{summaryDeltaText}</Text>
          <Text style={[styles.summaryComparison, { color: palette.textSecondary }]}>{previousPeriodText}</Text>
        </View>
        <View style={styles.summaryRight}>
          <View style={styles.summaryMetaItem}>
            <Text style={[styles.summaryMetaValue, { color: palette.text }]}>{summary.completedCount}</Text>
            <Text style={[styles.summaryMetaLabel, { color: palette.textSecondary }]}>Registreringer</Text>
          </View>
          <View style={styles.summaryMetaItem}>
            <Text style={[styles.summaryMetaValue, { color: palette.text }]}>{possibleCount}</Text>
            <Text style={[styles.summaryMetaLabel, { color: palette.textSecondary }]}>Mulige</Text>
          </View>
          <View style={styles.summaryMetaItem}>
            <Text style={[styles.summaryMetaValue, { color: palette.text }]}>{summary.streakDays}</Text>
            <Text style={[styles.summaryMetaLabel, { color: palette.textSecondary }]}>Streak</Text>
          </View>
        </View>
      </View>

      <View style={[styles.explanationCard, { backgroundColor: palette.backgroundAlt }]}>
        <Text style={[styles.explanationText, { color: palette.textSecondary }]}>
          Progressionsscore viser udviklingen i din valgte score over perioden. Den beregnes ud fra dine registrerede
          træninger og vises som gennemsnit for perioden.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.textSecondary }]}>Henter progression...</Text>
        </View>
      ) : null}

      {error ? <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text> : null}

      {!allPointsSorted.length && !isLoading ? (
        <View style={[styles.emptyState, { backgroundColor: palette.backgroundAlt }]}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>Ingen data endnu</Text>
          <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
            Log træningsfeedback for at se din progression.
          </Text>
        </View>
      ) : null}

      {!!allPointsSorted.length && (
        <View
          style={[styles.chartCard, { backgroundColor: palette.card, shadowColor: palette.shadow }]}
          onLayout={event => setChartWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: palette.text }]}>
              Score ({metric === 'rating' ? 'Fokus' : 'Intensitet'})
            </Text>
            <Text style={[styles.chartSubtitle, { color: palette.textSecondary }]}>{allPointsSorted.length} træninger</Text>
          </View>

          {chartWidth > 0 && (
            <View>
              <Svg height={chartHeight} width={chartWidth}>
                <Defs>
                  <LinearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%" stopColor={palette.primary} stopOpacity={0.9} />
                    <Stop offset="100%" stopColor={palette.secondary} stopOpacity={0.9} />
                  </LinearGradient>
                </Defs>

                {/* Y-axis */}
                {yAxisLabels.map(label => {
                  const y = (1 - label / 10) * (chartHeight - chartPadding.top - chartPadding.bottom) + chartPadding.top;
                  return (
                    <SvgText
                      key={`y-label-${label}`}
                      x={yAxisWidth - 8}
                      y={y + 4}
                      fill={palette.textSecondary}
                      fontSize="12"
                      textAnchor="end"
                    >
                      {label}
                    </SvgText>
                  );
                })}

                {/* X-axis */}
                {xAxisPoints.map((point, idx) => {
                  const x =
                    xAxisPoints.length === 1
                      ? chartWidth / 2
                      : (idx / (xAxisPoints.length - 1)) * (chartWidth - chartPadding.left - chartPadding.right) +
                        chartPadding.left;
                  const anchor = idx === 0 ? 'start' : idx === xAxisPoints.length - 1 ? 'end' : 'middle';
                  return (
                    <SvgText
                      key={`x-label-${point.id}`}
                      x={x}
                      y={chartHeight - xAxisHeight / 2 + 8}
                      fill={palette.textSecondary}
                      fontSize="12"
                      textAnchor={anchor}
                    >
                      {point.dateLabel}
                    </SvgText>
                  );
                })}

                {/* Chart Lines and Points */}
                {trendSeries.map(series => {
                  const pointCoords = series.points
                    .map(point => {
                      const pointIdx = xAxisPoints.findIndex(p => p.dateKey === point.dateKey);
                      if (pointIdx === -1) return null;
                      const x =
                        xAxisPoints.length === 1
                          ? chartWidth / 2
                          : (pointIdx / (xAxisPoints.length - 1)) *
                              (chartWidth - chartPadding.left - chartPadding.right) +
                            chartPadding.left;
                      const clamped = Math.max(0, Math.min(10, point.value));
                      const y =
                        (1 - clamped / 10) * (chartHeight - chartPadding.top - chartPadding.bottom) + chartPadding.top;
                      return { x, y, point };
                    })
                    .filter(Boolean) as { x: number; y: number; point: TrendPoint }[];

                  return (
                    <React.Fragment key={series.id}>
                      {pointCoords.length > 1 && (
                        <Polyline
                          points={pointCoords.map(p => `${p.x},${p.y}`).join(' ')}
                          fill="none"
                          stroke={series.color}
                          strokeWidth={2.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      {pointCoords.map(({ x, y, point }) => (
                        <Circle
                          key={point.id}
                          cx={x}
                          cy={y}
                          r={6}
                          fill={palette.card}
                          stroke={isMultiSeries ? series.color : resolveValueColor(point.value)}
                          strokeWidth={3}
                          onPress={() => handlePointPress(point)}
                        />
                      ))}
                    </React.Fragment>
                  );
                })}
              </Svg>
              <Text style={[styles.chartHint, { color: palette.textSecondary }]}>Tryk på et punkt for detaljer</Text>
            </View>
          )}
          {isMultiSeries && (
            <View style={styles.legendContainer}>
              {trendSeries.map(series => (
                <View key={series.id} style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: series.color }]} />
                  <Text style={[styles.legendLabel, { color: palette.textSecondary }]}>{series.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <Modal visible={!!selectedPoint} transparent animationType="fade" onRequestClose={() => setSelectedPoint(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.card }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>Detaljer</Text>
            {selectedDetails ? (
              <>
                <Text style={[styles.modalText, { color: palette.textSecondary }]}>Dato: {selectedPoint?.dateLabel}</Text>
                {metric === 'rating' ? (
                  <>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>
                      Fokusopgave: {selectedDetails.focusName}
                    </Text>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>
                      Score: {selectedDetails.rating ?? '—'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>
                      Kategori: {selectedDetails.focusName}
                    </Text>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>
                      Aktivitet: {selectedDetails.activityTitle || 'Aktivitet'}
                    </Text>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>
                      Intensitet: {selectedDetails.intensity ?? '—'}
                    </Text>
                  </>
                )}
                <Text style={[styles.modalText, { color: palette.textSecondary }]}>
                  Note: {selectedDetails.note || 'Ingen note'}
                </Text>
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
    </>
  );
}

const styles = StyleSheet.create({
  filterContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    marginTop: 12,
    elevation: 1,
  },
  summaryLeft: {
    gap: 4,
    flex: 1,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 48,
    fontWeight: '800',
  },
  summaryDelta: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryComparison: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  summaryRight: {
    alignItems: 'flex-end',
    gap: 12,
  },
  summaryMetaItem: {
    alignItems: 'flex-end',
  },
  summaryMetaValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  summaryMetaLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  explanationCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 18,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
  },
  errorText: {
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: 16,
    padding: 24,
    marginTop: 12,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  chartCard: {
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    elevation: 1,
    marginBottom: 24,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  chartSubtitle: {
    fontSize: 13,
  },
  chartHint: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
    paddingHorizontal: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 15,
    marginBottom: 6,
    lineHeight: 22,
  },
  closeButton: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
