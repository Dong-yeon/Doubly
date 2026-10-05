/** 몸 변화 — 체중·체지방·둘레 추적 + 진행 사진(before/after). 경량 막대 그래프. */
import React, { useCallback, useState } from 'react';
import Svg, { Circle, Polyline } from 'react-native-svg';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { DateField } from '../../components/DateField';
import { EmptyState } from '../../components/EmptyState';
import { bodyApi } from '../../api/body';
import { pickImage, uploadImage } from '../../utils/imageUpload';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel, toDateString } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { confirmDiscard } from '../../utils/discardGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { BodyMetric } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';
import { sanitizeDecimalInput } from '../../utils/numericInput';
import { useDeleteAction } from '../../hooks/useDeleteAction';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'BodyMetric'>;

/** YYYY-MM-DD → 그날 0시(로컬) 기준 일 수 — 이동평균 창(7일)을 날짜로 자르려고 */
function dayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(new Date(y, m - 1, d).getTime() / 86400000);
}

/** 이동평균 창 — 그날 포함 지난 7일(달력 기준) */
const MA_WINDOW_DAYS = 7;

/**
 * 측정마다 "그날까지 7일 안에 잰 체중의 평균". 하루하루의 물·식사 변동을 눌러 추세만 남긴다.
 * <b>기록이 7일어치가 안 되면 null</b> — 첫 기록부터 마지막 기록까지가 6일 이하이면 평균이 원 데이터와
 * 거의 같아 선이 정보를 더하지 않고, 짧은 구간의 "추세"는 오해만 산다. 클라이언트 계산(서버 변경 없음).
 */
function movingAverage(points: { measuredDate: string; weightKg: number }[]): number[] | null {
  if (points.length < 2) return null;
  const days = points.map((p) => dayIndex(p.measuredDate));
  if (days[days.length - 1] - days[0] < MA_WINDOW_DAYS - 1) return null;
  return points.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && days[i] - days[j] < MA_WINDOW_DAYS; j--) {
      sum += points[j].weightKg;
      n++;
    }
    return sum / n;
  });
}

/** 막대 높이(px) — 12~88 */
const BAR_MIN = 12;
const BAR_SPAN = 76;
const CHART_H = 100;

/**
 * 체중 막대 그래프 — 최근 14개, min~max 정규화 + 7일 이동평균 선.
 *
 * <p>이 화면은 <b>나만 본다</b>. 체중·추세는 상대에게 보이지 않는다는 원칙(LOVEBODY_REVIEW §2-6)이라
 * 이 선을 피드·홈·채팅 같은 공유 화면으로 옮기지 않는다.
 */
function WeightChart({ data }: { data: BodyMetric[] }) {
  const [width, setWidth] = useState(0);
  // 평균은 화면에 그리는 14개보다 앞선 기록까지 써야 첫 점의 창이 비지 않는다
  const all = data
    .filter((d) => d.weightKg != null)
    .map((d) => ({ id: d.id, measuredDate: d.measuredDate, weightKg: d.weightKg as number }));
  const ma = movingAverage(all);
  const from = Math.max(0, all.length - 14);
  const points = all.slice(from);
  const avg = ma ? ma.slice(from) : null;
  if (points.length < 2) return null;
  const values = [...points.map((p) => p.weightKg), ...(avg ?? [])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const heightOf = (kg: number) => BAR_MIN + ((kg - min) / range) * BAR_SPAN;
  // 막대 칸은 flex 균등 분할(gap 4) — 선의 x 는 각 칸의 가운데
  const GAP = 4;
  const col = width > 0 ? (width - GAP * (points.length - 1)) / points.length : 0;
  const xOf = (i: number) => i * (col + GAP) + col / 2;
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
  const lastAvg = avg ? avg[avg.length - 1] : null;
  return (
    <View
      style={styles.chart}
      accessible
      accessibilityLabel={`최근 체중 ${points.length}개, ${fmt(min)}~${fmt(max)}kg${
        lastAvg != null ? `, 7일 평균 ${fmt(lastAvg)}kg` : ''
      }`}
    >
      <View style={styles.chartBars} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <View key={p.id} style={styles.chartCol}>
              <Text style={styles.chartVal}>{p.weightKg}</Text>
              <View style={[styles.chartBar, { height: heightOf(p.weightKg) }, isLast && styles.chartBarLast]} />
            </View>
          );
        })}
        {avg && width > 0 ? (
          <Svg width={width} height={CHART_H} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Polyline
              points={avg.map((v, i) => `${xOf(i)},${CHART_H - heightOf(v)}`).join(' ')}
              fill="none"
              stroke={colors.textPrimary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Circle cx={xOf(avg.length - 1)} cy={CHART_H - heightOf(avg[avg.length - 1])} r={3} fill={colors.textPrimary} />
          </Svg>
        ) : null}
      </View>
      <Text style={styles.chartCaption}>
        최근 체중 추이 (kg) · {fmt(min)}~{fmt(max)}
        {lastAvg != null ? ` · 선 = 7일 평균 ${fmt(lastAvg)}kg` : ''}
      </Text>
    </View>
  );
}

