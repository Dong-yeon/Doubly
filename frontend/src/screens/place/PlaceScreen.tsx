/**
 * 럽슐랭 — 가이드(인증 장소 매거진)/둘러보기(전체 장소, 목록↔지도)/콘텐츠(영화·공연·드라마)를
 * 한 화면 안에서 Chip 세그먼트로 전환한다.
 *
 * <p><b>왜 "위시리스트"가 없어졌나(2026-08-24)</b>: 예전엔 위시리스트(tier===0)와 지도(전체)가
 * 분리된 모드였는데, 지도가 꺼져 있으면(카카오 키 미설정) tier===0 이면서 좌표 없는 장소가
 * 갈 곳이 없었다 — 가이드는 tier>0 만, 위시리스트는 없어졌으니 어디에도 안 뜨는 구멍이었다.
 * "둘러보기"는 인증 여부와 무관하게 전체 장소를 목록↔지도 토글로 보여줘 그 구멍을 없앤다.
 *
 * <p><b>왜 "콘텐츠"가 별개 모드인가</b>: 영화·공연·드라마는 좌표가 없는 게 정상이라
 * Place 도메인에 안 섞는다(constants/contentTypes.ts, api/content.ts 참고) — 그래서 둘러보기의
 * 지도·카테고리 필터와는 다른 자기만의 목록·타입 필터를 갖는다.
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
import { SoloPickBadge } from '../../components/SoloPickBadge';
import { LovelichelinRecommendCards } from './LovelichelinRecommendCards';
import { SoloPickSection } from './SoloPickSection';
import { SOLO_PICK_MIN_RATING, CATEGORY_FILTERS } from './placeFilters';
import { CONTENT_TYPE_FILTERS, contentTypeLabel } from '../../constants/contentTypes';
import { placeApi } from '../../api/place';
import { contentApi } from '../../api/content';
import { usePlaceStore } from '../../store/placeStore';
import { useContentStore } from '../../store/contentStore';
import { useDeleteAction } from '../../hooks/useDeleteAction';
import { isKakaoMapConfigured } from '../../constants/config';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { stars } from '../../utils/ratingStars';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type {
  Content,
  ContentType,
  DateCourse,
  LovelichelinRecommendation,
  Place,
} from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;
type Mode = 'guide' | 'browse' | 'content';
type BrowseView = 'list' | 'map';

const MODES: { value: Mode; label: string }[] = [
  { value: 'guide', label: '가이드' },
  { value: 'browse', label: '둘러보기' },
  { value: 'content', label: '콘텐츠' },
];

const BROWSE_VIEWS: { value: BrowseView; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { value: 'list', label: '목록', icon: 'format-list-bulleted' },
  { value: 'map', label: '지도', icon: 'map-outline' },
];

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
  const [browseView, setBrowseView] = useState<BrowseView>('list');

  const allPlaces = usePlaceStore((s) => s.places);
  const placeLoading = usePlaceStore((s) => s.loading);
  const placeLoadError = usePlaceStore((s) => s.loadError);
  const loadPlaces = usePlaceStore((s) => s.load);
  const invalidatePlaces = usePlaceStore((s) => s.invalidate);

  const allContents = useContentStore((s) => s.contents);
  const contentLoading = useContentStore((s) => s.loading);
  const contentLoadError = useContentStore((s) => s.loadError);
  const loadContents = useContentStore((s) => s.load);
  const invalidateContents = useContentStore((s) => s.invalidate);

  // 둘러보기(목록·지도)가 공유하는 검색·카테고리 필터 — 가이드엔 없다(등급순 정렬 하나뿐)
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // 콘텐츠 모드가 쓰는 검색·타입 필터 — 장소 쪽과 도메인이 달라 따로 둔다
  const [contentSearch, setContentSearch] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentType | 'ALL'>('ALL');

  // 지도 탭에서 빈 자리를 탭해 고른 좌표 — 확정 전까지는 "여기에 추가" 바만 뜬다
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number; address?: string | null } | null>(
    null,
  );

  /*
   * 삭제 in-flight 가드 — 이 화면엔 장소(Place)/콘텐츠(Content) 두 개의 서로 다른
   * 엔티티를 지우는 흐름이 따로 있어(가이드+둘러보기 목록 vs 콘텐츠 목록), 인스턴스를
   * 하나만 쓰면 한쪽을 지우는 동안 다른 쪽 삭제까지 막혀버린다 — 각자 따로 둔다
   * (QA_CHECKLIST.md 전역 반복 패턴 7).
   */
  const { deletingId: deletingPlaceId, runDelete: runDeletePlace } = useDeleteAction<number>();
  const { deletingId: deletingContentId, runDelete: runDeleteContent } = useDeleteAction<number>();

  useFocusEffect(
    useCallback(() => {
      loadPlaces().catch(() => {}); // 에러는 loadError 로 화면에 이미 반영된다
      loadContents().catch(() => {});
    }, [loadPlaces, loadContents]),
  );

  const guidePlaces = useMemo(
    () =>
      allPlaces
        .filter((p) => p.lovelichelinTier > 0)
        .filter((p) => categoryFilter === 'ALL' || p.category === categoryFilter)
        .sort((a, b) => {
          if (b.lovelichelinTier !== a.lovelichelinTier) return b.lovelichelinTier - a.lovelichelinTier;
          return (b.lovelichelinCertifiedAt ?? '').localeCompare(a.lovelichelinCertifiedAt ?? '');
        }),
    [allPlaces, categoryFilter],
  );

  /*
   * 솔로 픽 — 아직 둘 다 안 매겨(tier 0) 럽슐랭 인증엔 못 미치지만, 한쪽이 강력 추천(4점
   * 이상)한 곳. "혼자 간 인생 맛집"도 인정받을 방법이 있어야 한다는 결정(2026-08-24).
   *
   * categoryFilter 도 같이 건다 — 처음엔 "카테고리와 무관하게 항상 노출"로 만들었는데,
   * 카페 카테고리만 골랐는데 여행지 픽이 그대로 떠 있어 실사용에서 헷갈린다는 리포트
   * (2026-09-01). guidePlaces 와 같은 필터를 써서 "지금 보고 있는 카테고리 안에서"라는
   * 기대에 맞춘다.
   */
  const soloPicks = useMemo(
    () =>
      allPlaces
        .filter((p) => p.lovelichelinTier === 0)
        .filter((p) => categoryFilter === 'ALL' || p.category === categoryFilter)
        .filter(
          (p) =>
            (p.myRating != null && p.myRating >= SOLO_PICK_MIN_RATING && p.partnerRating == null) ||
            (p.partnerRating != null && p.partnerRating >= SOLO_PICK_MIN_RATING && p.myRating == null),
        )
        .sort((a, b) => (b.myRating ?? b.partnerRating ?? 0) - (a.myRating ?? a.partnerRating ?? 0)),
    [allPlaces, categoryFilter],
  );

  // 둘러보기 = 인증 여부와 무관하게 전체 장소. 목록·지도가 이 하나의 필터링 결과를 같이 쓴다
  // (예전엔 위시리스트=tier0/지도=전체로 갈려서, 지도가 꺼져 있으면 tier0+좌표없음 장소가
  // 갈 곳이 없었다 — 파일 상단 주석 참고).
  const browsePlaces = useMemo(
    () =>
      allPlaces
        .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
        .filter((p) => categoryFilter === 'ALL' || p.category === categoryFilter),
    [allPlaces, search, categoryFilter],
  );
  const markers = browsePlaces
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      title: p.name,
      color: colors.danger,
      tier: p.lovelichelinTier,
    }));

  const browseContents = useMemo(
    () =>
      allContents
        .filter((c) => !contentSearch.trim() || c.title.toLowerCase().includes(contentSearch.trim().toLowerCase()))
        .filter((c) => contentTypeFilter === 'ALL' || c.type === contentTypeFilter),
    [allContents, contentSearch, contentTypeFilter],
  );

  // 콘텐츠 솔로 픽 — 장소 쪽(soloPicks)과 완전히 같은 규칙. 콘텐츠 모드는 가이드/둘러보기로
  // 나뉘지 않은 단일 목록이라, 필터·검색에 걸리지 않은 목록 맨 위 가로 스크롤로 얹는다.
  const contentSoloPicks = useMemo(
    () =>
      allContents
        .filter((c) => c.lovelichelinTier === 0)
        .filter(
          (c) =>
            (c.myRating != null && c.myRating >= SOLO_PICK_MIN_RATING && c.partnerRating == null) ||
            (c.partnerRating != null && c.partnerRating >= SOLO_PICK_MIN_RATING && c.myRating == null),
        )
        .sort((a, b) => (b.myRating ?? b.partnerRating ?? 0) - (a.myRating ?? a.partnerRating ?? 0)),
    [allContents],
  );

  const onDeletePlace = (place: Place) => {
    Alert.alert('장소 삭제', `"${place.name}"을(를) 삭제할까요?\n방문 기록도 함께 삭제돼요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          runDeletePlace(place.id, async () => {
            await placeApi.remove(place.id);
            haptics.light();
            toast.success('장소를 삭제했어요.');
            invalidatePlaces();
            loadPlaces(true);
          }),
      },
    ]);
  };

  const onDeleteContent = (content: Content) => {
    Alert.alert('콘텐츠 삭제', `"${content.title}"을(를) 삭제할까요?\n관람 기록도 함께 삭제돼요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          runDeleteContent(content.id, async () => {
            await contentApi.remove(content.id);
            haptics.light();
            toast.success('콘텐츠를 삭제했어요.');
            invalidateContents();
            loadContents(true);
          }),
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
          {mode === 'browse' && browseView === 'map' ? (
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
              // 둘러보기를 벗어나면 지도에서 고르던 좌표는 의미가 없다 — 다음에 돌아왔을 때
              // 엉뚱한 위치에 "여기에 추가" 바가 떠 있지 않게 비운다.
              if (m.value !== 'browse') setPendingPin(null);
            }}
            fill
          />
        ))}
      </View>

      {mode === 'browse' ? (
        <View style={styles.browseViewRow}>
          {BROWSE_VIEWS.map((v) => (
            <TouchableOpacity
              key={v.value}
              style={[styles.browseViewBtn, browseView === v.value && styles.browseViewBtnActive]}
              onPress={() => {
                setBrowseView(v.value);
                if (v.value !== 'map') setPendingPin(null);
              }}
              accessibilityState={{ selected: browseView === v.value }}
            >
              <MaterialCommunityIcons
                name={v.icon}
                size={16}
                color={browseView === v.value ? colors.white : colors.textSecondary}
              />
              <Text style={[styles.browseViewText, browseView === v.value && styles.browseViewTextActive]}>
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {(mode === 'guide' || mode === 'browse') && allPlaces.length > 0 ? (
        <View style={styles.filterRow}>
          {CATEGORY_FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={categoryFilter === f.value}
              onPress={() => setCategoryFilter(f.value)}
            />
          ))}
        </View>
      ) : null}

      {mode === 'browse' && allPlaces.length > 0 ? (
        <View style={styles.searchWrap}>
          <TextField
            placeholder="장소 이름으로 검색"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
      ) : null}

      {mode === 'content' ? (
        <>
          {allContents.length > 0 ? (
            <>
              <View style={styles.searchWrap}>
                <TextField
                  placeholder="제목으로 검색"
                  value={contentSearch}
                  onChangeText={setContentSearch}
                  returnKeyType="search"
                />
              </View>
              <View style={styles.filterRow}>
                {CONTENT_TYPE_FILTERS.map((f) => (
                  <Chip
                    key={f.value}
                    label={f.label}
                    selected={contentTypeFilter === f.value}
                    onPress={() => setContentTypeFilter(f.value)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {mode === 'guide' ? (
        <FlatList
          data={guidePlaces}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshing={placeLoading}
          onRefresh={() => loadPlaces(true)}
          ListHeaderComponent={
            <SoloPickSection
              title="내 픽 · 상대 픽"
              subtitle="아직 둘 다 안 가봤지만, 한 명은 인정한 곳이에요"
              items={soloPicks}
              keyExtractor={(p) => String(p.id)}
              renderCard={(p) => {
                const who: 'me' | 'partner' = p.myRating != null ? 'me' : 'partner';
                const rating = p.myRating ?? p.partnerRating ?? 0;
                return (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('PlaceDetail', { placeId: p.id, name: p.name })}
                  >
                    <Card elevation="sm" style={styles.soloPickCard}>
                      <SoloPickBadge who={who} size="sm" />
                      <Text style={styles.soloPickName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={[styles.soloPickStars, { color: who === 'me' ? colors.me : colors.partner }]}>
                        {stars(rating)}
                      </Text>
                    </Card>
                  </TouchableOpacity>
                );
              }}
            />
          }
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
            !placeLoading ? (
              placeLoadError ? (
                <EmptyState
                  icon="cloud-off-outline"
                  title="가이드를 불러오지 못했어요"
                  description="네트워크 상태를 확인하고 다시 시도해주세요."
                  error
                  onRetry={() => loadPlaces()}
                />
              ) : allPlaces.some((p) => p.lovelichelinTier > 0) ? (
                <EmptyState icon="crown" title="조건에 맞는 장소가 없어요" description="카테고리 필터를 바꿔보세요." />
              ) : (
                <EmptyState
                  icon="crown"
                  title="아직 럽슐랭으로 인증된 장소가 없어요"
                  description="둘러보기에 담은 곳을 다녀온 뒤, 둘 다 평점을 매기면 등급이 매겨져요!"
                />
              )
            ) : null
          }
        />
      ) : null}

      {mode === 'browse' && browseView === 'list' ? (
        <FlatList
          data={browsePlaces}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshing={placeLoading}
          onRefresh={() => loadPlaces(true)}
          ListHeaderComponent={
            browsePlaces.length > 0 ? <Text style={styles.deleteHint}>카드를 길게 눌러 삭제할 수 있어요</Text> : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, deletingPlaceId === item.id && styles.cardDeleting]}
              activeOpacity={0.7}
              disabled={deletingPlaceId === item.id}
              onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
              onLongPress={() => onDeletePlace(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.name}>{item.name}</Text>
                {item.lovelichelinTier > 0 ? <LovelichelinBadge tier={item.lovelichelinTier} size="sm" /> : null}
                {item.category ? (
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                ) : null}
                {item.lovelichelinTier === 0 &&
                ((item.myRating != null && item.myRating >= SOLO_PICK_MIN_RATING && item.partnerRating == null) ||
                  (item.partnerRating != null && item.partnerRating >= SOLO_PICK_MIN_RATING && item.myRating == null)) ? (
                  <SoloPickBadge who={item.myRating != null ? 'me' : 'partner'} size="sm" />
                ) : null}
                {item.tripId != null ? (
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryText}>✈️ 여행에 담김</Text>
                  </View>
                ) : null}
              </View>
              {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
              <View style={styles.cardFooter}>
                {item.visitCount > 0 ? (
                  <Text style={styles.visitInfo}>
                    {item.avgRating ? `${item.avgRating.toFixed(1)} · ` : ''}방문 {item.visitCount}회
                    {item.lastVisitedAt ? ` · 최근 ${item.lastVisitedAt}` : ''}
                  </Text>
                ) : null}
              </View>
              {item.lovelichelinTier === 0 && (item.myRating != null || item.partnerRating != null) ? (
                <Text style={styles.pendingHint}>
                  {item.myRating != null && item.partnerRating != null
                    ? '럽슐랭 탈락 — 재평가하면 다시 등급이 매겨져요'
                    : `${item.myRating != null ? '내' : '상대'} 평점만 매겨졌어요 — 나머지 한 명의 평가를 기다리는 중`}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !placeLoading ? (
              placeLoadError ? (
                <EmptyState
                  icon="cloud-off-outline"
                  title="장소를 불러오지 못했어요"
                  description="네트워크 상태를 확인하고 다시 시도해주세요."
                  error
                  onRetry={() => loadPlaces()}
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

      {mode === 'browse' && browseView === 'map' ? (
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
                const place = browsePlaces.find((p) => p.id === id);
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

      {mode === 'content' ? (
        <FlatList
          data={browseContents}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={styles.list}
          refreshing={contentLoading}
          onRefresh={() => loadContents(true)}
          ListHeaderComponent={
            <View>
              <SoloPickSection
                title="내 픽 · 상대 픽"
                subtitle="아직 둘 다 안 봤지만, 한 명은 인정한 콘텐츠예요"
                items={contentSoloPicks}
                keyExtractor={(c) => String(c.id)}
                renderCard={(c) => {
                  const who: 'me' | 'partner' = c.myRating != null ? 'me' : 'partner';
                  const rating = c.myRating ?? c.partnerRating ?? 0;
                  return (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('ContentDetail', { contentId: c.id, title: c.title })}
                    >
                      <Card elevation="sm" style={styles.soloPickCard}>
                        <SoloPickBadge who={who} size="sm" />
                        <Text style={styles.soloPickName} numberOfLines={1}>
                          {c.title}
                        </Text>
                        <Text style={[styles.soloPickStars, { color: who === 'me' ? colors.me : colors.partner }]}>
                          {stars(rating)}
                        </Text>
                      </Card>
                    </TouchableOpacity>
                  );
                }}
              />
              {browseContents.length > 0 ? (
                <Text style={styles.deleteHint}>카드를 길게 눌러 삭제할 수 있어요</Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, styles.contentCard, deletingContentId === item.id && styles.cardDeleting]}
              activeOpacity={0.7}
              disabled={deletingContentId === item.id}
              onPress={() => navigation.navigate('ContentDetail', { contentId: item.id, title: item.title })}
              onLongPress={() => onDeleteContent(item)}
            >
              {item.posterUrl ? (
                <Image source={{ uri: item.posterUrl }} style={styles.contentPoster} resizeMode="cover" />
              ) : null}
              <View style={styles.flex}>
                <View style={styles.cardHeader}>
                  <Text style={styles.name}>{item.title}</Text>
                  {item.lovelichelinTier > 0 ? <LovelichelinBadge tier={item.lovelichelinTier} size="sm" /> : null}
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryText}>{contentTypeLabel(item.type)}</Text>
                  </View>
                  {item.lovelichelinTier === 0 &&
                  ((item.myRating != null && item.myRating >= SOLO_PICK_MIN_RATING && item.partnerRating == null) ||
                    (item.partnerRating != null && item.partnerRating >= SOLO_PICK_MIN_RATING && item.myRating == null)) ? (
                    <SoloPickBadge who={item.myRating != null ? 'me' : 'partner'} size="sm" />
                  ) : null}
                </View>
                <View style={styles.cardFooter}>
                  {item.logCount > 0 ? (
                    <Text style={styles.visitInfo}>
                      {item.avgRating ? `${item.avgRating.toFixed(1)} · ` : ''}관람 {item.logCount}회
                      {item.lastWatchedAt ? ` · 최근 ${item.lastWatchedAt}` : ''}
                    </Text>
                  ) : null}
                </View>
                {item.lovelichelinTier === 0 && (item.myRating != null || item.partnerRating != null) ? (
                  <Text style={styles.pendingHint}>
                    {item.myRating != null && item.partnerRating != null
                      ? '럽슐랭 탈락 — 재평가하면 다시 등급이 매겨져요'
                      : `${item.myRating != null ? '내' : '상대'} 평점만 매겨졌어요 — 나머지 한 명의 평가를 기다리는 중`}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !contentLoading ? (
              contentLoadError ? (
                <EmptyState
                  icon="cloud-off-outline"
                  title="콘텐츠를 불러오지 못했어요"
                  description="네트워크 상태를 확인하고 다시 시도해주세요."
                  error
                  onRetry={() => loadContents()}
                />
              ) : allContents.length > 0 ? (
                <EmptyState icon="movie-open-outline" title="조건에 맞는 콘텐츠가 없어요" description="검색어나 필터를 바꿔보세요." />
              ) : (
                <EmptyState
                  icon="movie-open-outline"
                  title="아직 저장한 콘텐츠가 없어요"
                  description="함께 보고 싶은 영화·공연·드라마를 추가해보세요! (카드를 길게 눌러 삭제)"
                />
              )
            ) : null
          }
        />
      ) : null}

      <View style={styles.fabWrap}>
        {mode === 'browse' && browseView === 'map' && pendingPin ? (
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
        ) : mode === 'content' ? (
          <Button title="＋ 콘텐츠 추가하기" onPress={() => navigation.navigate('ContentAdd')} />
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
  // 둘러보기 안의 목록↔지도 서브 토글 — 모드 칩보다 한 단 작게, 필터 줄과 같은 위치에 둔다
  browseViewRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  browseViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  browseViewBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  browseViewText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  browseViewTextActive: { color: colors.white },
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
  // 내 픽 · 상대 픽 (솔로 트랙) 카드 — 섹션 레이아웃 자체는 SoloPickSection 이 맡는다
  soloPickCard: { width: 140, gap: spacing.xs },
  soloPickName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  soloPickStars: { fontSize: fontSize.caption, fontWeight: '700' },
  // 둘러보기·콘텐츠 목록 카드
  deleteHint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // 삭제 진행 중 표시 — useDeleteAction, 장소·콘텐츠 카드 공용 (QA_CHECKLIST.md 전역 반복 패턴 7)
  cardDeleting: { opacity: 0.5 },
  // 콘텐츠 카드만 포스터가 왼쪽에 붙는 가로 레이아웃 — 장소 카드는 그대로 세로 하나
  contentCard: { flexDirection: 'row', gap: spacing.sm },
  contentPoster: { width: 52, height: 74, borderRadius: radius.sm },
  flex: { flex: 1 },
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
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
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
