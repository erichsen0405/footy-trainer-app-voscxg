import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, Modal, Alert, ScrollView } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import * as CommonStyles from '@/styles/commonStyles';
import { ActivityCategory } from '@/types';
import { ProgressionMetric, TrendPoint, useProgressionData, TrendSeries } from '@/hooks/useProgressionData';
import { DropdownSelect } from './ui/DropdownSelect';
import { format } from 'date-fns';
import { IconSymbol } from '@/components/IconSymbol';
import { useFocusEffect } from '@react-navigation/native';

type Props = {
  categories: ActivityCategory[];
};

type TierHistoryEntry = {
  rating: number;
  createdAt: string;
  activityTitle?: string | null;
  note?: string | null;
};

type TierTaskItem = {
  templateId: string;
  name: string;
  lastScores: number[];
  history: TierHistoryEntry[];
  description?: string | null;
  scoreExplanation?: string | null;
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
  const [selectedTask, setSelectedTask] = useState<TierTaskItem | null>(null);
  const [expandedTiers, setExpandedTiers] = useState({
    elite: false,
    oevet: false,
    begynder: false,
  });

  const { trendPoints, isLoading, error, rawEntries, allFocusEntries, focusTemplates, intensityCategoriesWithData, requiresLogin, refetch } =
    useProgressionData({
      days: periodDays,
      metric,
      focusTaskTemplateId: metric === 'rating' ? selectedFocusId : null,
      intensityCategoryId: metric === 'intensity' ? selectedCategoryId : null,
      categories,
    });
  const hasFocusedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      refetch();
    }, [refetch]),
  );

  const focusOptions = useMemo(
    () => [{ value: null, label: 'Alle feedback opgaver' }, ...focusTemplates.map(t => ({ value: t.id, label: t.name }))],
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
      { label: 'Feedback-score', value: 'rating' },
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
        ? [{ id: 'single', name: 'Trend', points: trendPoints, color: palette.primary }]
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
  }, [rawEntries, trendPoints, metric, selectedFocusId, selectedCategoryId, seriesColors, colorPalette, palette.primary]);

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

  const pointsByDate = useMemo(() => {
    const map = new Map<string, TrendPoint[]>();
    allPointsSorted.forEach(point => {
      const list = map.get(point.dateKey);
      if (list) {
        list.push(point);
      } else {
        map.set(point.dateKey, [point]);
      }
    });
    map.forEach(list => {
      list.sort((a, b) => (a.seriesName ?? '').localeCompare(b.seriesName ?? '') || a.id.localeCompare(b.id));
    });
    return map;
  }, [allPointsSorted]);

  const seriesColorLookup = useMemo(() => {
    const map = new Map<string, string>();
    trendSeries.forEach(series => {
      map.set(series.id, series.color);
    });
    return map;
  }, [trendSeries]);

  const chartInnerWidth = Math.max(0, chartWidth - chartPadding.left - chartPadding.right);
  const chartInnerHeight = Math.max(0, chartHeight - chartPadding.top - chartPadding.bottom);
  const barGroupWidth = xAxisPoints.length ? chartInnerWidth / xAxisPoints.length : chartInnerWidth;

  const xAxisLabelMeta = useMemo(() => {
    if (!xAxisPoints.length) return [];
    const safeBarWidth = Math.max(barGroupWidth, 1);
    const minLabelSpacing = 48;
    const spacingInterval = Math.max(1, Math.ceil(minLabelSpacing / safeBarWidth));
    const count = xAxisPoints.length;
    const countInterval = count <= 12 ? 1 : count <= 24 ? 2 : count <= 45 ? 3 : 7;
    const step = Math.max(spacingInterval, countInterval);

    return xAxisPoints.map((point, idx) => {
      const date = new Date(point.dateKey);
      const isFirst = idx === 0;
      const isLast = idx === count - 1;
      const isMonthStart = date.getDate() === 1;
      const show = isFirst || isLast || isMonthStart || idx % step === 0;
      const label = isFirst || isLast
        ? format(date, 'dd MMM')
        : isMonthStart
          ? format(date, 'MMM')
          : format(date, 'dd');
      return {
        ...point,
        label,
        show,
        isFirst,
        isLast,
      };
    });
  }, [xAxisPoints, barGroupWidth]);

  const selectedDetails = useMemo(() => {
    if (!selectedPoint) return null;
    const matched =
      rawEntries.find(entry => entry.id === selectedPoint.representative.id) || selectedPoint.representative;
    return matched;
  }, [rawEntries, selectedPoint]);

  const yAxisLabels = [0, 2, 4, 6, 8, 10];
  const isMultiSeries = trendSeries.length > 1;

  const focusTierBuckets = useMemo(() => {
    if (metric !== 'rating') return null;

    const buckets = {
      elite: [] as TierTaskItem[],
      oevet: [] as TierTaskItem[],
      begynder: [] as TierTaskItem[],
    };

    const isEliteStreak = (scores: number[]) => scores.length >= 5 && scores.every(score => score >= 9);

    const byTemplate = new Map<
      string,
      {
        name: string;
        description?: string | null;
        scoreExplanation?: string | null;
        entries: TierHistoryEntry[];
      }
    >();

    allFocusEntries.forEach(entry => {
      if (entry.kind !== 'rating') return;
      if (typeof entry.rating !== 'number') return;
      const templateId = entry.focusCategoryId ?? entry.taskTemplateId;
      if (!templateId) return;
      const name = entry.focusName || entry.taskTemplateName || 'Feedback opgaver';
      const createdAt = entry.createdAt || entry.dateKey;
      const record = byTemplate.get(templateId) ?? {
        name,
        description: entry.taskTemplateDescription ?? null,
        scoreExplanation: entry.taskTemplateScoreExplanation ?? null,
        entries: [],
      };
      if (!record.description && entry.taskTemplateDescription) {
        record.description = entry.taskTemplateDescription;
      }
      if (!record.scoreExplanation && entry.taskTemplateScoreExplanation) {
        record.scoreExplanation = entry.taskTemplateScoreExplanation;
      }
      record.entries.push({
        rating: entry.rating,
        createdAt,
        activityTitle: entry.activityTitle ?? null,
        note: entry.note ?? null,
      });
      if (!byTemplate.has(templateId)) {
        byTemplate.set(templateId, record);
      }
    });

    const assigned = new Set<string>();

    byTemplate.forEach((value, templateId) => {
      const sorted = [...value.entries].sort((a, b) => {
        const aMs = new Date(a.createdAt).getTime();
        const bMs = new Date(b.createdAt).getTime();
        return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
      });
      if (!sorted.length) return;
      const lastFive = sorted.slice(0, 5);
      const lastFiveScores = lastFive.map(entry => entry.rating);
      const latestScore = lastFiveScores[0];
      const taskItem: TierTaskItem = {
        templateId,
        name: value.name || 'Feedback opgaver',
        lastScores: lastFiveScores,
        history: sorted,
        description: value.description ?? null,
        scoreExplanation: value.scoreExplanation ?? null,
      };

      if (isEliteStreak(lastFiveScores)) {
        buckets.elite.push(taskItem);
        assigned.add(templateId);
        return;
      }

      if (typeof latestScore === 'number' && latestScore >= 6) {
        buckets.oevet.push(taskItem);
        assigned.add(templateId);
        return;
      }

      if (!assigned.has(templateId) && typeof latestScore === 'number') {
        buckets.begynder.push(taskItem);
      }
    });

    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    buckets.elite.sort(byName);
    buckets.oevet.sort(byName);
    buckets.begynder.sort(byName);

    return buckets;
  }, [metric, allFocusEntries]);

  const handleTierInfo = useCallback(
    (tier: 'elite' | 'oevet' | 'begynder') => {
      const messages: Record<typeof tier, string> = {
        elite: 'Elite kræver, at dine sidste 5 scores er 9–10/10 (min. fem gange i træk).',
        oevet:
          'Øvet viser opgaver hvor din seneste score er 6–8/10, eller 9–10/10 endnu ikke fem gange i træk.',
        begynder:
          'Begynder viser opgaver hvor din seneste score er mellem 1-5/10.',
      };
      Alert.alert('Krav for niveau', messages[tier]);
    },
    [],
  );

  const formatHistoryDate = useCallback((value: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value.slice(0, 10);
    }
    return format(date, 'dd MMM yyyy');
  }, []);

  if (requiresLogin) {
    return (
      <View style={[styles.emptyState, { backgroundColor: palette.backgroundAlt }]}>
        <Text style={[styles.emptyTitle, { color: palette.text }]}>Log ind for at se progression</Text>
        <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
          Log ind for at gemme og se din progression.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.filterContainer}>
        <DropdownSelect options={periodOptions} selectedValue={periodDays} onSelect={setPeriodDays} label="Periode" />
        <DropdownSelect options={metricOptions} selectedValue={metric} onSelect={setMetric} label="Score" />
      </View>

      {metric === 'rating' ? (
        <DropdownSelect options={focusOptions} selectedValue={selectedFocusId} onSelect={setSelectedFocusId} label="Feedback opgaver" />
      ) : (
        <DropdownSelect
          options={intensityOptions}
          selectedValue={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          label="Kategori"
        />
      )}

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
              Score ({metric === 'rating' ? 'Feedback' : 'Intensitet'})
            </Text>
            <Text style={[styles.chartSubtitle, { color: palette.textSecondary }]}>{allPointsSorted.length} træninger</Text>
          </View>

          {chartWidth > 0 && (
            <View>
              <Svg height={chartHeight} width={chartWidth}>

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
                {xAxisLabelMeta.map((point, idx) => {
                  if (!point.show) return null;
                  const x = chartPadding.left + barGroupWidth * idx + barGroupWidth / 2;
                  const anchor = point.isFirst ? 'start' : point.isLast ? 'end' : 'middle';
                  return (
                    <SvgText
                      key={`x-label-${point.dateKey}`}
                      x={x}
                      y={chartHeight - xAxisHeight / 2 + 8}
                      fill={palette.textSecondary}
                      fontSize="12"
                      textAnchor={anchor}
                    >
                      {point.label}
                    </SvgText>
                  );
                })}

                {/* Bars */}
                {xAxisPoints.map((point, idx) => {
                  const pointsForDate = pointsByDate.get(point.dateKey) ?? [];
                  if (!pointsForDate.length) return null;

                  const groupCenter = chartPadding.left + barGroupWidth * idx + barGroupWidth / 2;
                  const groupPadding = Math.min(10, barGroupWidth * 0.2);
                  const availableWidth = Math.max(2, barGroupWidth - groupPadding * 2);
                  const count = pointsForDate.length;
                  let barGap = Math.min(4, barGroupWidth * 0.12);
                  let barWidth = (availableWidth - barGap * (count - 1)) / count;
                  if (barWidth < 2) {
                    barGap = 1;
                    barWidth = Math.max(1.5, (availableWidth - barGap * (count - 1)) / count);
                  }
                  barWidth = Math.min(20, barWidth);
                  const totalBarsWidth = barWidth * count + barGap * Math.max(0, count - 1);
                  const startX = groupCenter - totalBarsWidth / 2;

                  return pointsForDate.map((barPoint, barIndex) => {
                    const clamped = Math.max(0, Math.min(10, barPoint.value));
                    const barHeight = (clamped / 10) * chartInnerHeight;
                    const x = startX + barIndex * (barWidth + barGap);
                    const y = chartPadding.top + (chartInnerHeight - barHeight);
                    const fillColor = isMultiSeries
                      ? seriesColorLookup.get(barPoint.seriesId ?? '') ?? palette.primary
                      : resolveValueColor(barPoint.value);

                    return (
                      <Rect
                        key={`bar-${barPoint.id}`}
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx={4}
                        fill={fillColor}
                        onPress={() => handlePointPress(barPoint)}
                      />
                    );
                  });
                })}
              </Svg>
              <Text style={[styles.chartHint, { color: palette.textSecondary }]}>Tryk på en søjle for detaljer</Text>
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

      {metric === 'rating' && focusTierBuckets && allPointsSorted.length > 0 && (
        <View style={styles.tierSection}>
          {[
            { key: 'elite', label: 'Elite', color: palette.gold },
            { key: 'oevet', label: 'Øvet', color: palette.silver },
            { key: 'begynder', label: 'Begynder', color: palette.bronze },
          ].map(tier => {
            const items = focusTierBuckets[tier.key as keyof typeof focusTierBuckets];
            return (
              <View key={tier.key} style={[styles.tierCard, { backgroundColor: tier.color }]}>
                <View style={styles.tierHeader}>
                  <TouchableOpacity
                    style={styles.tierHeaderLeft}
                    onPress={() =>
                      setExpandedTiers(prev => ({
                        ...prev,
                        [tier.key]: !prev[tier.key as keyof typeof prev],
                      }))
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${expandedTiers[tier.key as keyof typeof expandedTiers] ? 'Skjul' : 'Vis'} ${tier.label}`}
                  >
                    <Text style={styles.tierTitle}>{tier.label}</Text>
                  </TouchableOpacity>
                  <View style={styles.tierHeaderRight}>
                    <Text style={styles.tierCount}>{items.length}</Text>
                    <TouchableOpacity
                      onPress={() =>
                        setExpandedTiers(prev => ({
                          ...prev,
                          [tier.key]: !prev[tier.key as keyof typeof prev],
                        }))
                      }
                      style={styles.tierToggleButton}
                      accessibilityRole="button"
                      accessibilityLabel={`${expandedTiers[tier.key as keyof typeof expandedTiers] ? 'Skjul' : 'Vis'} ${tier.label}`}
                    >
                      <IconSymbol
                        ios_icon_name={
                          expandedTiers[tier.key as keyof typeof expandedTiers] ? 'chevron.up' : 'chevron.down'
                        }
                        android_material_icon_name={
                          expandedTiers[tier.key as keyof typeof expandedTiers] ? 'expand_less' : 'expand_more'
                        }
                        size={18}
                        color="#fff"
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleTierInfo(tier.key as 'elite' | 'oevet' | 'begynder')}
                      style={styles.tierInfoButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Info om ${tier.label}`}
                    >
                      <IconSymbol
                        ios_icon_name="info.circle"
                        android_material_icon_name="info"
                        size={18}
                        color="#fff"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                {expandedTiers[tier.key as keyof typeof expandedTiers] ? (
                  items.length ? (
                    items.map(item => (
                      <TouchableOpacity
                        key={item.templateId}
                        style={styles.tierRow}
                        onPress={() => setSelectedTask(item)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Se detaljer for ${item.name}`}
                      >
                        <Text style={styles.tierRowName}>{item.name}</Text>
                        <Text style={styles.tierRowScores}>
                          {item.lastScores.map(score => Math.round(score)).join(' · ')}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={styles.tierEmptyText}>Ingen opgaver endnu</Text>
                  )
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Modal
        visible={!!selectedTask}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTask(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.card }]}>
            <Text style={[styles.modalTitle, { color: palette.text }]}>{selectedTask?.name}</Text>
            {selectedTask?.description ? (
              <Text style={[styles.taskDescription, { color: palette.textSecondary }]}>
                {selectedTask.description}
              </Text>
            ) : selectedTask?.scoreExplanation ? null : (
              <Text style={[styles.taskDescription, { color: palette.textSecondary }]}>
                Ingen beskrivelse tilgængelig for denne opgave.
              </Text>
            )}

            {selectedTask?.scoreExplanation ? (
              <View
                style={[
                  styles.taskExplanationBox,
                  { backgroundColor: palette.backgroundAlt, borderColor: palette.border },
                ]}
              >
                <Text style={[styles.taskExplanationTitle, { color: palette.text }]}>Scoreforklaring</Text>
                <Text style={[styles.taskExplanationText, { color: palette.textSecondary }]}>
                  {selectedTask.scoreExplanation}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: palette.text }]}>Scorehistorik</Text>
            {selectedTask?.history?.length ? (
              <ScrollView style={styles.historyList} contentContainerStyle={styles.historyContent}>
                {selectedTask.history.map((entry, index) => (
                  <View
                    key={`${selectedTask.templateId}-${index}`}
                    style={[styles.historyRow, { borderColor: palette.border }]}
                  >
                    <View style={styles.historyMeta}>
                      <Text style={[styles.historyDate, { color: palette.text }]}>
                        {formatHistoryDate(entry.createdAt)}
                      </Text>
                      {entry.activityTitle ? (
                        <Text style={[styles.historyActivity, { color: palette.textSecondary }]}>
                          {entry.activityTitle}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.historyScoreBadge,
                        { backgroundColor: resolveValueColor(entry.rating) },
                      ]}
                    >
                      <Text style={styles.historyScoreText}>{Math.round(entry.rating)}/10</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={[styles.historyEmptyText, { color: palette.textSecondary }]}>
                Ingen scores endnu
              </Text>
            )}

            <TouchableOpacity
              onPress={() => setSelectedTask(null)}
              style={[styles.closeButton, { backgroundColor: palette.primary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.closeButtonText, { color: '#fff' }]}>Luk</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                      Feedback opgaver: {selectedDetails.focusName}
                    </Text>
                    <Text style={[styles.modalText, { color: palette.textSecondary }]}>
                      Aktivitet: {selectedDetails.activityTitle || 'Aktivitet'}
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
  tierSection: {
    gap: 12,
    marginBottom: 24,
  },
  tierCard: {
    borderRadius: 16,
    padding: 16,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tierHeaderLeft: {
    flex: 1,
  },
  tierHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tierTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  tierCount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  tierInfoButton: {
    padding: 4,
  },
  tierToggleButton: {
    padding: 4,
  },
  tierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  tierRowName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  tierRowScores: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  tierEmptyText: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.9,
  },
  taskDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  taskExplanationBox: {
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  taskExplanationTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  taskExplanationText: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
  },
  historyList: {
    maxHeight: 260,
  },
  historyContent: {
    paddingBottom: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyMeta: {
    flex: 1,
    paddingRight: 12,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyActivity: {
    fontSize: 12,
    marginTop: 2,
  },
  historyScoreBadge: {
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
  },
  historyScoreText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  historyEmptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
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
