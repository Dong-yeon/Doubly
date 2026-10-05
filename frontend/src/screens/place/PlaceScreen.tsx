/**
 * 럽슐랭 — 장소(지도 + 하단 시트) / 콘텐츠(영화·공연·드라마) 두 모드.
 *
 * <p><b>왜 장소 모드의 첫 화면이 지도인가(2026-10-05)</b>: 장소는 "어디"가 본질인데 첫 화면이 목록이라 지도는 제목 줄
 * 아이콘 뒤에 숨어 있었고, 지도로 넘기면 목록이 사라졌다. 지도 앱들(네이버·카카오)처럼 지도를 바닥에 깔고 목록을
 * 하단 시트로 올리면 둘을 동시에 본다 — 핀을 누르면 시트가 그 한 곳의 카드가 되고, 끌어올리면 다시 목록이다.
 * 목록↔지도 토글은 없앴다. 결정 기록: docs/LOVELICHELIN_MAP_FIRST_2026-10-05.md.
 *
 * <p>지도를 쓸 수 없으면(카카오 키 없음·SDK/도메인 실패) 예전 목록 화면으로 물러선다 — 같은 카드·같은 필터다.
 *
 * <p><b>목록은 하나다(2026-09-14)</b>: 예전 "가이드"(인증만)와 "둘러보기"(전체)는 같은 장소들의 부분집합이라 한
 * 목록으로 합치고 정렬이 그 역할을 맡는다 — <b>인증 등급 → 솔로 픽 → 최근 방문 → 등록</b>(placeFilters.ts).
 * 분석: docs/LOVELICHELIN_UX_REANALYSIS_2026-09-14.md 3-2 · 5-4.
 *
 * <p><b>필터는 장소 수와 상관없이 늘 보인다</b>(2026-10-05): 예전엔 8곳 이상일 때만 나타났는데(FILTER_MIN_PLACES),
 * 지도가 첫 화면이 되자 검색창이 곧 "장소 찾기"의 입구라 0곳일 때가 가장 필요하다.
 *
 * <p><b>왜 "콘텐츠"가 별개 모드인가</b>: 영화·공연·드라마는 좌표가 없는 게 정상이라
 * Place 도메인에 안 섞는다(constants/contentTypes.ts, api/content.ts 참고) — 그래서 장소 쪽의
 * 지도·카테고리 필터와는 다른 자기만의 목록·타입 필터를 갖는다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { PlaceStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { IconButton } from '../../components/IconButton';
import { KakaoMap } from '../../components/KakaoMap';
import type { KakaoMapHandle } from '../../components/KakaoMap.types';
import { MaterialCommunityIcons } from '../../components/Icon';
import { TextField } from '../../components/TextField';
import { AiInsightButton } from '../../components/AiInsightButton';
import { LovelichelinBadge } from '../../components/LovelichelinBadge';
import { SoloPickBadge } from '../../components/SoloPickBadge';
import { LovelichelinRecommendCards } from './LovelichelinRecommendCards';
import {
  isSoloPick,
  CATEGORY_FILTERS,
  EMPTY_PLACE_FILTER,
  filterAndSortPlaces,
  isPlaceFilterActive,
  type PlaceFilterState,
} from './placeFilters';
import { MapSheet, sheetTops, type SheetSnap } from './MapSheet';
import { PlaceListCard, hasNoLocation, ratingHint } from './PlaceListCard';
import { PlacePinCard } from './PlacePinCard';
import { CONTENT_TYPE_FILTERS, contentTypeLabel } from '../../constants/contentTypes';
import { placeApi } from '../../api/place';
import { contentApi } from '../../api/content';
import { usePlaceStore } from '../../store/placeStore';
import { useContentStore } from '../../store/contentStore';
import { useRelationStore } from '../../store/relationStore';
import { useDeleteAction } from '../../hooks/useDeleteAction';
import { isKakaoMapConfigured } from '../../constants/config';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { buildPlacePinIcons, type KakaoMapMarker } from '../../utils/kakaoMapHtml';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Content, ContentType, DateCourse, LovelichelinRecommendation, Place } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { onColor } from '../../theme/onColor';
import { layout } from '../../theme/layout';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;
type Mode = 'places' | 'content';

const MODES: { value: Mode; label: string }[] = [
  { value: 'places', label: '장소' },
  { value: 'content', label: '콘텐츠' },
];

/*
 * AI 두 기능이 결과를 낼 수 있는 최소 재료 — 서버 판정과 같은 값이어야 한다
 * (LovelichelinRecommendService.MIN_CERTIFIED_PLACES, DateCourseService.MIN_PLACES).
 * 서버도 모자라면 이유를 담은 빈 응답을 주지만, 그걸 들으려면 모달을 열고 AI 작업
 * 폴링이 한 바퀴 돌아야 한다 — 화면이 이미 아는 숫자라 누르기 전에 말해준다.
 */
