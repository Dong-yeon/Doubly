/**
 * 럽슐랭 — 가이드(인증 장소 매거진)/위시리스트(후보)/지도를 한 화면 안에서 Chip 세그먼트로
 * 전환한다. 예전엔 화면 3개 + `navigation.replace()`로 탭 전환을 흉내냈지만
 * ({@link PlaceSectionTabs}, 삭제됨), 세 뷰가 어차피 같은 {@link usePlaceStore} 데이터를
 * 필터만 다르게 보여주는 거라 화면을 나눌 이유가 없었다 — 리브랜딩 전 PlaceMapScreen 이
 * 목록/지도를 Chip 토글로 전환하던 방식으로 되돌아간 셈이다(TripSectionTabs 를 본뜬
 * 2번째 사본을 만드는 대신).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { KakaoMap } from '../../components/KakaoMap';
import { MaterialCommunityIcons } from '../../components/Icon';
import { TextField } from '../../components/TextField';
import { AiInsightButton } from '../../components/AiInsightButton';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { LovelichelinRecommendCards } from './LovelichelinRecommendCards';
import { STATUS_FILTERS, DIET_FILTERS } from './placeFilters';
import { placeApi } from '../../api/place';
import { usePlaceStore } from '../../store/placeStore';
import { isKakaoMapConfigured } from '../../constants/config';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { stars } from '../../utils/ratingStars';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { DateCourse, LovelichelinRecommendation, Place, PlaceDietTag, PlaceStatus } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;
type Mode = 'guide' | 'wishlist' | 'map';

const MODES: { value: Mode; label: string }[] = [
  { value: 'guide', label: '럽슐랭 가이드' },
  { value: 'wishlist', label: '위시리스트' },
  { value: 'map', label: '지도' },
];

// 지도 핀 색상 — 식단 구분(클린식=초록/치팅데이=주황/구분 없음=빨강)을 항상 나타낸다.
// 방문 여부는 색과 별개 축이라 핀을 채우거나(다녀옴) 테두리만 남겨(위시리스트) 구분한다.
const DIET_TAG_PIN_COLOR: Record<PlaceDietTag, string> = {
  CLEAN: '#22C55E',
  CHEAT: '#F97316',
  NEUTRAL: colors.danger,
};

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

// 담기 진행/완료 상태가 필요해 렌더 함수가 아니라 컴포넌트(LovelichelinRecommendCards)로 그린다
function renderRecommendation(data: LovelichelinRecommendation) {
  return <LovelichelinRecommendCards data={data} />;
}

export function PlaceScreen() {
  const navigation = useNavigation<Nav>();
  const [mode, setMode] = useState<Mode>('guide');

  const allPlaces = usePlaceStore((s) => s.places);
  const loading = usePlaceStore((s) => s.loading);
  const loadError = usePlaceStore((s) => s.loadError);
  const load = usePlaceStore((s) => s.load);
  const invalidate = usePlaceStore((s) => s.invalidate);

  // 위시리스트/지도가 공유하는 검색·필터 — 가이드엔 없다(등급순 정렬 하나뿐)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlaceStatus | 'ALL'>('ALL');
  const [dietFilter, setDietFilter] = useState<PlaceDietTag | 'ALL'>('ALL');

  // 지도 탭에서 빈 자리를 탭해 고른 좌표 — 확정 전까지는 "여기에 추가" 바만 뜬다
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number; address?: string | null } | null>(
    null,
  );

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {}); // 에러는 loadError 로 화면에 이미 반영된다
    }, [load]),
  );

  const guidePlaces = useMemo(
    () =>
      allPlaces
        .filter((p) => p.lovelichelinTier > 0)
        .sort((a, b) => {
          if (b.lovelichelinTier !== a.lovelichelinTier) return b.lovelichelinTier - a.lovelichelinTier;
          return (b.lovelichelinCertifiedAt ?? '').localeCompare(a.lovelichelinCertifiedAt ?? '');
        }),
    [allPlaces],
  );

  // 위시리스트 = 아직 인증 전(tier===0) 전부. 지도는 인증 여부와 무관하게 전체를 보여준다
  // (공간적으로 다 훑어보는 용도라 굳이 나눌 이유가 없다) — 검색·필터만 공유한다.
  const searchFiltered = (list: Place[]) =>
    list
      .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
      .filter((p) => statusFilter === 'ALL' || p.status === statusFilter)
      .filter((p) => dietFilter === 'ALL' || p.dietTag === dietFilter);

  const wishlistPlaces = useMemo(
    () => searchFiltered(allPlaces.filter((p) => p.lovelichelinTier === 0)),
    [allPlaces, search, statusFilter, dietFilter],
  );
  const mapPlaces = useMemo(() => searchFiltered(allPlaces), [allPlaces, search, statusFilter, dietFilter]);
  const markers = mapPlaces
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
            invalidate();
            load(true);
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>럽슐랭</Text>
        <View style={styles.titleActions}>
          {mode === 'guide' ? (
            <AiInsightButton
              label="AI 맛집 추천"
              title="럽슐랭 취향 맞춤 추천"
              fetcher={placeApi.lovelichelinRecommend}
              render={renderRecommendation}
            />
          ) : null}
          {mode === 'map' ? (
            <AiInsightButton
              label="AI 데이트 코스"
              title="AI 데이트 코스"
              fetcher={placeApi.dateCourse}
              render={renderDateCourse}
            />
          ) : null}
          {/* 여행(Trip)은 홈 스택으로 이관 — 진입은 홈 D-day 카드·커플 캘린더 (navigation/types.ts 참고) */}
        </View>
      </View>

      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <Chip
            key={m.value}
            label={m.label}
            selected={mode === m.value}
            onPress={() => {
              setMode(m.value);
              // 지도를 벗어나면 고르던 좌표는 의미가 없다 — 다음에 지도로 돌아왔을 때
              // 엉뚱한 위치에 "여기에 추가" 바가 떠 있지 않게 비운다.
              if (m.value !== 'map') setPendingPin(null);
            }}
            fill
          />
        ))}
      </View>

      {mode !== 'guide' ? (
        <>
          {allPlaces.length > 0 ? (
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
              <Chip
                key={f.value}
                label={f.label}
                selected={statusFilter === f.value}
                onPress={() => {
                  setStatusFilter(f.value);
                  // 클린식/치팅데이는 방문 기록을 남길 때만 붙는 태그라 "가고 싶어요"엔
                  // 절대 걸리는 게 없다 — 필터 줄 자체를 접으면서 남아있던 선택도 지운다.
                  if (f.value === 'WISHLIST') setDietFilter('ALL');
                }}
              />
            ))}
          </View>
          {statusFilter !== 'WISHLIST' ? (
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
          ) : null}
        </>
      ) : null}

      {mode === 'guide' ? (
        <FlatList
          data={guidePlaces}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={() => load(true)}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
            >
              <Card elevation="sm" tint="together" style={styles.magazineCard}>
                {item.coverImageUrl ? (
                  <Image source={{ uri: item.coverImageUrl }} style={styles.coverPhoto} resizeMode="cover" />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <MaterialCommunityIcons name="crown" size={32} color={colors.togetherText} />
                  </View>
                )}
                <View style={styles.magazineBody}>
                  <View style={styles.magazineHeaderRow}>
                    <Text style={styles.magazineName}>{item.name}</Text>
                    <LovelichelinBadge tier={item.lovelichelinTier} size="sm" />
                  </View>
                  {item.category ? <Text style={styles.magazineCategory}>{item.category}</Text> : null}
                  <View style={styles.magazineRatingRow}>
                    <Text style={[styles.magazineRating, { color: colors.me }]}>
                      나 {item.myRating ? stars(item.myRating) : '미평가'}
                    </Text>
                    <Text style={[styles.magazineRating, { color: colors.partner }]}>
                      상대 {item.partnerRating ? stars(item.partnerRating) : '미평가'}
                    </Text>
                  </View>
                  {item.coverMemo ? (
                    <Text style={styles.magazineMemo} numberOfLines={2}>
                      “{item.coverMemo}”
                    </Text>
                  ) : null}
                  {item.lovelichelinCertifiedAt ? (
                    <Text style={styles.magazineDate}>{item.lovelichelinCertifiedAt.slice(0, 10)} 등극</Text>
                  ) : null}
                </View>
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !loading ? (
              loadError ? (
                <EmptyState
                  icon="cloud-off-outline"
                  title="가이드를 불러오지 못했어요"
                  description="네트워크 상태를 확인하고 다시 시도해주세요."
                  error
                  onRetry={() => load()}
                />
              ) : (
                <EmptyState
                  icon="crown"
                  title="아직 럽슐랭으로 인증된 장소가 없어요"
                  description="위시리스트에 담은 곳을 다녀온 뒤, 둘 다 평점을 매기면 등급이 매겨져요!"
                />
              )
            ) : null
          }
        />
      ) : null}

      {mode === 'wishlist' ? (
        <FlatList
          data={wishlistPlaces}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={() => load(true)}
          ListHeaderComponent={
            wishlistPlaces.length > 0 ? <Text style={styles.deleteHint}>카드를 길게 눌러 삭제할 수 있어요</Text> : null
          }
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
                <Text style={styles.statusBadge}>{item.status === 'VISITED' ? '다녀왔어요' : '가고 싶어요'}</Text>
                {item.visitCount > 0 ? (
                  <Text style={styles.visitInfo}>
                    {item.avgRating ? `${item.avgRating.toFixed(1)} · ` : ''}방문 {item.visitCount}회
                    {item.lastVisitedAt ? ` · 최근 ${item.lastVisitedAt}` : ''}
                  </Text>
                ) : null}
              </View>
              {item.myRating != null || item.partnerRating != null ? (
                <Text style={styles.pendingHint}>
                  {item.myRating != null && item.partnerRating != null
                    ? '럽슐랭 탈락 — 재평가하면 다시 등급이 매겨져요'
                    : `${item.myRating != null ? '내' : '상대'} 평점만 매겨졌어요 — 나머지 한 명의 평가를 기다리는 중`}
                </Text>
              ) : null}
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
                  onRetry={() => load()}
                />
              ) : allPlaces.length > 0 ? (
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
      ) : null}

      {mode === 'map' ? (
        !isKakaoMapConfigured() ? (
          <View style={styles.mapUnavailable}>
            <EmptyState
              icon="map-marker-outline"
              title="지도를 아직 쓸 수 없어요"
              description="카카오맵 키가 설정되면 지도에서 장소를 한눈에 볼 수 있어요."
            />
          </View>
        ) : (
          <View style={styles.mapWrap}>
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
              height={0}
              style={styles.map}
              selectable
              onSelect={(pos) => setPendingPin(pos)}
              onMarkerPress={(id) => {
                const place = mapPlaces.find((p) => p.id === id);
                if (place) navigation.navigate('PlaceDetail', { placeId: place.id, name: place.name });
              }}
            />
            <Text style={styles.mapHint}>
              {pendingPin
                ? '이 위치로 장소를 추가할까요?'
                : markers.length === 0
                  ? '위치가 등록된 장소가 없어요. 빈 곳을 탭해 장소를 추가해보세요!'
                  : '핀을 탭하면 상세로, 빈 곳을 탭하면 그 자리에 장소를 추가할 수 있어요.'}
            </Text>
          </View>
        )
      ) : null}

      <View style={styles.fabWrap}>
        {mode === 'map' && pendingPin ? (
          <View style={styles.pendingPinBar}>
            <View style={styles.pendingPinInfo}>
              <MaterialCommunityIcons name="map-marker" size={18} color={colors.primary} />
              <Text style={styles.pendingPinText} numberOfLines={1}>
                {pendingPin.address ?? `${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}`}
              </Text>
            </View>
            <View style={styles.pendingPinActions}>
              <IconButton icon="close" label="위치 선택 취소" onPress={() => setPendingPin(null)} />
              <Button
                title="여기에 추가"
                size="sm"
                onPress={() => {
                  navigation.navigate('PlaceAdd', { initialCoords: pendingPin });
                  setPendingPin(null);
                }}
              />
            </View>
          </View>
        ) : (
          <Button title="＋ 장소 추가하기" onPress={() => navigation.navigate('PlaceAdd')} />
        )}
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
  screenTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  titleActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  modeRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  // 가이드 매거진 카드
  magazineCard: { padding: 0, overflow: 'hidden', marginBottom: spacing.md },
  coverPhoto: { width: '100%', aspectRatio: 16 / 9 },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.togetherBg,
  },
  magazineBody: { padding: spacing.md, gap: spacing.xs },
  magazineHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  magazineName: { flex: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  magazineCategory: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  magazineRatingRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  magazineRating: { fontSize: fontSize.caption, fontWeight: '700' },
  magazineMemo: { fontSize: fontSize.body, color: colors.textPrimary, fontStyle: 'italic', marginTop: spacing.xs },
  magazineDate: { fontSize: fontSize.micro, color: colors.textSecondary, marginTop: spacing.xs },
  // 위시리스트 카드
  deleteHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
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
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  statusBadge: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  visitInfo: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  pendingHint: { fontSize: fontSize.micro, color: colors.togetherText, fontWeight: '700', marginTop: spacing.xs },
  // AI 인사이트 렌더
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
  // 지도
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
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  // 지도에서 좌표를 고른 직후 뜨는 바 — 기본 FAB 자리를 그대로 대체한다
  pendingPinBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pendingPinInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pendingPinText: { flex: 1, fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '600' },
  pendingPinActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
}));
