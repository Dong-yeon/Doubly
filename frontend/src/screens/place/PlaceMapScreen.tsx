/** 우리 맛집 지도 — 커플 공유 장소 목록 (위시리스트/방문완료). 지도 렌더링은 카카오맵 키 발급 후 확장 */
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { KakaoMap } from '../../components/KakaoMap';
import { AiInsightButton } from '../../components/AiInsightButton';
import { placeApi } from '../../api/place';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { DateCourse, Place, PlaceStatus } from '../../types';

type Props = NativeStackScreenProps<PlaceStackParamList, 'PlaceMap'>;

/** AI 데이트 코스 결과 렌더 */
function renderDateCourse(c: DateCourse) {
  return (
    <View style={{ gap: spacing.sm }}>
      {c.comment ? <Text style={styles.courseComment}>{c.comment}</Text> : null}
      {c.stops.map((s, i) => (
        <View key={i} style={styles.courseStop}>
          <Text style={styles.courseNum}>{i + 1}</Text>
          <View style={styles.courseStopBody}>
            <Text style={styles.courseName}>
              {s.name}
              {s.category ? ` · ${s.category}` : ''}
            </Text>
            {s.reason ? <Text style={styles.courseReason}>{s.reason}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const FILTERS: { value: PlaceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'WISHLIST', label: '💛 가고 싶어요' },
  { value: 'VISITED', label: '✅ 다녀왔어요' },
];

export function PlaceMapScreen({ navigation }: Props) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [filter, setFilter] = useState<PlaceStatus | 'ALL'>('ALL');
  const [mapMode, setMapMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlaces(await placeApi.list());
    } catch (e) {
      toast.error(getErrorMessage(e, '장소를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onDelete = (place: Place) => {
    Alert.alert('장소 삭제', `"${place.name}"을(를) 삭제할까요?\n방문 기록도 함께 삭제돼요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await placeApi.remove(place.id);
            haptics.light();
            toast.success('장소를 삭제했어요.');
            load();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const filtered = filter === 'ALL' ? places : places.filter((p) => p.status === filter);
  // 좌표가 등록된 장소만 지도에 핀으로 표시
  const markers = filtered
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({ id: p.id, lat: p.lat as number, lng: p.lng as number, title: p.name }));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>우리 맛집 지도</Text>
        <AiInsightButton
          label="AI 데이트 코스"
          emoji="💕"
          title="AI 데이트 코스"
          fetcher={placeApi.dateCourse}
          render={renderDateCourse}
        />
      </View>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        {isKakaoMapConfigured() ? (
          <TouchableOpacity
            style={[styles.filterChip, mapMode && styles.filterChipActive]}
            onPress={() => setMapMode((v) => !v)}
          >
            <Text style={[styles.filterText, mapMode && styles.filterTextActive]}>🗺️ 지도</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.filterChip} onPress={() => navigation.navigate('TripList')}>
          <Text style={styles.filterText}>✈️ 여행</Text>
        </TouchableOpacity>
      </View>

      {mapMode ? (
        <View style={styles.mapWrap}>
          <KakaoMap
            markers={markers}
            height={0} // style 의 flex 로 채움
            style={styles.map}
            onMarkerPress={(id) => {
              const place = places.find((p) => p.id === id);
              if (place) navigation.navigate('PlaceDetail', { placeId: place.id, name: place.name });
            }}
          />
          <Text style={styles.mapHint}>
            {markers.length === 0
              ? '위치가 등록된 장소가 없어요. 장소 추가 시 지도에서 위치를 선택해보세요!'
              : '핀을 탭하면 상세로 이동해요.'}
          </Text>
        </View>
      ) : (
      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
            onLongPress={() => onDelete(item)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.name}</Text>
              {item.category ? (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
              ) : null}
            </View>
            {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
            <View style={styles.cardFooter}>
              <Text style={styles.statusBadge}>
                {item.status === 'VISITED' ? '✅ 다녀왔어요' : '💛 가고 싶어요'}
              </Text>
              {item.visitCount > 0 ? (
                <Text style={styles.visitInfo}>
                  {item.avgRating ? `★ ${item.avgRating.toFixed(1)} · ` : ''}방문 {item.visitCount}회
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              emoji="📍"
              title="아직 저장한 장소가 없어요"
              description="함께 가고 싶은 맛집을 추가해보세요! (카드를 길게 눌러 삭제)"
            />
          ) : null
        }
      />
      )}

      <View style={styles.fabWrap}>
        <Button title="＋ 장소 추가하기" onPress={() => navigation.navigate('PlaceAdd')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  screenTitle: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  courseComment: { fontSize: fontSize.body, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.xs },
  courseStop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  courseNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    color: colors.white,
    fontWeight: '800',
    fontSize: fontSize.caption,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  courseStopBody: { flex: 1 },
  courseName: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  courseReason: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2, lineHeight: 18 },
  filterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  filterText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.textPrimary, fontWeight: '800' },
  list: { padding: spacing.lg, paddingBottom: 120 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  categoryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  address: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  statusBadge: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  visitInfo: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  mapWrap: { flex: 1, padding: spacing.lg, paddingBottom: 96 },
  map: { flex: 1 },
  mapHint: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
});
