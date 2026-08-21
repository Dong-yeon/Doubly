/** 우리 여행 — 커플 여행 목록 (예정 D-day / 여행 중 / 다녀옴) */
import React, { useCallback, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { tripApi } from '../../api/trip';
import { usePlaceStore } from '../../store/placeStore';
import { getErrorMessage } from '../../utils/error';
import { toDateString } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Trip } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<HomeStackParamList, 'TripList'>;

/** 여행 상태 라벨 — 예정(D-n) / 여행 중 / 다녀옴 */
export function tripStatusLabel(trip: Trip): string {
  const today = toDateString();
  if (today < trip.startDate) {
    const diff = Math.round(
      (new Date(`${trip.startDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000,
    );
    return `D-${diff}`;
  }
  if (today <= trip.endDate) return '여행 중';
  return '다녀옴';
}

export function TripListScreen({ navigation }: Props) {
  // 여행 삭제는 담긴 장소들의 trip_id 를 NULL 로 되돌린다(ON DELETE SET NULL) —
  // 위시리스트의 "✈️ 여행에 담김" 칩이 남지 않게 placeStore 캐시를 무효화한다.
  const invalidatePlaces = usePlaceStore((s) => s.invalidate);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setTrips(await tripApi.list());
    } catch (e) {
      toast.error(getErrorMessage(e, '여행을 불러오지 못했어요.'));
      // 실패해도 목록은 비우지 않는다 — "진짜 빈 목록"과 구분은 loadError 로 한다
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onDelete = (trip: Trip) => {
    Alert.alert('여행 삭제', `"${trip.title}"을(를) 삭제할까요?\n담긴 장소는 장소 지도에 그대로 남아요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await tripApi.remove(trip.id);
            haptics.light();
            toast.success('여행을 삭제했어요.');
            invalidatePlaces();
            load();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={trips}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('TripDetail', { tripId: item.id, title: item.title })}
            onLongPress={() => onDelete(item)}
          >
            {item.coverImageUrl ? (
              <Image source={{ uri: item.coverImageUrl }} style={styles.cover} resizeMode="cover" />
            ) : null}
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.statusChip}>
                  <Text style={styles.statusText}>{tripStatusLabel(item)}</Text>
                </View>
              </View>
              <Text style={styles.dates}>
                {item.startDate} ~ {item.endDate}
              </Text>
              <Text style={styles.placeCount}>담긴 장소 {item.placeCount}곳</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="여행을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={load}
              />
            ) : (
              <EmptyState
                icon="airplane"
                title="아직 여행이 없어요"
                description="함께 갈 여행을 계획해보세요! (카드를 길게 눌러 삭제)"
              />
            )
          ) : null
        }
      />
      <View style={styles.fabWrap}>
        <Button title="＋ 여행 만들기" onPress={() => navigation.navigate('TripForm', {})} />
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cover: { width: '100%', height: 140 },
  cardBody: { padding: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryBg,
  },
  statusText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  dates: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  placeCount: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '600', marginTop: spacing.sm },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
}));
