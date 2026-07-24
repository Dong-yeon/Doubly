/**
 * 우리 사진첩 — 피드에 올린 사진을 한 곳에 모아본다 (여행 앨범과 별개의 전체 뷰).
 * 3열 그리드 무한스크롤, 탭하면 큰 보기(작성자·날짜·글).
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { feedApi } from '../../api/feed';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import type { FeedPhoto } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

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
  const [viewing, setViewing] = useState<FeedPhoto | null>(null);
  const loadingRef = useRef(false);

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
        renderItem={({ item }) => (
          <Pressable onPress={() => setViewing(item)}>
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

      {/* 큰 보기 */}
      <Modal
        visible={viewing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
      >
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewing(null)}>
          {viewing ? (
            <>
              <Image
                source={{ uri: viewing.imageUrl }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
              <View style={styles.viewerCaption}>
                <Text style={styles.viewerMeta}>
                  <Text style={{ color: viewing.mine ? colors.coral : colors.indigo, fontWeight: '800' }}>
                    {viewing.mine ? '나' : viewing.authorName}
                  </Text>
                  {'  ·  '}
                  {relativeDateLabel(viewing.createdAt.slice(0, 10))}
                </Text>
                {viewing.content ? (
                  <Text style={styles.viewerContent} numberOfLines={4}>
                    {viewing.content}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: spacing.xl },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  row: { gap: GAP, marginBottom: GAP },
  cell: { width: CELL, height: CELL, backgroundColor: colors.surfaceAlt },
  footer: { paddingVertical: spacing.lg },

  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '70%' },
  viewerCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  viewerMeta: { color: colors.white, fontSize: fontSize.body },
  viewerContent: {
    color: colors.white,
    fontSize: fontSize.body,
    lineHeight: 22,
    marginTop: spacing.sm,
    opacity: 0.9,
  },
});