const MIN_CERTIFIED_FOR_RECOMMEND = 1;
const MIN_PLACES_FOR_DATE_COURSE = 2;

/** 시트 미리보기에서 목록이 보이는 몫 — 카드 반 장 */
const PEEK_LIST_PEEK = 84;
/** 시트 손잡이 + 제목 줄 — 미리보기 높이의 고정 몫. AI 버튼 줄은 미리보기에서 접는다(아래 sheetHeader) */
const SHEET_HANDLE = 28;
const SHEET_TITLE_ROW = layout.touchTarget + spacing.sm;
/** 미리보기가 지도 영역을 이 비율 넘게 덮지 않는다 — 작은 화면에서 지도가 사라지지 않게 */
const PEEK_MAX_RATIO = 0.62;

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

/** 핀 모양 — 등극 > 다녀옴 > 안 가봄. kakaoMapHtml.buildPlacePinIcons 의 키 */
function pinKind(p: Place): 'certified' | 'visited' | 'wish' {
  if (p.lovelichelinTier > 0) return 'certified';
  return p.visitCount > 0 ? 'visited' : 'wish';
}

export function PlaceScreen() {
  const navigation = useNavigation<Nav>();
  const [mode, setMode] = useState<Mode>('places');

  // 대기·의견 갈림 문구에 상대 이름을 쓴다 — "나머지 한 명" 보다 짧고 누구 차례인지가 분명하다
  const partnerName = useRelationStore((s) => s.couple?.partner?.name ?? null);

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

  // 지도·시트(·물러선 목록)가 공유하는 필터 하나
  const [filter, setFilter] = useState<PlaceFilterState>(EMPTY_PLACE_FILTER);
  const patchFilter = (patch: Partial<PlaceFilterState>) => setFilter((f) => ({ ...f, ...patch }));

  // 콘텐츠 모드가 쓰는 검색·타입 필터 — 장소 쪽과 도메인이 달라 따로 둔다
  const [contentSearch, setContentSearch] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentType | 'ALL'>('ALL');

  // 지도 빈 자리를 탭해 고른 좌표 — 확정 전까지는 시트에 "여기에 추가" 바만 뜬다
  const [pendingPin, setPendingPin] = useState<{ lat: number; lng: number; address?: string | null } | null>(null);
  // 지도에서 고른 핀(우리 장소) — 시트가 그 한 곳의 카드가 된다
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [snap, setSnap] = useState<SheetSnap>('half');

  // 지도를 못 쓰면(키 없음·로드 실패) 목록 화면으로 물러선다. 실패는 한 번 나면 이 화면 동안 유지한다
  const [mapFailed, setMapFailed] = useState(false);
  const mapAvailable = isKakaoMapConfigured() && !mapFailed;
  const mapRef = useRef<KakaoMapHandle>(null);

  // 지도 영역·위 덮개(검색창·칩)·시트 머리 높이 — 시트 단 높이와 지도 시야 여백을 정한다
  const [areaHeight, setAreaHeight] = useState(0);
  const [overlayHeight, setOverlayHeight] = useState(0);
  const [pinCardHeight, setPinCardHeight] = useState(0);

  /*
   * 삭제 in-flight 가드 — 이 화면엔 장소(Place)/콘텐츠(Content) 두 개의 서로 다른
   * 엔티티를 지우는 흐름이 따로 있어, 인스턴스를 하나만 쓰면 한쪽을 지우는 동안
   * 다른 쪽 삭제까지 막혀버린다 — 각자 따로 둔다(QA_CHECKLIST.md 전역 반복 패턴 7).
   */
  const { deletingId: deletingPlaceId, runDelete: runDeletePlace } = useDeleteAction<number>();
  const { deletingId: deletingContentId, runDelete: runDeleteContent } = useDeleteAction<number>();

  useFocusEffect(
    useCallback(() => {
      loadPlaces().catch(() => {}); // 에러는 loadError 로 화면에 이미 반영된다
      loadContents().catch(() => {});
      /*
       * 지도 실패는 이 화면에 다시 들어올 때 한 번 더 시도한다. 실패 판정의 하나가 "6초 안에 타일이 안 그려짐"이라
       * 첫 진입 중 앱이 뒤로 갔거나 망이 잠깐 끊긴 것만으로도 목록으로 물러선다 — 그대로 굳히면 지도를 영영 못 본다.
       */
      setMapFailed(false);
    }, [loadPlaces, loadContents]),
  );

  // 인증(tier>0) 장소 수 — AI 맛집 추천이 결과를 낼 수 있는지. 필터와 무관하게 전체에서 센다
  const certifiedCount = useMemo(() => allPlaces.filter((p) => p.lovelichelinTier > 0).length, [allPlaces]);

  const sortedPlaces = useMemo(() => filterAndSortPlaces(allPlaces, filter), [allPlaces, filter]);

  // 콘텐츠도 장소와 같은 순서 규칙을 쓴다 — 인증 → 솔로 픽 → 최근 관람 → 등록
  const browseContents = useMemo(
    () =>
      allContents
        .filter((c) => !contentSearch.trim() || c.title.toLowerCase().includes(contentSearch.trim().toLowerCase()))
        .filter((c) => contentTypeFilter === 'ALL' || c.type === contentTypeFilter)
        .sort((a, b) => {
          if (b.lovelichelinTier !== a.lovelichelinTier) return b.lovelichelinTier - a.lovelichelinTier;
          const pick = Number(isSoloPick(b)) - Number(isSoloPick(a));
          if (pick !== 0) return pick;
          const watched = (b.lastWatchedAt ?? '').localeCompare(a.lastWatchedAt ?? '');
          if (watched !== 0) return watched;
          return b.id - a.id;
        }),
    [allContents, contentSearch, contentTypeFilter],
  );
  // 걸러진 것 중 좌표가 없어 지도에 못 꽂는 곳 — 지도 위 안내 "지도에 없는 N곳"
  const unmappedCount = useMemo(() => sortedPlaces.filter(hasNoLocation).length, [sortedPlaces]);
  // 고른 핀이 필터에 걸려 사라지거나 지워졌으면 고르지 않은 것으로 본다(상태를 지우지 않고 파생한다)
  const selectedPlace = selectedId != null ? (sortedPlaces.find((p) => p.id === selectedId) ?? null) : null;

  // 핀 이미지 — 테마 색이 바뀔 때만 다시 그린다(다크 모드에서도 지도 타일은 밝아 색은 그대로 쓴다)
  const pinIcons = useMemo(
    () => buildPlacePinIcons({ gold: colors.lovelichelinGold, visited: colors.danger, search: colors.textPrimary }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors.lovelichelinGold, colors.danger, colors.textPrimary],
  );

  // 지도도 시트와 같은 결과를 쓴다 — 시트에서 '카페'만 보면 지도에도 카페만 찍힌다
  const markers = useMemo<KakaoMapMarker[]>(
    () =>
      sortedPlaces
        .filter((p) => !hasNoLocation(p))
        .map((p) => ({
          id: p.id,
          lat: p.lat as number,
          lng: p.lng as number,
          title: p.name,
          icon: pinKind(p),
          selected: p.id === selectedPlace?.id,
        })),
    [sortedPlaces, selectedPlace?.id],
  );

  // ---- 시트 단 높이 ----
  const showSheetCard = selectedPlace != null || pendingPin != null;
  const fullTop = overlayHeight + spacing.sm;
  /*
   * 미리보기 높이 = 손잡이 + 제목 줄 + (카드 한 장 | 목록 반 장). 머리의 AI 버튼 줄은 미리보기에서 접는다 —
   * 넣어 두면 375×667 에서 미리보기와 절반이 37px 차이밖에 안 나 세 단이 갈리지 않았다(2026-10-05 웹 실측).
   */
  const peekHeight = useMemo(() => {
    const body = showSheetCard ? pinCardHeight + spacing.md : PEEK_LIST_PEEK;
    return Math.min(SHEET_HANDLE + SHEET_TITLE_ROW + body, Math.round(areaHeight * PEEK_MAX_RATIO));
  }, [showSheetCard, pinCardHeight, areaHeight]);
  const tops = useMemo(() => sheetTops(areaHeight, fullTop, peekHeight), [areaHeight, fullTop, peekHeight]);

  // 지도 시야 여백 — 위는 검색창·칩, 아래는 시트가 덮는 몫. 그래야 "모두 보이게 맞추기"가 가린 핀을 안 만든다
  useEffect(() => {
    if (!areaHeight) return;
    mapRef.current?.setPadding({ top: overlayHeight + 24, bottom: Math.max(40, areaHeight - tops[snap] + 24) });
  }, [areaHeight, overlayHeight, tops, snap]);

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

  const openDetail = (p: Place, extra?: { openVisit?: boolean }) =>
    navigation.navigate('PlaceDetail', { placeId: p.id, name: p.name, ...extra });
  // 위치 없음 → 수정 화면의 위치 칸으로(지도 탭으로 좌표를 고른다)
  const fixLocation = (p: Place) => navigation.navigate('PlaceAdd', { place: p, focusLocation: true });

  // 핀 탭 → 그 한 곳의 카드를 미리보기 높이로. 핀은 시트에 가리지 않게 보이는 영역 가운데로 옮긴다
  const onMarkerPress = (id: number) => {
    const p = sortedPlaces.find((x) => x.id === id);
    if (!p) return;
    setPendingPin(null);
    mapRef.current?.clearPin();
    setSelectedId(id);
    setSnap('peek');
    if (p.lat != null && p.lng != null && areaHeight) {
      const visibleCenter = (overlayHeight + tops.peek) / 2;
      mapRef.current?.panTo(p.lat, p.lng, Math.round(areaHeight / 2 - visibleCenter));
    }
  };

  // 지도 빈 곳 탭 — 고른 핀이 있으면 먼저 고름만 푼다(지도 앱의 "빈 곳 탭 = 닫기"), 없으면 그 자리에 추가할지 묻는다
  const onMapSelect = (pos: { lat: number; lng: number; address?: string | null }) => {
    if (selectedPlace) {
      setSelectedId(null);
      mapRef.current?.clearPin();
      return;
    }
    setPendingPin(pos);
    setSnap('peek');
  };

  const clearSheetCard = () => {
    setSelectedId(null);
    setPendingPin(null);
    mapRef.current?.clearPin();
  };

  const placeCount = allPlaces.length;
  const searchPlaceholder = placeCount === 0 ? '가보고 싶은 곳을 찾아보세요' : '우리 장소 이름·주소로 찾기';

  // ---- 필터 줄(지도 위 덮개 · 물러선 목록 공용) ----
  const renderPlaceFilters = (overMap: boolean) => (
    <>
      <View style={overMap ? styles.searchOverMap : styles.searchWrap}>
        <TextField
          placeholder={searchPlaceholder}
          value={filter.search}
          onChangeText={(t) => patchFilter({ search: t })}
          returnKeyType="search"
          accessibilityLabel="장소 찾기"
          style={overMap ? styles.searchInputOverMap : undefined}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={overMap ? styles.filterRowOverMap : styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          label="럽슐랭 인증"
          selected={filter.certifiedOnly}
          onPress={() => patchFilter({ certifiedOnly: !filter.certifiedOnly })}
        />
        <Chip
          label="아직 안 가본 곳"
          selected={filter.unvisitedOnly}
          onPress={() => patchFilter({ unvisitedOnly: !filter.unvisitedOnly })}
        />
        {CATEGORY_FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            selected={filter.category === f.value}
            onPress={() => patchFilter({ category: f.value })}
          />
        ))}
      </ScrollView>
    </>
  );

  const aiButtons = (
    <View style={styles.aiRow}>
      <AiInsightButton
        label="AI 맛집 추천"
        title="럽슐랭 취향 맞춤 추천"
        fetcher={placeApi.lovelichelinRecommend}
        render={renderRecommendation}
        style={styles.aiBtn}
        disabledReason={
          certifiedCount < MIN_CERTIFIED_FOR_RECOMMEND
            ? '둘 다 평점을 매긴 곳이 한 곳이라도 있어야 취향을 읽을 수 있어요. 다녀온 곳에 별점을 남겨보세요!'
            : undefined
        }
      />
      <AiInsightButton
        label="AI 데이트 코스"
        title="AI 데이트 코스"
        fetcher={placeApi.dateCourse}
        render={renderDateCourse}
        style={styles.aiBtn}
        disabledReason={
          placeCount < MIN_PLACES_FOR_DATE_COURSE
            ? `코스를 짜려면 저장한 장소가 ${MIN_PLACES_FOR_DATE_COURSE}곳 이상이어야 해요. 가고 싶은 곳을 먼저 담아보세요!`
            : undefined
        }
      />
    </View>
  );

  const renderPlaceCard = (item: Place, inSheet: boolean) => (
    <PlaceListCard
      item={item}
      partnerName={partnerName}
      deleting={deletingPlaceId === item.id}
      onPress={() => openDetail(item)}
      onLongPress={() => onDeletePlace(item)}
      onFixLocation={inSheet ? () => fixLocation(item) : undefined}
    />
  );

  const placeEmpty = !placeLoading ? (
    placeLoadError ? (
      <EmptyState
        icon="cloud-off-outline"
        title="장소를 불러오지 못했어요"
        description="네트워크 상태를 확인하고 다시 시도해주세요."
        error
        onRetry={() => loadPlaces()}
      />
    ) : placeCount > 0 ? (
      <EmptyState icon="map-marker-outline" title="조건에 맞는 장소가 없어요" description="검색어나 필터를 바꿔보세요." />
    ) : (
      /*
        절차(담기 → 다녀오기 → 둘 다 평점)를 앱 내부 어휘로 설명하던 자리다.
        처음 온 사람이 할 일은 하나뿐이라 하나만 말한다.
      */
      <EmptyState
        icon="map-marker-outline"
        title="둘이 가고 싶은 곳을 먼저 담아보세요"
        description="다녀오면 별점을 매기고, 둘 다 좋았던 곳이 우리 럽슐랭이 돼요."
      />
    )
  ) : null;

  // ---- 장소 · 지도 + 시트 ----
  const sheetHeader = showSheetCard ? (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetTitleRow}>
        <Text style={styles.sheetTitle} numberOfLines={1}>
          {pendingPin ? '여기에 장소 추가' : '고른 장소'}
        </Text>
        <IconButton icon="close" label="목록으로 돌아가기" onPress={clearSheetCard} />
      </View>
    </View>
  ) : (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetTitleRow}>
        <Text style={styles.sheetTitle} numberOfLines={1}>
          {isPlaceFilterActive(filter) ? `${sortedPlaces.length}곳` : `우리 장소 ${placeCount}곳`}
        </Text>
        {/* 하단 고정 [장소 추가하기]를 여기로 옮겼다 — 시트와 겹치지 않는다(2026-10-05 결정) */}
        <Button
          title="직접 추가"
          size="sm"
          variant="secondary"
          leftIcon={<MaterialCommunityIcons name="plus" size={16} color={colors.textPrimary} />}
          onPress={() => navigation.navigate('PlaceAdd')}
        />
      </View>
      {snap !== 'peek' ? aiButtons : null}
    </View>
  );

  const sheetBody = pendingPin ? (
    <View style={styles.pendingPinBar} onLayout={(e) => setPinCardHeight(e.nativeEvent.layout.height)}>
      <View style={styles.pendingPinInfo}>
        <MaterialCommunityIcons name="map-marker" size={18} color={colors.primary} />
        <Text style={styles.pendingPinText} numberOfLines={2}>
          {pendingPin.address ?? `${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}`}
        </Text>
      </View>
      <Button
        title="여기에 추가"
        size="sm"
        onPress={() => {
          navigation.navigate('PlaceAdd', { initialCoords: pendingPin });
          clearSheetCard();
        }}
      />
    </View>
  ) : selectedPlace ? (
    <View onLayout={(e) => setPinCardHeight(e.nativeEvent.layout.height)}>
      <PlacePinCard
        place={selectedPlace}
        partnerName={partnerName}
        onOpen={() => openDetail(selectedPlace)}
        onVisit={() => openDetail(selectedPlace, { openVisit: true })}
      />
    </View>
  ) : (
    <FlatList
      data={sortedPlaces}
      keyExtractor={(p) => String(p.id)}
      contentContainerStyle={styles.sheetList}
      refreshing={placeLoading}
      onRefresh={() => loadPlaces(true)}
      renderItem={({ item }) => renderPlaceCard(item, true)}
      ListEmptyComponent={
        // 장소 0곳 — 시트에는 짧은 안내만. 할 일(검색)은 위 검색창이 말한다
        placeCount === 0 && !placeLoading && !placeLoadError ? (
          <Text style={styles.sheetEmpty}>
            위에서 가보고 싶은 곳을 찾아 담거나, 지도 빈 곳을 눌러 직접 추가해보세요.{'\n'}
            다녀와서 둘 다 별점을 남기면 우리 럽슐랭이 돼요.
          </Text>
        ) : (
          placeEmpty
        )
      }
    />
  );

  const mapScreen = (
    <View style={styles.mapArea} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
      {/*
        지도는 영역을 잰 뒤가 아니라 <b>바로</b> 그린다(style 로 꽉 채운다) — 재는 걸 기다리면 SDK 로드가 그만큼 늦고,
        웹은 화면이 가려진 동안 크기 이벤트가 안 와 지도가 아예 안 떴다(2026-10-05 웹 확인).
      */}
      <KakaoMap
        ref={mapRef}
        markers={markers}
        icons={pinIcons}
        style={styles.fullMap}
        selectable
        onSelect={onMapSelect}
        onMarkerPress={onMarkerPress}
        onFailed={() => setMapFailed(true)}
      />
      {/* 지도 위 덮개 — 검색창 + 필터 칩 + 지도에 없는 N곳 안내. 시트 "전체" 높이의 위 끝이 이 아래다 */}
      <View
        style={styles.overlay}
        pointerEvents="box-none"
        onLayout={(e) => setOverlayHeight(e.nativeEvent.layout.height)}
      >
        {renderPlaceFilters(true)}
        {unmappedCount > 0 ? (
          <Pressable
            style={styles.unmapped}
            onPress={() => setSnap('half')}
            accessibilityRole="button"
            accessibilityLabel={`지도에 없는 ${unmappedCount}곳 — 목록에서 위치를 정해요`}
          >
            <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.unmappedText}>지도에 없는 {unmappedCount}곳 · 목록에서 위치를 정해요</Text>
          </Pressable>
        ) : null}
      </View>
      <MapSheet
        containerHeight={areaHeight}
        fullTop={fullTop}
        peekHeight={peekHeight}
        snap={snap}
        onSnapChange={setSnap}
        header={sheetHeader}
      >
        {sheetBody}
      </MapSheet>
    </View>
  );

  // ---- 장소 · 지도를 못 쓸 때의 목록(예전 화면) ----
  const fallbackList = (
    <>
      {renderPlaceFilters(false)}
      <FlatList
        data={sortedPlaces}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        refreshing={placeLoading}
        onRefresh={() => loadPlaces(true)}
        ListHeaderComponent={aiButtons}
        /*
         * 카드 두 종류가 한 목록에 섞인다 — 인증된 곳은 커버 사진이 있는 매거진 카드,
         * 나머지는 한 줄짜리 일반 카드. 정렬이 등급 우선이라 매거진 카드가 위에 모인다.
         */
        renderItem={({ item }) => renderPlaceCard(item, false)}
        ListEmptyComponent={placeEmpty}
      />
    </>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>럽슐랭</Text>
        {/* 여행(Trip)은 홈 스택으로 이관 — 진입은 홈 D-day 카드·커플 캘린더 (navigation/types.ts 참고) */}
      </View>

      {/*
        모드는 필터가 아니라 내비게이션이다 — 칩 둘(fill)로 그리면 아래 카테고리 칩의 선택 상태와
        같은 옷이라 무엇이 모드이고 무엇이 필터인지 갈리지 않았다. 밑줄 탭 한 줄로 그린다(§7-3 3번).
      */}
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = mode === m.value;
          return (
            <Pressable
              key={m.value}
              onPress={() => {
                setMode(m.value);
                if (m.value !== 'places') clearSheetCard();
              }}
              style={[styles.modeTab, active && styles.modeTabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {mode === 'places' ? (mapAvailable ? mapScreen : fallbackList) : null}

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
              <View style={styles.contentFilterRow}>
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
          <FlatList
            data={browseContents}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={styles.list}
            refreshing={contentLoading}
            onRefresh={() => loadContents(true)}
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
                    {item.lovelichelinTier === 0 && isSoloPick(item) ? (
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
                    <Text style={styles.pendingHint}>{ratingHint(item, partnerName)}</Text>
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
                    description="둘이 함께 보고 싶은 영화·공연·드라마를 담아보세요."
                  />
                )
              ) : null
            }
          />
        </>
      ) : null}

      {/* 하단 고정 버튼 — 콘텐츠와, 지도를 못 쓸 때의 장소 목록에만. 지도 화면에서는 시트 머리 [직접 추가] */}
      {mode === 'content' || !mapAvailable ? (
        <View style={styles.fabWrap}>
          <Button
            title={mode === 'content' ? '콘텐츠 추가하기' : '장소 추가하기'}
            leftIcon={<MaterialCommunityIcons name="plus" size={20} color={onColor(colors.primaryFill)} />}
            onPress={() => navigation.navigate(mode === 'content' ? 'ContentAdd' : 'PlaceAdd')}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  screenTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  // 모드 탭 — 밑줄 한 줄. 선택은 글자색 + 2px 밑줄이고 알약을 쓰지 않는다
  modeRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modeTab: {
    paddingVertical: spacing.sm,
    minHeight: layout.touchTarget,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
  },
  modeTabActive: { borderBottomColor: colors.textPrimary },
  modeText: { fontSize: fontSize.subtitle, fontWeight: '600', color: colors.textSecondary },
  modeTextActive: { color: colors.textPrimary, fontWeight: '800' },
  // AI 인사이트 둘 — 시트 머리(지도) / 목록 머리(물러선 목록)
  aiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  aiBtn: { flex: 1 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  /*
   * flexGrow/flexShrink 를 직접 끈다. RN 의 horizontal ScrollView 기본 스타일이
   * `{ flexGrow: 1, flexShrink: 1 }` 이라, 칩 줄이 아래 목록과 세로 공간을 나눠 갖는 형제가 되어
   * 목록이 넘치면 칩 줄까지 줄어들어 44pt 칩이 잘렸다(iOS 실기기). 가로 스크롤이라 세로는 내용 높이 그대로.
   */
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  contentFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  // ---- 지도 화면 ----
  mapArea: { flex: 1 },
  // 지도는 영역을 꽉 채운다 — 카드형 지도의 테두리·모서리는 끈다
  fullMap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, height: '100%', borderRadius: 0, borderWidth: 0 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: spacing.sm },
  /*
   * 지도 위 검색창 — TextField 의 아래 여백(md)을 되돌려 칩 줄과 붙인다. 지도 위라 면을 surface 로 띄우고
   * 그림자를 준다(기본 surfaceAlt 는 지도 타일과 섞인다). 높이 46 — 지도를 덜 가린다.
   */
  searchOverMap: { marginHorizontal: spacing.lg, marginBottom: -(spacing.md - spacing.xs) },
  searchInputOverMap: {
    height: 46,
    fontSize: fontSize.body,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  filterRowOverMap: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  unmapped: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: spacing.lg,
    marginTop: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unmappedText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  // 시트 머리 — 제목 줄 + AI 버튼
  sheetHeader: { paddingHorizontal: spacing.lg },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: layout.touchTarget,
    marginBottom: spacing.sm,
  },
  sheetTitle: { flexShrink: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  sheetList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sheetEmpty: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    lineHeight: 22,
    paddingVertical: spacing.md,
  },
  // 콘텐츠 목록 카드
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // 삭제 진행 중 표시 — useDeleteAction (QA_CHECKLIST.md 전역 반복 패턴 7)
  cardDeleting: { opacity: 0.5 },
  contentCard: { flexDirection: 'row', gap: spacing.sm },
  contentPoster: { width: 52, height: 74, borderRadius: radius.sm },
  flex: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  visitInfo: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
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
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  // 지도에서 좌표를 고른 직후 시트에 뜨는 줄
  pendingPinBar: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pendingPinInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pendingPinText: { flex: 1, fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '600' },
}));
