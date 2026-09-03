/**
 * 저장한 대화 — docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §3, §6 3순위.
 * 커플 공용 북마크 목록. 항목을 누르면 그 채팅방으로 돌아가 메시지 위치로 스크롤한다
 * (ChatRoomScreen.tsx 의 scrollToMessageId 파라미터 참고).
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChatStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { chatApi } from '../../api/chat';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { messagePreview } from '../../utils/messagePreview';
import { chatDateDividerLabel } from '../../utils/date';
import type { ChatBookmark } from '../../types';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<ChatStackParamList, 'SavedMessages'>;

export function SavedMessagesScreen({ route, navigation }: Props) {
  const { relationId, title, myId } = route.params;

  const [items, setItems] = useState<ChatBookmark[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setRefreshing(true);
    setLoadError(false);
    try {
      const page = await chatApi.bookmarks(relationId);
      setItems(page);
      setHasMore(page.length > 0);
    } catch (e) {
      toast.error(getErrorMessage(e, '저장한 대화를 불러오지 못했어요.'));
      setItems([]);
      setHasMore(false);
      setLoadError(true);
    } finally {
      loadingRef.current = false;
      setRefreshing(false);
    }
  }, [relationId]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || items.length === 0) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const cursor = items[items.length - 1].bookmarkId;
      const page = await chatApi.bookmarks(relationId, cursor);
      setItems((prev) => {
        const seen = new Set(prev.map((b) => b.bookmarkId));
        return [...prev, ...page.filter((b) => !seen.has(b.bookmarkId))];
      });
      setHasMore(page.length > 0);
    } catch (e) {
      toast.error(getErrorMessage(e, '저장한 대화를 불러오지 못했어요.'));
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, items, relationId]);

  useFocusEffect(useCallback(() => void load(), [load]));

  const unsave = async (item: ChatBookmark) => {
    try {
      await chatApi.toggleBookmark(item.message.id);
      setItems((prev) => prev.filter((b) => b.bookmarkId !== item.bookmarkId));
      toast.success('저장을 취소했어요.');
    } catch (e) {
      toast.error(getErrorMessage(e, '저장을 취소하지 못했어요.'));
    }
  };

  const openInRoom = (item: ChatBookmark) => {
    navigation.navigate('ChatRoom', { relationId, title, scrollToMessageId: item.message.id });
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(b) => String(b.bookmarkId)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : undefined}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => openInRoom(item)}
            accessibilityRole="button"
          >
            <View style={styles.rowBody}>
              <Text style={styles.sender}>{item.message.senderId === myId ? '나' : title}</Text>
              <Text style={styles.preview} numberOfLines={2}>
                {messagePreview(item.message.messageType, item.message.content)}
              </Text>
              <Text style={styles.date}>{chatDateDividerLabel(item.message.createdAt)}</Text>
            </View>
            <Pressable
              onPress={() => unsave(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="저장 취소"
            >
              <MaterialCommunityIcons name="bookmark" size={22} color={colors.primary} />
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          refreshing ? null : loadError ? (
            <EmptyState
              icon="cloud-off-outline"
              title="불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해주세요."
              error
              onRetry={load}
            />
          ) : (
            <EmptyState
              icon="bookmark-outline"
              title="저장한 대화가 없어요"
              description={'메시지를 길게 눌러 "저장하기"를 선택하면\n여기에 모여요.'}
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
    </View>
  );
}

const styles = themedStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowBody: { flex: 1, gap: 2 },
  sender: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  preview: { fontSize: fontSize.body, color: colors.textPrimary },
  date: { fontSize: fontSize.caption, color: colors.textTertiary },
  footer: { paddingVertical: spacing.lg },
}));
