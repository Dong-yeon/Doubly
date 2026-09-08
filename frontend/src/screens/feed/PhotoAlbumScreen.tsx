/**
 * 우리 사진첩 — 피드에 올린 사진을 한 곳에 모아본다 (여행 앨범과 별개의 전체 뷰).
 * 3열 그리드 무한스크롤, 탭하면 큰 보기(작성자·날짜·글).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { ImageViewer, type ViewerImage } from '../../components/ImageViewer';
import { feedApi } from '../../api/feed';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import type { FeedPhoto } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<HomeStackParamList, 'PhotoAlbum'>;

const COLUMNS = 3;
const GAP = 2;

export function PhotoAlbumScreen(_props: Props) {
  // Dimensions.get() 은 정적 스냅샷이라 회전·창 크기 변경에 반응하지 않았다.
  // useWindowDimensions 는 매 렌더마다 최신 width 를 주므로 그 값으로 다시 계산한다.
  const { width: windowWidth } = useWindowDimensions();
  const CELL = useMemo(() => (windowWidth - GAP * (COLUMNS - 1)) / COLUMNS, [windowWidth]);

  const [photos, setPhotos] = useState<FeedPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /* 뷰어는 인덱스로 연다 — 좌우 스와이프로 옆 사진까지 이어 보려면 목록 위치가 필요하다 */
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const loadingRef = useRef(false);
  // 로드 실패가 빈 상태로 위장하지 않게 구분한다 — loadMore 는 이미 토스트로
  // 실패를 알리는데(아래 참고) load 만 조용히 삼켜 일관성이 어긋났었다
  // (QA_CHECKLIST.md 전역 반복 패턴 1)
  const [loadError, setLoadError] = useState(false);

  /*
   * 뷰어용 형태로 변환 — 그리드 칸은 포스트당 하나(대표 사진)지만, 뷰어는 포스트의
   * 사진을 전부 편다. 그래서 한 칸을 탭해도 여러 장이면 그 자리에서 이어서 넘겨볼 수
   * 있고, 계속 스와이프하면 다음 포스트의 사진으로 자연스럽게 넘어간다.
   * firstIndexByPostId 는 "이 칸을 탭하면 뷰어의 몇 번째부터 열지"를 알려준다.
   */
  const { viewerImages, firstIndexByPostId } = useMemo(() => {
    const images: ViewerImage[] = [];
    const firstIndexByPostId = new Map<number, number>();
    for (const p of photos) {
      const uris = p.imageUrls && p.imageUrls.length > 0 ? p.imageUrls : [p.imageUrl];
      firstIndexByPostId.set(p.postId, images.length);
      uris.forEach((uri, i) => {
        images.push({
          key: `${p.postId}-${i}`,
          uri,
          title: `${p.mine ? '나' : p.authorName}  ·  ${relativeDateLabel(p.createdAt.slice(0, 10))}`,
          titleColor: p.mine ? colors.coral : colors.indigo,
          caption: p.content ?? undefined,
        });
      });
    }
    return { viewerImages: images, firstIndexByPostId };
  }, [photos]);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    setLoadError(false);
    try {
      const page = await feedApi.photos(null);
      setPhotos(page.items);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      // 커플 미연결 등 — 빈 상태 안내로 대체하되, "진짜 빈 앨범"과는
      // loadError 로 구분해 재시도를 보여준다 (QA_CHECKLIST.md 전역 반복 패턴 1)
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
      setPhotos([]);
      setHasMore(false);
      setLoadError(true);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !nextCursor) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.photos(nextCursor);
      setPhotos((prev) => {
        const seen = new Set(prev.map((p) => p.postId));
        return [...prev, ...page.items.filter((p) => !seen.has(p.postId))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor]);

  useFocusEffect(useCallback(() => void load(), [load]));

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        keyExtractor={(p) => String(p.postId)}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={photos.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setViewingIndex(firstIndexByPostId.get(item.postId) ?? 0)}
            accessibilityRole="imagebutton"
            accessibilityLabel={
              item.imageUrls && item.imageUrls.length > 1
                ? `${item.mine ? '내' : item.authorName} 사진 ${item.imageUrls.length}장 크게 보기`
                : `${item.mine ? '내' : item.authorName} 사진 크게 보기`
            }
          >
            <Image source={{ uri: item.imageUrl }} style={[styles.cell, { width: CELL, height: CELL }]} />
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
            // 로드 실패가 빈 상태로 위장하지 않게 구분한다 (QA_CHECKLIST.md 전역 반복 패턴 1)
            <EmptyState
              icon="cloud-off-outline"
              title="사진을 불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해주세요."
              error
              onRetry={load}
            />
          ) : (
            <EmptyState
              icon="image-multiple-outline"
              title="아직 사진이 없어요"
              description={'홈에서 "일상 남기기"로 사진을 올리면\n여기에 차곡차곡 모여요.'}
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
    </View>
  );
}

const styles = themedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  // spacing.xl(32) 로는 FAB 이 가리는 하단 97px 을 못 벗어나 마지막 줄이 잘렸다
  list: { paddingBottom: layout.listBottomWithFab },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  row: { gap: GAP, marginBottom: GAP },
  // width/height 는 렌더 시점의 useWindowDimensions 값으로 인라인 적용한다 (아래 참고)
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
  /* 큰 보기 스타일은 ImageViewer 로 옮겼다 */
}));
