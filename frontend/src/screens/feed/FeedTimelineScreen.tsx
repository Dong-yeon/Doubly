/**
 * 우리 기록 — 포스트·운동·식단·맛집을 합친 통합 타임라인.
 *
 * <p>원래 홈 화면 아래에 붙어 있었다. 그런데 홈은 배경 사진이 벽지처럼 깔린
 * 화면이라, 기록이 쌓일수록 그 위로 카드가 계속 얹혀 사진이 파묻혔다.
 * 홈은 스크롤 없는 고정 화면으로 두고, 쌓이는 목록은 이 화면으로 분리했다.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Alert } from '../../utils/alert';
import { EmptyState } from '../../components/EmptyState';
import { FeedCard } from '../home/components/FeedCard';
import { feedApi } from '../../api/feed';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { haptics } from '../../utils/haptics';
import type { FeedItem } from '../../types';
import { colors, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'FeedTimeline'>;

export const QUICK_EMOJIS = ['❤️', '🥰', '😆', '👍', '💪'];

export function feedItemKey(item: FeedItem): string {
  return `${item.type}-${item.refId}`;
}

export function feedTimeLabel(occurredAt: string): string {
  const date = relativeDateLabel(occurredAt.slice(0, 10));
  const time = occurredAt.slice(11, 16);
  return time ? `${date} ${time}` : date;
}

export function FeedTimelineScreen(_props: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // 첫 로드와 더 읽기가 겹쳐 같은 페이지를 두 번 읽지 않도록 하는 잠금
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const page = await feedApi.timeline(null);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '기록을 불러오지 못했어요.'));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore || !nextCursor) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.timeline(nextCursor);
      setItems((prev) => {
        // 커서 경계에서 겹쳐 들어온 항목은 버린다
        const seen = new Set(prev.map(feedItemKey));
        return [...prev, ...page.items.filter((i) => !seen.has(feedItemKey(i)))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '기록을 더 불러오지 못했어요.'));
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor]);

  useFocusEffect(useCallback(() => void load(), [load]));

  const onReact = async (item: FeedItem, emoji: string) => {
    haptics.light();
    try {
      const reactions = await feedApi.react(item.refId, emoji);
      setItems((prev) =>
        prev.map((i) => (feedItemKey(i) === feedItemKey(item) ? { ...i, reactions } : i)),
      );
    } catch (e) {
      toast.error(getErrorMessage(e, '반응을 남기지 못했어요.'));
    }
  };

  const onLongPress = (item: FeedItem) => {
    if (item.type !== 'POST' || !item.mine) return;
    Alert.alert('포스트 삭제', '이 일상 기록을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await feedApi.removePost(item.refId);
            haptics.light();
            setItems((prev) => prev.filter((i) => feedItemKey(i) !== feedItemKey(item)));
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={feedItemKey}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={load}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            timeLabel={feedTimeLabel(item.occurredAt)}
            quickEmojis={QUICK_EMOJIS}
            onReact={onReact}
            onLongPress={onLongPress}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="timeline-text-outline"
              title="아직 기록이 없어요"
              description={'운동·식단·맛집을 기록하거나\n첫 일상을 남겨보세요!'}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.loadMore} color={colors.primary} />
          ) : (
            <View style={styles.tail} />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  loadMore: { paddingVertical: spacing.md },
  tail: { height: spacing.lg },
}));
