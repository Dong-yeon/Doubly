/**
 * 채팅 사진 모아보기 — docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 2순위.
 * PhotoAlbumScreen(피드 사진)과 같은 3열 그리드 패턴이지만, 대상은 이 방의 IMAGE
 * 메시지다. 전면 무료(PRO_PLAN_DESIGN.md "우리 대화 갤러리") — 게이팅 없음.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { ImageViewer, type ViewerImage } from '../../components/ImageViewer';
import { chatApi } from '../../api/chat';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { chatDateDividerLabel } from '../../utils/date';
import type { ChatMessage } from '../../types';
import { colors } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatPhotoGallery'>;

const COLUMNS = 3;
const GAP = 2;

export function ChatPhotoGalleryScreen({ route }: Props) {
  const { relationId, myId } = route.params;
  const { width: windowWidth } = useWindowDimensions();
  const CELL = useMemo(() => (windowWidth - GAP * (COLUMNS - 1)) / COLUMNS, [windowWidth]);

  const [photos, setPhotos] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const loadingRef = useRef(false);
  const [loadError, setLoadError] = useState(false);

  const viewerImages: ViewerImage[] = useMemo(
    () =>
      photos
        .filter((p) => !!p.imageUrl)
        .map((p) => ({
          key: String(p.id),
          uri: p.imageUrl!,
          title: `${p.senderId === myId ? '나' : '상대'}  ·  ${chatDateDividerLabel(p.createdAt)}`,
          titleColor: p.senderId === myId ? colors.coral : colors.indigo,
        })),
    [photos, myId],
  );

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    setLoadError(false);
    try {
      const page = await chatApi.photos(relationId);
      setPhotos(page);
      setHasMore(page.length > 0);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
      setPhotos([]);
      setHasMore(false);
      setLoadError(true);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }, [relationId]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || photos.length === 0) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const oldest = photos[photos.length - 1];
      const page = await chatApi.photos(relationId, oldest.id);
      setPhotos((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.filter((p) => !seen.has(p.id))];
      });
      setHasMore(page.length > 0);
    } catch (e) {
      toast.error(getErrorMessage(e, '사진을 불러오지 못했어요.'));
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, photos, relationId]);

  useFocusEffect(useCallback(() => void load(), [load]));

  return (
    <View style={styles.container}>
      <FlatList
        data={photos}
        keyExtractor={(p) => String(p.id)}
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
            accessibilityLabel={`${item.senderId === myId ? '내' : '상대'} 사진 크게 보기`}
          >
            <Image source={{ uri: item.imageUrl ?? undefined }} style={[styles.cell, { width: CELL, height: CELL }]} />
          </Pressable>
        )}
        ListEmptyComponent={
          refreshing ? null : loadError ? (
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
              description={'채팅으로 사진을 주고받으면\n여기에 모여요.'}
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
      <ImageViewer images={viewerImages} initialIndex={viewingIndex} onClose={() => setViewingIndex(null)} />
    </View>
  );
}

const styles = themedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  list: { paddingBottom: layout.listBottomWithFab },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  row: { gap: GAP, marginBottom: GAP },
  cell: { backgroundColor: colors.surfaceAlt },
  footer: { paddingVertical: 24 },
}));
