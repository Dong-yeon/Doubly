/**
 * "우리" 탭 메인 — 지금까지의 우리(docs/ALBUM_TAB_IA_2026-09-14.md 5-3).
 *
 * <p>구 "우리 사진첩"(일상 포스트의 사진만 보는 3열 그리드)을 그대로 승격한 화면이 아니다.
 * 일상·식단·운동·맛집 <b>네 소스</b>의 사진을 한 곳에 모으고(그래서 매일 자란다),
 * 같은 데이터의 다른 모양인 타임라인·여행 앨범·작년 오늘의 입구를 함께 둔다.
 *
 * <p>그리드 칸은 기록 하나(대표 사진)이고, 탭하면 그 기록의 사진을 전부 펴서 좌우로 넘긴다.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePhotoGrid } from '../../hooks/usePhotoGrid';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AlbumStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { ImageViewer, type ViewerImage } from '../../components/ImageViewer';
import { MemoryPeek } from '../home/components/MemoryPeek';
import { feedApi } from '../../api/feed';
import { tripApi } from '../../api/trip';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { thumbnailUrl } from '../../utils/imageUrl';
import type { FeedPhoto, FeedPhotoSource, Memories, Trip } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<AlbumStackParamList, 'AlbumMain'>;

/** 폰에서의 열 수 — 태블릿·폴더블에서는 usePhotoGrid 가 칸 크기를 보고 늘린다 */
const PHONE_COLUMNS = 3;
const GAP = 2;

/** 소스 필터 칩 — 값이 없는 '전체'는 서버 기본값(4소스)과 같아 파라미터를 안 보낸다 */
const FILTERS: { key: string; label: string; sources?: FeedPhotoSource[] }[] = [
  { key: 'all', label: '전체' },
  { key: 'post', label: '일상', sources: ['POST'] },
  { key: 'meal', label: '식단', sources: ['MEAL'] },
  { key: 'workout', label: '운동', sources: ['WORKOUT'] },
  { key: 'place', label: '맛집', sources: ['PLACE_VISIT'] },
];

/** 기록 하나를 가리키는 키 — 테이블마다 id 공간이 달라 type 까지 묶어야 유일하다 */
const keyOf = (p: FeedPhoto) => `${p.type}:${p.refId}`;

