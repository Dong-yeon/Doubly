/**
 * 럽슐랭 — 장소(전체 목록 ↔ 지도) / 콘텐츠(영화·공연·드라마) 두 모드.
 *
 * <p><b>왜 "가이드"와 "둘러보기"가 한 목록이 됐나(2026-09-14)</b>: 둘은 같은 장소들의
 * 부분집합 관계(인증만 / 전체)인데 사용자에겐 별개 모드로 보였다. 기본 모드가 가이드
 * (tier&gt;0만)라 <b>신규 커플은 몇 주 동안 탭의 첫 화면이 항상 빈 화면</b>이었다 — 장소를
 * 다섯 개 넣어놨어도 등급이 없으면 아무것도 안 보이니 "이 탭은 빈 탭"이 된다. 게다가 검색은
 * 둘러보기에만 걸려 정작 결과물인 가이드는 이름으로 찾을 수 없었고, 카테고리 필터는 두 모드가
 * 한 state 를 공유해 모드를 넘어 조용히 따라왔다.
 *
 * <p>이제 목록은 하나다. 정렬이 그 역할을 대신한다 — <b>인증 등급 → 솔로 픽 → 최근 방문 → 등록</b>
 * 순이라 등급 있는 곳이 자연히 위에 매거진 카드로 서고 그 아래 나머지가 이어진다. 별도 섹션이던
 * "내 픽 · 상대 픽"도 순서 안으로 들어왔다 — 섹션으로 두면 같은 장소가 섹션과 본문에 두 번
 * 나온다(실기기 확인 2026-09-14). 지도는 모드가 아니라 제목 줄의 아이콘 토글이다. 분석: docs/LOVELICHELIN_UX_REANALYSIS_2026-09-14.md 3-2 · 5-4.
 *
 * <p><b>왜 "콘텐츠"가 별개 모드인가</b>: 영화·공연·드라마는 좌표가 없는 게 정상이라
 * Place 도메인에 안 섞는다(constants/contentTypes.ts, api/content.ts 참고) — 그래서 장소 쪽의
 * 지도·카테고리 필터와는 다른 자기만의 목록·타입 필터를 갖는다. 럽슐랭(미슐랭 패러디)이라는
 * 이름과 어긋난다는 지적이 있어 '우리' 탭 이관을 검토 중이다(같은 문서 3-5).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
import { isSoloPick, CATEGORY_FILTERS } from './placeFilters';
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
import { localDateOf } from '../../utils/date';

type Nav = NativeStackNavigationProp<PlaceStackParamList>;
type Mode = 'places' | 'content';
type PlaceView = 'list' | 'map';

const MODES: { value: Mode; label: string }[] = [
  { value: 'places', label: '장소' },
  { value: 'content', label: '콘텐츠' },
];

/**
 * 카테고리 필터를 보여주기 시작하는 장소 수 — 장소가 세 개뿐인 커플에게 카테고리 칩 8개는
 * 목록보다 필터가 큰 상태다. 걸러낼 게 생겼을 때만 나타난다.
 */
const CATEGORY_FILTER_MIN_PLACES = 8;

/*
 * AI 두 기능이 결과를 낼 수 있는 최소 재료 — 서버 판정과 같은 값이어야 한다
 * (LovelichelinRecommendService.MIN_CERTIFIED_PLACES, DateCourseService.MIN_PLACES).
 * 서버도 모자라면 이유를 담은 빈 응답을 주지만, 그걸 들으려면 모달을 열고 AI 작업
 * 폴링이 한 바퀴 돌아야 한다 — 화면이 이미 아는 숫자라 누르기 전에 말해준다.
 */
const MIN_CERTIFIED_FOR_RECOMMEND = 1;
const MIN_PLACES_FOR_DATE_COURSE = 2;


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

