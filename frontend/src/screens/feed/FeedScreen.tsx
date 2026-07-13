/** 우리 기록 — 커플 통합 타임라인 (포스트 + 운동 + 식단 + 맛집 방문) */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { feedApi } from '../../api/feed';
import { getErrorMessage } from '../../utils/error';
import { relativeDateLabel } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { FeedItem, ReactionSummary } from '../../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Feed'>;

const QUICK_EMOJIS = ['❤️', '🥰', '😆', '👍', '💪'];

/** 'YYYY-MM-DDTHH:mm:ss…' → '오늘 09:12' / '어제 21:03' / 'M월 D일 12:40' */
function timeLabel(occurredAt: string): string {
  const date = relativeDateLabel(occurredAt.slice(0, 10));
  const time = occurredAt.slice(11, 16);
  return time ? `${date} ${time}` : date;
}

/** 타임라인 아이템 고유키 — 타입별 id 가 겹칠 수 있어 type 을 붙인다 */
function itemKey(item: FeedItem): string {
  return `${item.type}-${item.refId}`;
}

export function FeedScreen({ navigation }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await feedApi.timeline(null);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '피드를 불러오지 못했어요.'));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !nextCursor) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.timeline(nextCursor);
      setItems((prev) => {
        const seen = new Set(prev.map(itemKey));
        return [...prev, ...page.items.filter((i) => !seen.has(itemKey(i)))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '피드를 불러오지 못했어요.'));
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onReact = async (item: FeedItem, emoji: string) => {
    haptics.light();
    try {
      const reactions = await feedApi.react(item.refId, emoji);
      setItems((prev) =>
        prev.map((i) => (itemKey(i) === itemKey(item) ? { ...i, reactions } : i)),
      );
    } catch (e) {
      toast.error(getErrorMessage(e, '반응을 남기지 못했어요.'));
    }
  };

  const onDeletePost = (item: FeedItem) => {
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
            toast.success('포스트를 삭제했어요.');
            setItems((prev) => prev.filter((i) => itemKey(i) !== itemKey(item)));
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const renderReactions = (item: FeedItem) => {
    const summaries = item.reactions ?? [];
    // 기본 이모지 + 이미 달린 그 외 이모지를 함께 노출
    const extra = summaries.map((r) => r.emoji).filter((e) => !QUICK_EMOJIS.includes(e));
    const emojis = [...QUICK_EMOJIS, ...extra];
    const byEmoji = new Map<string, ReactionSummary>(summaries.map((r) => [r.emoji, r]));
    return (
      <View style={styles.reactionRow}>
        {emojis.map((emoji) => {
          const s = byEmoji.get(emoji);
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.reactionChip, s?.mine && styles.reactionChipMine]}
              activeOpacity={0.7}
              onPress={() => onReact(item, emoji)}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {s && s.count > 0 ? <Text style={styles.reactionCount}>{s.count}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderItem = ({ item }: { item: FeedItem }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={item.type === 'POST' && item.mine ? 0.8 : 1}
      onLongPress={() => onDeletePost(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.author}>{item.mine ? '나' : item.userName}</Text>
        <Text style={styles.time}>{timeLabel(item.occurredAt)}</Text>
      </View>
      {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.photo} resizeMode="cover" />
      ) : null}
      {item.content ? <Text style={styles.content}>{item.content}</Text> : null}
      {item.type === 'POST' ? renderReactions(item) : null}
      {item.type === 'POST' && item.mine ? (
        <Text style={styles.hint}>길게 눌러 삭제</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={itemKey}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={renderItem}
        ListHeaderComponent={
          <Button
            title="✍️ 일상 남기기"
            variant="secondary"
            onPress={() => navigation.navigate('FeedCompose')}
            style={styles.composeBtn}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              emoji="📖"
              title="아직 기록이 없어요"
              description={'운동·식단·맛집을 기록하거나\n첫 일상을 남겨보세요!'}
            />
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  composeBtn: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  time: { fontSize: fontSize.caption, color: colors.textMuted },
  title: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  photo: { width: '100%', height: 200, borderRadius: radius.md, marginTop: spacing.sm },
  content: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: spacing.sm, lineHeight: 21 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  reactionChipMine: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  reactionEmoji: { fontSize: fontSize.body },
  reactionCount: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  hint: { fontSize: 10, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'right' },
  footer: { paddingVertical: spacing.md },
});
