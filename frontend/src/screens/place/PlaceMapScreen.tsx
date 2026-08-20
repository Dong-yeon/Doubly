/**
 * 럽슐랭 지도 — 커플 공유 장소 전체를 지도 위에서 훑어본다(맛집·여행지·전시 등).
 * 예전엔 이 화면이 목록/지도를 겸했지만, 목록은 럽슐랭 가이드/위시리스트 화면으로
 * 옮겨가고 여기는 지도 전용으로 축소됐다 — {@link PlaceSectionTabs} 참고.
 * 핀 색=식단 구분(그대로), 왕관 오버레이=럽슐랭 인증(tier>0) — 서로 다른 축이라 겹쳐 그린다.
 * 검색·필터는 위시리스트 화면과 {@link usePlaceStore}를 공유한다.
 */
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { KakaoMap } from '../../components/KakaoMap';
import { TextField } from '../../components/TextField';
import { AiInsightButton } from '../../components/AiInsightButton';
import { PlaceSectionTabs } from './PlaceSectionTabs';
import { STATUS_FILTERS, DIET_FILTERS } from './placeFilters';
import { placeApi } from '../../api/place';
import { usePlaceStore } from '../../store/placeStore';
import { isKakaoMapConfigured } from '../../constants/config';
import { colors, fontSize, spacing } from '../../constants/theme';
import type { DateCourse, PlaceDietTag } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;

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

// 지도 핀 색상 — 식단 구분(클린식=초록/치팅데이=주황/구분 없음=빨강)을 항상 나타낸다.
// 방문 여부는 색과 별개 축이라 핀을 채우거나(다녀옴) 테두리만 남겨(위시리스트) 구분한다 — 아래 지도 범례 참고
const DIET_TAG_PIN_COLOR: Record<PlaceDietTag, string> = {
  CLEAN: '#22C55E',
  CHEAT: '#F97316',
  NEUTRAL: colors.danger,
};

export function PlaceMapScreen() {
  const navigation = useNavigation<Nav>();
  const places = usePlaceStore((s) => s.places);
  const load = usePlaceStore((s) => s.load);
  const search = usePlaceStore((s) => s.search);
  const setSearch = usePlaceStore((s) => s.setSearch);
  const filter = usePlaceStore((s) => s.statusFilter);
  const setFilter = usePlaceStore((s) => s.setStatusFilter);
  const dietFilter = usePlaceStore((s) => s.dietFilter);
  const setDietFilter = usePlaceStore((s) => s.setDietFilter);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  const filtered = places
    .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((p) => filter === 'ALL' || p.status === filter)
    .filter((p) => dietFilter === 'ALL' || p.dietTag === dietFilter);
  // 좌표가 등록된 장소만 지도에 핀으로 표시 — 색은 식단 구분, 채움 여부는 방문 여부,
  // tier 는 럽슐랭 인증 여부(왕관 오버레이) — 서로 다른 세 축이 한 핀에 겹친다
  const markers = filtered
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      title: p.name,
      color: DIET_TAG_PIN_COLOR[p.dietTag],
      filled: p.status === 'VISITED',
      tier: p.lovelichelinTier,
    }));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>지도</Text>
        <View style={styles.titleActions}>
          <AiInsightButton
            label="AI 데이트 코스"
            title="AI 데이트 코스"
            fetcher={placeApi.dateCourse}
            render={renderDateCourse}
          />
          {/* 여행(Trip) 진입로 임시로 가려둠 — 기능 자체는 그대로 두고 나중에 다시 노출할 수 있다 */}
          {/* <IconButton icon="airplane" label="우리 여행" onPress={() => navigation.navigate('TripList')} /> */}
        </View>
      </View>
      <PlaceSectionTabs />

      {!isKakaoMapConfigured() ? (
        <View style={styles.mapUnavailable}>
          <EmptyState
            icon="map-marker-outline"
            title="지도를 아직 쓸 수 없어요"
            description="카카오맵 키가 설정되면 지도에서 장소를 한눈에 볼 수 있어요."
          />
        </View>
      ) : (
        <>
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
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((f) => (
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

          <View style={styles.mapWrap}>
            {/* 핀 색=식단 구분, 채움/테두리=방문 여부, 왕관=럽슐랭 인증 — 범례 없이는 못 읽는다 */}
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
              <View style={styles.legendItem}>
                <Text style={styles.legendCrown}>👑</Text>
                <Text style={styles.legendText}>럽슐랭 인증</Text>
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
        </>
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  mapUnavailable: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  mapWrap: { flex: 1, padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendDotFilled: { backgroundColor: colors.textSecondary },
  legendDotOutline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.textSecondary },
  legendCrown: { fontSize: 12 },
  legendText: { fontSize: fontSize.caption, color: colors.textSecondary },
  map: { flex: 1 },
  mapHint: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
}));