/**
 * 아직 등급이 없는 카드의 한 줄 설명 — 장소·콘텐츠가 같은 문구를 쓴다.
 *
 * <p>예전 문구는 "럽슐랭 탈락 — 재평가하면 다시 등급이 매겨져요" 였다. 내가 ★★★★, 상대가
 * ★★ 를 준 우리 단골집에 앱이 "탈락"이라고 쓰는 셈이라 커플 앱의 어휘가 아니었다. 미슐랭
 * 패러디의 재미는 성공 쪽 어휘(등극·인증)에만 남기고, 실패 쪽은 <b>판정 대신 사실</b>을 쓴다 —
 * 둘의 별점이 갈렸다는 것, 혹은 누구 차례인지.
 */
function ratingHint(
  item: { myRating?: number | null; partnerRating?: number | null },
  partnerName: string | null,
): string {
  const partner = partnerName ?? '상대';
  if (item.myRating != null && item.partnerRating != null) {
    return `의견이 갈렸어요 · 나 ${stars(item.myRating)} / ${partner} ${stars(item.partnerRating)}`;
  }
  return item.myRating != null
    ? `${partner}님 별점을 기다리고 있어요`
    : `${partner}님이 별점을 남겼어요 · 내 차례예요`;
}

export function PlaceScreen() {
  const navigation = useNavigation<Nav>();
  const [mode, setMode] = useState<Mode>('places');
  const [placeView, setPlaceView] = useState<PlaceView>('list');

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

  // 목록·지도가 공유하는 검색·카테고리 필터 — 한 목록이 되면서 하나씩만 남았다
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

  // 인증(tier>0) 장소 수 — AI 맛집 추천이 결과를 낼 수 있는지 판정에 쓴다. 카테고리 필터와
  // 무관하게 전체에서 센다(필터를 바꿨다고 추천 가능 여부가 달라지면 안 된다).
  const certifiedCount = useMemo(
    () => allPlaces.filter((p) => p.lovelichelinTier > 0).length,
    [allPlaces],
  );

  /*
   * 하나뿐인 장소 목록 — 검색·카테고리를 걸고 "인증 등급 → 최근 방문 → 등록" 순으로 세운다.
   * 예전엔 가이드(tier>0)와 둘러보기(전체)가 별개 모드였고 기본이 가이드라 신규 커플의 첫
   * 화면이 늘 비어 있었다(파일 상단 주석). 목록을 합치고 정렬로 대신하면 등급 있는 곳은
   * 여전히 맨 위에 서면서, 아직 등급이 없는 커플도 자기가 넣은 장소를 바로 본다.
   *
   * 최근 방문을 등록순보다 앞에 두는 건 등록순(id desc)이 "어제 다녀온 곳은 아래, 석 달 전
   * 넣고 안 간 곳은 위"를 만들기 때문이다. lastVisitedAt 은 YYYY-MM-DD 라 문자열 비교로 충분하다.
   */
  const sortedPlaces = useMemo(
    () =>
      allPlaces
        .filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))
        .filter((p) => categoryFilter === 'ALL' || p.category === categoryFilter)
        .sort((a, b) => {
          if (b.lovelichelinTier !== a.lovelichelinTier) return b.lovelichelinTier - a.lovelichelinTier;
          // 솔로 픽은 인증 바로 다음 — 예전엔 목록 위에 별도 섹션("내 픽 · 상대 픽")으로
          // 얹혀 있었는데, 한 목록이 되면서 같은 장소가 섹션과 본문에 두 번 나왔다
          // (실기기 확인 2026-09-14). 섹션을 걷어내고 순서로 올린다 — 배지가 이미
          // 카드에 붙어 있어 무엇이 픽인지는 그대로 보인다.
          const pick = Number(isSoloPick(b)) - Number(isSoloPick(a));
          if (pick !== 0) return pick;
          const visited = (b.lastVisitedAt ?? '').localeCompare(a.lastVisitedAt ?? '');
          if (visited !== 0) return visited;
          return b.id - a.id;
        }),
    [allPlaces, search, categoryFilter],
  );

  // 지도도 같은 필터링 결과를 쓴다 — 목록에서 '카페'만 보다가 지도로 넘기면 카페만 찍힌다
  const markers = sortedPlaces
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({
      id: p.id,
      lat: p.lat as number,
      lng: p.lng as number,
      title: p.name,
      color: colors.danger,
      tier: p.lovelichelinTier,
    }));

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
        {/*
          AI 버튼 둘은 모드에 묶여 있었다 — 맛집 추천은 가이드에서만, 데이트 코스는
          "둘러보기 → 지도"까지 두 번 들어가야 보였다. 둘 다 지금 무엇을 보고 있든 의미가
          같으므로 장소 모드에서는 항상 같은 자리에 둔다. 콘텐츠 모드에서만 감춘다 —
          영화·드라마를 보다가 "맛집 추천"이 뜨면 어긋난다.
        */}
        {mode !== 'content' ? (
          <View style={styles.titleActions}>
            {/*
              목록↔지도 — 예전엔 "둘러보기" 모드 안의 2단 토글이라 한 층을 더 먹었다.
              카카오 키가 없으면 지도가 열려도 안내문뿐이라 토글 자체를 내린다.
            */}
            {isKakaoMapConfigured() ? (
              <IconButton
                icon={placeView === 'map' ? 'format-list-bulleted' : 'map-outline'}
                label={placeView === 'map' ? '목록으로 보기' : '지도로 보기'}
                onPress={() => {
                  setPlaceView((v) => (v === 'map' ? 'list' : 'map'));
                  // 지도를 떠나면 고르던 좌표는 의미가 없다 — 다음에 돌아왔을 때 엉뚱한 위치에
                  // "여기에 추가" 바가 떠 있지 않게 비운다
                  setPendingPin(null);
                }}
              />
            ) : null}
            <AiInsightButton
              label="AI 맛집 추천"
              title="럽슐랭 취향 맞춤 추천"
              fetcher={placeApi.lovelichelinRecommend}
              render={renderRecommendation}
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
              disabledReason={
                allPlaces.length < MIN_PLACES_FOR_DATE_COURSE
                  ? `코스를 짜려면 저장한 장소가 ${MIN_PLACES_FOR_DATE_COURSE}곳 이상이어야 해요. 가고 싶은 곳을 먼저 담아보세요!`
                  : undefined
              }
            />
            {/* 여행(Trip)은 홈 스택으로 이관 — 진입은 홈 D-day 카드·커플 캘린더 (navigation/types.ts 참고) */}
          </View>
        ) : null}
      </View>

      <View style={styles.modeRow}>
        {MODES.map((m) => (
          <Chip
            key={m.value}
            label={m.label}
            selected={mode === m.value}
            onPress={() => {
              setMode(m.value);
              if (m.value !== 'places') setPendingPin(null);
            }}
            fill
          />
        ))}
      </View>

      {mode === 'places' && allPlaces.length > 0 ? (
        <View style={styles.searchWrap}>
          <TextField
            placeholder="장소 이름으로 검색"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        </View>
      ) : null}

      {/*
        카테고리 칩은 줄바꿈 2줄을 차지해 첫 카드를 화면 절반 아래로 밀어냈다. 가로 한 줄
        스크롤로 접고, 걸러낼 만큼 쌓이기 전까지는(CATEGORY_FILTER_MIN_PLACES) 아예 숨긴다.
      */}
      {mode === 'places' && allPlaces.length >= CATEGORY_FILTER_MIN_PLACES ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
          keyboardShouldPersistTaps="handled"
        >
          {CATEGORY_FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={categoryFilter === f.value}
              onPress={() => setCategoryFilter(f.value)}
            />
          ))}
        </ScrollView>
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
        </>
      ) : null}

      {mode === 'places' && placeView === 'list' ? (
        <FlatList
          data={sortedPlaces}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshing={placeLoading}
          onRefresh={() => loadPlaces(true)}
          /*
           * 카드 두 종류가 한 목록에 섞인다 — 인증된 곳은 커버 사진이 있는 매거진 카드,
           * 나머지는 한 줄짜리 일반 카드. 정렬이 등급 우선이라 매거진 카드가 위에 모이고
           * 그 아래로 일반 카드가 이어져, 경계가 모드 전환 없이도 눈에 보인다.
           */
          renderItem={({ item }) =>
            item.lovelichelinTier > 0 ? (
              <TouchableOpacity
                activeOpacity={0.85}
                // Card 의 style 은 ViewStyle 하나만 받아 배열 병합이 안 된다 — 삭제 중 흐림은
                // 감싸는 쪽에 건다
                style={deletingPlaceId === item.id ? styles.cardDeleting : undefined}
                disabled={deletingPlaceId === item.id}
                onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
                onLongPress={() => onDeletePlace(item)}
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
                      <Text style={styles.magazineDate}>{localDateOf(item.lovelichelinCertifiedAt)} 등극</Text>
                    ) : null}
                  </View>
                </Card>
              </TouchableOpacity>
            ) : (
            <TouchableOpacity
              style={[styles.card, deletingPlaceId === item.id && styles.cardDeleting]}
              activeOpacity={0.7}
              disabled={deletingPlaceId === item.id}
              onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id, name: item.name })}
              onLongPress={() => onDeletePlace(item)}
            >
              {/* 이 가지는 tier === 0 인 카드만 탄다 — 럽슐랭 배지는 위쪽 매거진 카드 몫이다 */}
              <View style={styles.cardHeader}>
                <Text style={styles.name}>{item.name}</Text>
                {item.category ? (
                  <View style={styles.categoryChip}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                ) : null}
                {isSoloPick(item) ? (
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
              {item.myRating != null || item.partnerRating != null ? (
                <Text style={styles.pendingHint}>{ratingHint(item, partnerName)}</Text>
              ) : null}
            </TouchableOpacity>
            )
          }
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
            ) : null
          }
        />
      ) : null}

      {mode === 'places' && placeView === 'map' ? (
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
                const place = sortedPlaces.find((p) => p.id === id);
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
      ) : null}

      <View style={styles.fabWrap}>
        {mode === 'places' && placeView === 'map' && pendingPin ? (
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
    // AI 버튼이 둘로 늘어 좁은 기기·큰 글꼴에서는 한 줄에 다 못 들어간다 — 넘치면 접는다
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  screenTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  titleActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  modeRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  /*
   * 장소 카테고리는 가로 한 줄 스크롤(ScrollView contentContainerStyle)이라 flexWrap 이 없다 —
   * 줄바꿈 2줄이 첫 카드를 화면 절반 아래로 밀어내던 자리다. 콘텐츠 타입 칩은 4개뿐이라
   * 한 줄에 들어가므로 그대로 View + wrap 을 쓴다(아래 contentFilterRow).
   */
  /*
   * flexGrow/flexShrink 를 직접 끈다. RN 의 horizontal ScrollView 기본 스타일이
   * `{ flexGrow: 1, flexShrink: 1 }` 이라, 이 칩 줄은 SafeAreaView(flex:1) 안에서
   * 아래 FlatList 와 세로 공간을 나눠 갖는 형제가 된다. 목록이 화면을 넘치는 순간
   * 칩 줄까지 함께 줄어들어 44pt 칩의 아래쪽 테두리와 글자가 잘렸다(iOS 실기기).
   * 가로 스크롤이므로 세로로는 내용 높이를 그대로 유지해야 한다.
   * 같은 처방이 AlbumScreen.chipScroll / QuickLinkChips.scroll 에도 이미 있다.
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
  // 장소·콘텐츠 목록 카드
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
  /*
   * 평점·방문 횟수는 <b>정보 글자지 상태가 아니다</b> — 초록일 이유가 없다(2026-09-23).
   * 카드마다 반복되는 줄이라 화면에서 초록이 가장 많이 깔리던 자리였다. 상용 앱들이
   * "색은 면에, 글자는 검정" 으로 가는 이유가 여기다(§3-3). 선택 상태를 말하는 초록
   * (세그먼트·필터 칩)과 소유자 색(pendingHint = togetherText)은 그대로 둔다.
   */
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
