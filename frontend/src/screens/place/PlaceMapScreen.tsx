/** 우리 장소 지도 — 커플 공유 장소 목록 (맛집·여행지·전시 등, 위시리스트/방문완료). 지도 렌더링은 카카오맵 키 발급 후 확장 */
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { KakaoMap } from '../../components/KakaoMap';
import { TextField } from '../../components/TextField';
import { AiInsightButton } from '../../components/AiInsightButton';
import { placeApi } from '../../api/place';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { DateCourse, Place, PlaceDietTag, PlaceStatus } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

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
  { value: 'WISHLIST', label: '가고 싶어요' },
  { value: 'VISITED', label: '다녀왔어요' },
];

// 클린식/치팅데이 필터 — 평소 식단 유지용 vs 보상 데이트용을 스위치로 구분
const DIET_FILTERS: { value: PlaceDietTag | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'CLEAN', label: '🥗 클린식' },
  { value: 'CHEAT', label: '🍔 치팅데이' },
];

// 지도 핀 색상 — 식단 구분(클린식=초록/치팅데이=주황/구분 없음=빨강)을 항상 나타낸다.
// 방문 여부는 색과 별개 축이라 핀을 채우거나(다녀옴) 테두리만 남겨(위시리스트) 구분한다 — 아래 지도 범례 참고
const DIET_TAG_PIN_COLOR: Record<PlaceDietTag, string> = {
  CLEAN: '#22C55E',
  CHEAT: '#F97316',
  NEUTRAL: colors.danger,
};

export function PlaceMapScreen({ navigation }: Props) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PlaceStatus | 'ALL'>('ALL');
  const [dietFilter, setDietFilter] = useState<PlaceDietTag | 'ALL'>('ALL');
  const [mapMode, setMapMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setPlaces(await placeApi.list());
    } catch (e) {
      toast.error(getErrorMessage(e, '장소를 불러오지 못했어요.'));
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

  const filtered = places
    .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((p) => filter === 'ALL' || p.status === filter)
    .filter((p) => dietFilter === 'ALL' || p.dietTag === dietFilter);
  // 좌표가 등록된 장소만 지도에 핀으로 표시 — 색은 식단 구분, 채움 여부는 방문 여부
  const markers = filtered
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      title: p.name,
      color: DIET_TAG_PIN_COLOR[p.dietTag],
      filled: p.status === 'VISITED',
    }));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>우리 장소 지도</Text>
        <View style={styles.titleActions}>
          <AiInsightButton
            label="AI 데이트 코스"
            title="AI 데이트 코스"
            fetcher={placeApi.dateCourse}
            render={renderDateCourse}
          />
          <IconButton icon="airplane" label="우리 여행" onPress={() => navigation.navigate('TripList')} />
        </View>
      </View>

      {/* 장소가 쌓이면 스크롤로 찾기 어려워진다 — 이름으로 바로 걸러낸다. 빈 목록일 땐 걸러낼 게 없어 숨긴다 */}
      {places.length > 0 ? (
        <View style={styles.searchWrap}>
          <TextField
            placeholder="장소 이름으로 검색"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
      ) : null}

      {/* 목록/지도는 같은 데이터를 다르게 "보는 방식"이라 상태 필터와는 분리한다 */}
      {isKakaoMapConfigured() ? (
        <View style={styles.viewToggleRow}>
          <Chip label="목록" selected={!mapMode} onPress={() => setMapMode(false)} fill />
          <Chip label="지도" selected={mapMode} onPress={() => setMapMode(true)} fill />
        </View>
      ) : null}

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>
      <View style={styles.filterRow}>
        {DIET_FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={dietFilter === f.value}
            onPress={() => setDietFilter(f.value)}
          />
        ))}
      </View>

      {mapMode ? (
        <View style={styles.mapWrap}>
          {/* 핀 색=식단 구분, 채움/테두리=방문 여부 — 두 축이 한 핀에 겹쳐 있어 범례 없이는 못 읽는다 */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: DIET_TAG_PIN_COLOR.CLEAN }]} />
              <Text style={styles.legendText}>클린식</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: DIET_TAG_PIN_COLOR.CHEAT }]} />
              <Text style={styles.legendText}>치팅데이</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: DIET_TAG_PIN_COLOR.NEUTRAL }]} />
              <Text style={styles.legendText}>구분 없음</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotFilled]} />
              <Text style={styles.legendText}>다녀옴</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotOutline]} />
              <Text style={styles.legendText}>가고 싶어요</Text>
            </View>
          </View>
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
        // 빈 목록에는 지울 게 없어 힌트가 의미 없다 — 카드가 있을 때만 보여준다
        ListHeaderComponent={filtered.length > 0 ? <Text style={styles.deleteHint}>카드를 길게 눌러 삭제할 수 있어요</Text> : null}
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
              {item.dietTag !== 'NEUTRAL' ? (
                <View style={[styles.categoryChip, styles.dietTagChip]}>
                  <Text style={styles.categoryText}>{item.dietTag === 'CLEAN' ? '🥗 클린식' : '🍔 치팅데이'}</Text>
                </View>
              ) : null}
              {item.tripId != null ? (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryText}>✈️ 여행에 담김</Text>
                </View>
              ) : null}
            </View>
            {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
            <View style={styles.cardFooter}>
              <Text style={styles.statusBadge}>
                {item.status === 'VISITED' ? '다녀왔어요' : '가고 싶어요'}
              </Text>
              {item.visitCount > 0 ? (
                <Text style={styles.visitInfo}>
                  {item.avgRating ? `${item.avgRating.toFixed(1)} · ` : ''}방문 {item.visitCount}회
                  {item.lastVisitedAt ? ` · 최근 ${item.lastVisitedAt}` : ''}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            loadError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="장소를 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={load}
              />
            ) : places.length > 0 ? (
              // 검색·필터로 걸러져 빈 것 — "아직 저장한 장소가 없어요"는 오해를 준다
              <EmptyState icon="map-marker-outline" title="조건에 맞는 장소가 없어요" description="검색어나 필터를 바꿔보세요." />
            ) : (
              <EmptyState
                icon="map-marker-outline"
                title="아직 저장한 장소가 없어요"
                description="함께 가고 싶은 맛집, 여행지, 전시를 추가해보세요! (카드를 길게 눌러 삭제)"
              />
            )
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

const styles = themedStyles((colors) => ({
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
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
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
  courseReason: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xxs, lineHeight: 18 },
  viewToggleRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  deleteHint: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
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
  dietTagChip: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
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
  mapWrap: { flex: 1, padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendDotFilled: { backgroundColor: colors.textSecondary },
  legendDotOutline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.textSecondary },
  legendText: { fontSize: fontSize.caption, color: colors.textSecondary },
  map: { flex: 1 },
  mapHint: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
}));
