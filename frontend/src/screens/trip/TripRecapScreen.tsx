/** 여행 회고 카드 — 여행 하나의 집계 요약(일정·장소·경비·사진·준비물)을 한 장으로 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '../../components/Icon';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { TripSectionTabs } from './TripSectionTabs';
import { tripApi } from '../../api/trip';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { formatMoney } from '../../utils/format';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { TripRecap, TripStatus } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<PlaceStackParamList, 'TripRecap'>;

/* 천단위 구분은 공용 유틸(utils/format)로 통일했다 */
const money = formatMoney;

function statusLabel(status: TripStatus): string {
  if (status === 'UPCOMING') return '곧 떠나요';
  if (status === 'ONGOING') return '여행 중';
  return '다녀온 여행';
}

function closingLine(r: TripRecap): string {
  if (r.status === 'UPCOMING') return '설레는 여행, 차근차근 준비해요';
  if (r.status === 'ONGOING') return '여행 중이에요! 순간순간을 담아봐요';
  return `둘이 함께한 ${r.days}일, 좋은 추억이 됐어요`;
}

export function TripRecapScreen({ route }: Props) {
  const { tripId, title } = route.params;
  const [recap, setRecap] = useState<TripRecap | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecap(await tripApi.recap(tripId));
    } catch (e) {
      toast.error(getErrorMessage(e, '회고를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!recap) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]} edges={['bottom']}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
      </SafeAreaView>
    );
  }

  const tiles = [
    { icon: 'calendar-check-outline', value: `${recap.itineraryItemCount}`, label: '일정' },
    { icon: 'map-marker-outline', value: `${recap.placeCount}`, label: `장소 (방문 ${recap.visitedPlaceCount})` },
    { icon: 'wallet-outline', value: recap.expenseTotal > 0 ? money(recap.expenseTotal) : '0원', label: '총 지출' },
    { icon: 'image-multiple-outline', value: `${recap.photoCount}`, label: '사진' },
    { icon: 'bag-personal-outline', value: `${recap.checklistChecked}/${recap.checklistTotal}`, label: '준비물' },
    { icon: 'calendar-range', value: `${recap.nights}박 ${recap.days}일`, label: '기간' },
  ] as const;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 형제 화면(경비·준비물·앨범)으로 바로 이동 — 여행 상세를 거치지 않는다 */}
      <TripSectionTabs tripId={tripId} title={title} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 히어로 */}
        <View style={styles.hero}>
          <View style={styles.statusChip}>
            <Text style={styles.statusText}>{statusLabel(recap.status)}</Text>
          </View>
          <Text style={styles.title}>{recap.title}</Text>
          <Text style={styles.dates}>
            {recap.startDate} ~ {recap.endDate}
          </Text>
        </View>

        {/* 스탯 타일 */}
        <View style={styles.tiles}>
          {tiles.map((t) => (
            <View key={t.label} style={styles.tile}>
              <MaterialCommunityIcons name={t.icon} size={22} color={colors.textSecondary} />
              <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                {t.value}
              </Text>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </View>
          ))}
        </View>

        {/* 마무리 한 줄 */}
        <Text style={styles.closing}>{closingLine(recap)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  hero: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  statusText: { fontSize: fontSize.caption, color: colors.togetherText, fontWeight: '800' },
  title: {
    fontSize: fontSize.heading,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  dates: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '600', marginTop: spacing.xs },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  tileValue: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.xs },
  tileLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xxs, textAlign: 'center' },

  closing: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
    lineHeight: 22,
  },
}));
