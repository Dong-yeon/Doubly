/**
 * 우리 사진첩 — 피드에 올린 사진을 한 곳에 모아본다 (여행 앨범과 별개의 전체 뷰).
 * 3열 그리드 무한스크롤, 탭하면 큰 보기(작성자·날짜·글).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { ImageViewer, type ViewerImage } from '../../components/ImageViewer';
import { feedApi } from '../../api/feed';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import type { FeedPhoto } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'PhotoAlbum'>;

const COLUMNS = 3;
const GAP = 2;
const CELL = (Dimensions.get('window').width - GAP * (COLUMNS - 1)) / COLUMNS;

export function PhotoAlbumScreen(_props: Props) {
  const [photos, setPhotos] = useState<FeedPhoto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /* 뷰어는 인덱스로 연다 — 좌우 스와이프로 옆 사진까지 이어 보려면 목록 위치가 필요하다 */
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const loadingRef = useRef(false);

  /* 뷰어용 형태로 변환 — 작성자 색(나=coral/상대=indigo)은 목록과 같은 규칙을 따른다 */
  const viewerImages: ViewerImage[] = useMemo(
    () =>
      photos.map((p) => ({
        key: String(p.postId),
        uri: p.imageUrl,
        title: `${p.mine ? '나' : p.authorName}  ·  ${relativeDateLabel(p.createdAt.slice(0, 10))}`,
        titleColor: p.mine ? colors.coral : colors.indigo,
        caption: p.content ?? undefined,
      })),
    [photos],
  );

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    try {
      const page = await feedApi.photos(null);
      setPhotos(page.items);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch {
      // 커플 미연결 등 — 빈 상태 안내로 대체
      setPhotos([]);
      setHasMore(false);
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
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => setViewingIndex(index)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${item.mine ? '내' : item.authorName} 사진 크게 보기`}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.cell} />
          </Pressable>
        )}
        ListEmptyComponent={
          refreshing ? null : (
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
  list: { paddingBottom: spacing.xl },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  row: { gap: GAP, marginBottom: GAP },
  cell: { width: CELL, height: CELL, backgroundColor: colors.surfaceAlt },
  footer: { paddingVertical: spacing.lg },
  /* 큰 보기 스타일은 ImageViewer 로 옮겼다 */
}));