export function BodyMetricScreen(_: Props) {
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(false);
  // 삭제 in-flight 가드 — 공용 훅으로 중복 DELETE 방지 + 해당 행 흐리게 (QA_CHECKLIST.md 전역 반복 패턴 7)
  const { deletingId, runDelete } = useDeleteAction<number>();

  const [addOpen, setAddOpen] = useState(false);
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [waist, setWaist] = useState('');
  /** 측정일 — 기본은 오늘이되 어제 잰 인바디도 그 날짜로 기록할 수 있다 */
  const [measuredDate, setMeasuredDate] = useState(toDateString());
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 측정 모달 닫기 — 입력이 있으면 확인 후 닫는다 (백드롭·Android 백 공용).
  // "사라져요"라고 안내했으므로 닫을 때 실제로 비운다 (남기면 다음에 또 확인이 뜬다)
  const closeAddModal = () =>
    confirmDiscard(
      weight.trim().length > 0 || bodyFat.trim().length > 0 || waist.trim().length > 0 || photoUri != null,
      () => {
        setAddOpen(false);
        resetForm();
      },
    );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMetrics(await bodyApi.list());
    } catch (e) {
      toast.error(getErrorMessage(e, '기록을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onPickPhoto = async () => {
    try {
      const uri = await pickImage();
      if (uri) setPhotoUri(uri);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진 선택에 실패했어요.'));
    }
  };

  const resetForm = () => {
    setWeight('');
    setBodyFat('');
    setWaist('');
    setPhotoUri(null);
    setMeasuredDate(toDateString());
  };

  const onSave = async () => {
    if (!weight && !bodyFat && !waist && !photoUri) {
      toast.error('측정값이나 사진을 하나 이상 입력해주세요.');
      return;
    }
    // sanitizeDecimalInput이 타이핑 단계에서 대부분 걸러주지만, "." 하나만 남는
    // 경우처럼 여전히 Number()가 NaN이 될 수 있는 값이 있다 — 이 경우 "값을 안 넣었다"는
    // 엉뚱한 메시지 대신 어느 필드가 문제인지 알 수 있게 안내한다.
    const weightKg = weight ? Number(weight) : undefined;
    const bodyFatPct = bodyFat ? Number(bodyFat) : undefined;
    const waistCm = waist ? Number(waist) : undefined;
    if ([weightKg, bodyFatPct, waistCm].some((n) => n !== undefined && !Number.isFinite(n))) {
      toast.error('체중·체지방·허리 값을 확인해주세요.');
      return;
    }
    setSaving(true);
    try {
      let photoUrl: string | undefined;
      if (photoUri) photoUrl = await runBusy('사진 올리는 중…', () => uploadImage(photoUri));
      await bodyApi.save({
        measuredDate,
        weightKg,
        bodyFatPct,
        waistCm,
        photoUrl,
      });
      haptics.success();
      toast.success('측정 기록을 저장했어요 ');
      setAddOpen(false);
      resetForm();
      load();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (m: BodyMetric) => {
    Alert.alert('기록 삭제', `${m.measuredDate} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          runDelete(m.id, async () => {
            await bodyApi.remove(m.id);
            haptics.light();
            load();
          }),
      },
    ]);
  };

  // 최신순으로 리스트 표시 (list는 오래된→최신)
  const reversed = [...metrics].reverse();
  const latest = reversed[0];
  const prev = reversed[1];
  const weightDelta =
    latest?.weightKg != null && prev?.weightKg != null ? latest.weightKg - prev.weightKg : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={reversed}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          metrics.length > 0 ? (
            <View>
              <View style={styles.summary}>
                <Text style={styles.summaryLabel}>현재 체중</Text>
                <Text style={styles.summaryValue}>
                  {latest?.weightKg != null ? `${latest.weightKg}kg` : '-'}
                </Text>
                {weightDelta != null ? (
                  <Text style={[styles.summaryDelta, weightDelta <= 0 ? styles.deltaDown : styles.deltaUp]}>
                    {weightDelta > 0 ? '▲' : '▼'} {Math.abs(weightDelta).toFixed(1)}kg
                  </Text>
                ) : null}
              </View>
              <WeightChart data={metrics} />
              <Text style={styles.sectionTitle}>기록</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          // 탭에 연결된 동작이 없다 — 상세/수정 화면이 따로 없으므로 activeOpacity 를
          // 1로 두어 눌러도 눌린 것처럼 보이지 않게 한다(길게 누르면 삭제는 그대로 동작).
          // 삭제 중인 행은 흐리게 + disabled (QA_CHECKLIST.md 전역 반복 패턴 7)
          <TouchableOpacity
            style={[styles.card, deletingId === item.id && styles.cardDeleting]}
            activeOpacity={1}
            disabled={deletingId === item.id}
            onLongPress={() => onDelete(item)}
            accessibilityHint="길게 눌러 삭제"
          >
            {item.photoUrl ? (
              <Image source={{ uri: item.photoUrl }} style={styles.thumb} resizeMode="cover" />
            ) : null}
            <View style={styles.cardBody}>
              <Text style={styles.cardDate}>{relativeDateLabel(item.measuredDate)}</Text>
              <Text style={styles.cardMetrics}>
                {item.weightKg != null ? `체중 ${item.weightKg}kg` : ''}
                {item.bodyFatPct != null ? `  체지방 ${item.bodyFatPct}%` : ''}
                {item.waistCm != null ? `  허리 ${item.waistCm}cm` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="chart-line"
              title="몸의 변화를 기록해보세요"
              description="체중·체지방·둘레와 진행 사진을 남기면 변화를 그래프로 볼 수 있어요."
            />
          ) : null
        }
      />
      <View style={styles.fabWrap}>
        <Button title="＋ 측정 추가" onPress={() => setAddOpen(true)} />
      </View>

      {/* 측정 추가 모달 */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAddModal}>
        <Pressable style={styles.backdrop} onPress={closeAddModal}>
          {/* 키보드가 "저장" 버튼을 가리지 않도록 카드째로 밀어올린다 */}
          <KeyboardAvoidingView style={styles.modalAvoid} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              {/* 사진까지 있으면 내용이 길어져 작은 화면에서는 카드 안에서 스크롤한다 */}
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>측정 기록</Text>
                {/* 측정일 선택 — 예전엔 저장 시각의 오늘로 고정이었다 */}
                <DateField
                  label="측정일"
                  value={measuredDate}
                  onChange={setMeasuredDate}
                  max={toDateString()}
                  pickerTitle="언제 측정했나요?"
                />
                <View style={styles.formRow}>
                  <View style={styles.flex}>
                    <TextField
                      label="체중(kg)"
                      value={weight}
                      onChangeText={(v) => setWeight(sanitizeDecimalInput(v))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.flex}>
                    <TextField
                      label="체지방(%)"
                      value={bodyFat}
                      onChangeText={(v) => setBodyFat(sanitizeDecimalInput(v))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.flex}>
                    <TextField
                      label="허리(cm)"
                      value={waist}
                      onChangeText={(v) => setWaist(sanitizeDecimalInput(v))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.photoBox, photoUri ? styles.photoBoxFilled : styles.photoBoxEmpty]}
                  onPress={onPickPhoto}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="진행 사진 선택"
                >
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
                  ) : (
                    <Text style={styles.photoPlaceholder}>진행 사진 (선택)</Text>
                  )}
                </TouchableOpacity>
                <Button title="저장" onPress={onSave} loading={saving} style={styles.modalBtn} />
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  summary: { alignItems: 'center', paddingVertical: spacing.md },
  summaryLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  summaryValue: { fontSize: 40, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
  summaryDelta: { fontSize: fontSize.body, fontWeight: '800', marginTop: spacing.xs },
  deltaDown: { color: colors.success },
  deltaUp: { color: colors.textSecondary },
  chart: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  // 9pt 는 읽기 어렵다 — 막대 위 수치라 작아도 되지만 하한은 지킨다
  chartVal: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  chartBar: { width: '70%', borderRadius: 3, backgroundColor: colors.primaryBg },
  chartBarLast: { backgroundColor: colors.primary },
  chartCaption: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.md },
  // 삭제 진행 중인 행 흐리게 (QA_CHECKLIST.md 전역 반복 패턴 7)
  cardDeleting: { opacity: 0.4 },
  cardBody: { flex: 1 },
  cardDate: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  cardMetrics: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  // 카드 maxHeight(%)가 계산되도록 부모(KAV)에 확정 높이를 준다
  modalAvoid: { flex: 1, justifyContent: 'center' },
  // maxHeight: 키보드가 올라온 작은 화면에서도 카드가 화면을 넘지 않게 (내부는 ScrollView)
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, maxHeight: '85%' },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  photoBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  /*
   * 사진 유무로 높이 규칙이 다르다. 예전엔 photoBox 에 고정 height 를 두고
   * photoBoxFilled 에서 `height: undefined` 로 지우려 했는데, 스타일 병합에서
   * undefined 는 무시되어 고정 높이가 그대로 남고 aspectRatio 가 먹지 않았다.
   * 그래서 기본에는 높이를 두지 않고 상태별 스타일로 나눈다.
   */
  photoBoxEmpty: { width: '100%', aspectRatio: 16 / 9 },
  photoBoxFilled: { width: '100%', aspectRatio: 4 / 3 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '600' },
  modalBtn: { marginTop: spacing.md },
}));