export function AlbumScreen({ navigation }: Props) {
  // Dimensions.get() 은 정적 스냅샷이라 회전·창 크기 변경에 반응하지 않았다.
  // usePhotoGrid 는 매 렌더마다 최신 폭(웹은 셸 폭)으로 열 수와 칸을 다시 계산한다.
  const { columns, cell: CELL } = usePhotoGrid({ gap: GAP, phoneColumns: PHONE_COLUMNS });

  const [filter, setFilter] = useState('all');
  const [photos, setPhotos] = useState<FeedPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /* 뷰어는 인덱스로 연다 — 좌우 스와이프로 옆 사진까지 이어 보려면 목록 위치가 필요하다 */
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const loadingRef = useRef(false);
  // 로드 실패가 빈 상태로 위장하지 않게 구분한다 (QA_CHECKLIST.md 전역 반복 패턴 1)
  const [loadError, setLoadError] = useState(false);
  /* 머리글의 두 섹션 — 있는 날/있을 때만 그린다. 부가 정보라 실패해도 그리드는 정상 동작 */
  const [memories, setMemories] = useState<Memories | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);

  const sourcesOf = useCallback(
    (key: string) => FILTERS.find((f) => f.key === key)?.sources,
    [],
  );

  /*
   * 뷰어용 형태로 변환 — 그리드 칸은 기록당 하나(대표 사진)지만, 뷰어는 그 기록의
   * 사진을 전부 편다. 계속 스와이프하면 다음 기록의 사진으로 자연스럽게 넘어간다.
   * firstIndexByKey 는 "이 칸을 탭하면 뷰어의 몇 번째부터 열지"를 알려준다.
   */
  const { viewerImages, firstIndexByKey } = useMemo(() => {
    const images: ViewerImage[] = [];
    const firstIndexByKey = new Map<string, number>();
    for (const p of photos) {
      const uris = p.imageUrls && p.imageUrls.length > 0 ? p.imageUrls : [p.imageUrl];
      firstIndexByKey.set(keyOf(p), images.length);
      uris.forEach((uri, i) => {
        images.push({
          key: `${keyOf(p)}-${i}`,
          // 뷰어는 원본을 쓴다 — 크게 보는 자리에서 썸네일을 늘리면 뭉갠다
          uri,
          title: `${p.mine ? '나' : p.authorName}  ·  ${relativeDateLabel(p.createdAt.slice(0, 10))}`,
          titleColor: p.mine ? colors.coral : colors.indigo,
          caption: p.caption ?? undefined,
        });
      });
    }
    return { viewerImages: images, firstIndexByKey };
  }, [photos]);

  const load = useCallback(
    async (key: string) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setRefreshing(true);
      setLoadError(false);
      try {
        const page = await feedApi.photos(null, 30, sourcesOf(key));
        setPhotos(page.items);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch (e) {
        // 커플 미연결 등 — 빈 상태 안내로 대체하되, "진짜 빈 앨범"과는 loadError 로 구분한다
        toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
        setPhotos([]);
        setHasMore(false);
        setLoadError(true);
      } finally {
        loadingRef.current = false;
        setRefreshing(false);
      }
    },
    [sourcesOf],
  );

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !nextCursor) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.photos(nextCursor, 30, sourcesOf(filter));
      setPhotos((prev) => {
        const seen = new Set(prev.map(keyOf));
        return [...prev, ...page.items.filter((p) => !seen.has(keyOf(p)))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, filter, sourcesOf]);

  /* 머리글 데이터 — 사진 목록과 독립이라 실패는 조용히 넘긴다(섹션만 안 뜬다) */
  const loadHeader = useCallback(() => {
    feedApi.memories().then(setMemories).catch(() => setMemories(null));
    tripApi.list().then(setTrips).catch(() => setTrips([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(filter);
      loadHeader();
    }, [load, filter, loadHeader]),
  );

  const onPickFilter = (key: string) => {
    if (key === filter) return;
    setFilter(key);
    setPhotos([]);
    setNextCursor(null);
    void load(key);
  };

  const listHeader = (
    <View>
      {/*
        작년 오늘 — 있는 날만. 홈의 MemoryPeek 과 같은 카드를 쓴다(같은 것이 두 모양이면
        같은 카드여야 한다). PRO 잠금은 서버 응답의 locked 를 그대로 따른다.
      */}
      {memories && (memories.groups.length > 0 || memories.locked) ? (
        <View style={styles.section}>
          <MemoryPeek memories={memories} onPress={() => navigation.navigate('Memories')} />
        </View>
      ) : null}

      {/* 여행 앨범 — 여행이 있을 때만. 가로로 훑고 탭하면 그 여행의 사진만 본다 */}
      {trips.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>여행</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripRow}>
            {trips.map((t) => (
              <Pressable
                key={t.id}
                style={styles.tripCard}
                onPress={() => navigation.navigate('TripAlbum', { tripId: t.id, title: t.title })}
                accessibilityRole="button"
                accessibilityLabel={`${t.title} 여행 앨범`}
              >
                <MaterialCommunityIcons name="airplane" size={18} color={colors.primary} />
                <Text style={styles.tripTitle} numberOfLines={1}>
                  {t.title}
                </Text>
                <Text style={styles.tripDate}>{t.startDate?.slice(0, 7) ?? ''}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        화면 안 헤더 — native 헤더를 쓰지 않는다. 탭의 첫 화면이라 뒤로가기 버튼이 없어
        제목이 화면 벽에 붙고(headerLeft 가 null 이면 native 헤더는 여백을 주지 않는다),
        다른 탭 첫 화면들도 전부 headerShown:false 라 이 화면만 헤더를 달면 탭을 옮길 때
        상단 높이가 들썩인다. 제목·버튼을 본문과 같은 좌우 여백(screenPadding)에 맞춘다.
      */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>우리</Text>
        <View style={styles.topButtons}>
          <Pressable
            onPress={() => navigation.navigate('FeedTimeline')}
            hitSlop={8}
            style={({ pressed }) => [styles.topBtn, pressed && styles.topBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="목록으로 보기"
          >
            <MaterialCommunityIcons name="format-list-bulleted" size={22} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('FeedCompose')}
            hitSlop={8}
            style={({ pressed }) => [styles.topBtn, pressed && styles.topBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="일상 남기기"
          >
            <MaterialCommunityIcons name="plus" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/*
        소스 필터 — <b>고정</b>이다. 리스트 머리글에 넣었더니 빈 앨범에서 리스트가 내용을
        세로 가운데로 모으면서 칩까지 화면 중앙으로 내려갔다(2026-09-15 리포트).
        필터는 목록의 일부가 아니라 목록을 고르는 장치라 위에 붙여 둔다.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => onPickFilter(f.key)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={photos}
        keyExtractor={keyOf}
        /* numColumns 는 런타임 변경이 지원되지 않는다(RN 경고) — 회전·창 크기로 열이
           바뀌면 key 를 갈아 목록을 새로 그린다 */
        key={columns}
        numColumns={columns}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(filter)} tintColor={colors.primary} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setViewingIndex(firstIndexByKey.get(keyOf(item)) ?? 0)}
            accessibilityRole="imagebutton"
            accessibilityLabel={
              item.imageUrls && item.imageUrls.length > 1
                ? `${item.mine ? '내' : item.authorName} 사진 ${item.imageUrls.length}장 크게 보기`
                : `${item.mine ? '내' : item.authorName} 사진 크게 보기`
            }
          >
            {/* 그리드는 썸네일 — 원본을 3열에 그대로 깔면 한 화면에 수 MB 를 받는다 */}
            <Image
              source={{ uri: thumbnailUrl(item.imageUrl, Math.round(CELL)) }}
              style={[styles.cell, { width: CELL, height: CELL }]}
            />
            {/* 여러 장 표시 — Instagram류 앱과 같은 자리(우상단)의 스택 아이콘 */}
            {item.imageUrls && item.imageUrls.length > 1 ? (
              <View style={styles.multiBadge}>
                <MaterialCommunityIcons name="image-multiple-outline" size={14} color={colors.white} />
              </View>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          refreshing ? null : loadError ? (
            <EmptyState
              icon="cloud-off-outline"
              title="사진을 불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해주세요."
              error
              onRetry={() => void load(filter)}
            />
          ) : (
            <EmptyState
              icon="image-multiple-outline"
              title="아직 사진이 없어요"
              description={'일상·식단·운동·맛집에 사진을 남기면\n여기에 모두 모여요.'}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
      />

      {/* 큰 보기 — 좌우 스와이프로 앨범을 이어서 넘긴다 */}
      <ImageViewer
        images={viewerImages}
        initialIndex={viewingIndex}
        onClose={() => setViewingIndex(null)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  /*
   * FAB 이 없는 화면이라 listBottomWithFab(120)은 과했는데, 그렇다고 0 이면 마지막 줄이
   * 탭바에 가렸다(UX_UI_AUDIT.md 지적). 탭바 높이만큼만 남긴다.
   */
  list: { paddingBottom: layout.listBottom + layout.touchTarget },
  // 빈 상태는 위에서 조금 내려온 자리에 둔다 — flexGrow+center 로 감싸면 위의 섹션까지
  // 함께 가운데로 끌려간다(2026-09-15 리포트: 칩이 화면 중앙으로 내려갔다)
  emptyPad: { paddingTop: spacing.xxl },
  row: { gap: GAP, marginBottom: GAP },
  // width/height 는 렌더 시점의 useContentWidth 값으로 인라인 적용한다
  cell: { backgroundColor: colors.surfaceAlt },
  multiBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingVertical: spacing.lg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  topTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  topButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topBtn: { minWidth: layout.touchTarget, minHeight: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  topBtnPressed: { opacity: 0.6 },
  /*
   * flexGrow:0 — 세로 flex 컨테이너 안의 ScrollView 는 남은 높이를 전부 먹는다. 없으면
   * 칩이 화면 높이만큼 늘어난 알약이 됐다(2026-09-15 리포트). 내용 높이만 쓰게 한다.
   */
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipRow: { gap: spacing.xs, paddingHorizontal: layout.screenPadding, paddingBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  chipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.primary },
  section: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.sm, gap: spacing.xs },
  sectionTitle: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  tripRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  tripCard: {
    width: 140,
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tripTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  tripDate: { fontSize: fontSize.caption, color: colors.textSecondary },
}));
