/**
 * 우리 기록 — 포스트·운동·식단·맛집을 합친 통합 타임라인.
 *
 * <p>원래 홈 화면 아래에 붙어 있었다. 그런데 홈은 배경 사진이 벽지처럼 깔린
 * 화면이라, 기록이 쌓일수록 그 위로 카드가 계속 얹혀 사진이 파묻혔다.
 * 홈은 스크롤 없는 고정 화면으로 두고, 쌓이는 목록은 이 화면으로 분리했다.
 */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
import { relativeDateLabel, toDateString } from '../../utils/date';
import { haptics } from '../../utils/haptics';
import { useRelationStore } from '../../store/relationStore';
import type { FeedItem } from '../../types';
import { colors, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'FeedTimeline'>;

export const QUICK_EMOJIS = ['❤️', '🥰', '😆', '👍', '💪'];

export function feedItemKey(item: FeedItem): string {
  return `${item.type}-${item.refId}`;
}

/**
 * occurredAt(서버 UTC + 'Z')을 기기 로컬(KST) 날짜·시각으로 바꿔 표시한다.
 *
 * <p>과거엔 문자열을 그대로 `slice(0, 10)`/`slice(11, 16)` 해서 UTC 값을 KST인 것처럼
 * 보여주는 버그가 있었다(12:14 KST 등록 → 서버에 03:14 UTC 저장 → 화면에 "03:14",
 * 자정 근처엔 날짜까지 하루 밀림). {@link ChatRoomScreen}의 `timeOf`처럼
 * `new Date(iso)`로 파싱해야 기기가 로컬로 변환해준다 — 날짜·시각 둘 다 이 변환된
 * `Date`에서 뽑는다.
 */
export function feedTimeLabel(occurredAt: string): string {
  const d = new Date(occurredAt);
  if (Number.isNaN(d.getTime())) return occurredAt;
  const date = relativeDateLabel(toDateString(d));
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

export function FeedTimelineScreen({ navigation, route }: Props) {
  const who = route.params?.who;
  const partnerName = useRelationStore((s) => s.couple?.partner?.name) ?? '상대방';

  const [items, setItems] = useState<FeedItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // 첫 로드와 더 읽기가 겹쳐 같은 페이지를 두 번 읽지 않도록 하는 잠금
  const busy = useRef(false);

  /*
   * who 로 거를 때만 쓰는 필터·기본 개수.
   *
   * <p>백엔드 /feed 는 사람으로 거르는 파라미터가 없다 — 받은 페이지를
   * item.mine 으로 클라이언트에서 거른다. 기본 20개를 그대로 받으면 한쪽이
   * 최근에 몰아 기록한 날엔 반대쪽 화면이 "더 보기"를 여러 번 눌러야 겨우
   * 몇 건 보이므로, 거를 때는 한 페이지를 더 크게 받는다.
   */
  const matches = useCallback((item: FeedItem) => !who || (who === 'me') === item.mine, [who]);
  const pageLimit = who ? 40 : 20;

  useLayoutEffect(() => {
    if (who === 'me') navigation.setOptions({ title: '내 기록' });
    else if (who === 'partner') navigation.setOptions({ title: `${partnerName}님의 기록` });
    // who 가 없으면(전체) 네비게이터에 정의된 기본 타이틀('우리 기록')을 그대로 둔다
  }, [navigation, who, partnerName]);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const page = await feedApi.timeline(null, pageLimit);
      setItems(page.items.filter(matches));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '기록을 불러오지 못했어요.'));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [pageLimit, matches]);

  const loadMore = useCallback(async () => {
    if (busy.current || !hasMore || !nextCursor) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.timeline(nextCursor, pageLimit);
      setItems((prev) => {
        // 커서 경계에서 겹쳐 들어온 항목은 버린다
        const seen = new Set(prev.map(feedItemKey));
        return [...prev, ...page.items.filter((i) => !seen.has(feedItemKey(i)) && matches(i))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      toast.error(getErrorMessage(e, '기록을 더 불러오지 못했어요.'));
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, nextCursor, pageLimit, matches]);

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
    // 운동·식단·맛집 카드(RecordCard)는 길게 눌러도 애초에 이 핸들러가 호출되지
    // 않는다 — FeedCard 가 그 종류엔 onLongPress 를 연결하지 않는다. 여기서 실제로
    // 걸러지는 건 "POST 인데 내 글이 아닌" 경우뿐이라, 그 경우에만 피드백을 준다.
    if (item.type !== 'POST') return;
    if (!item.mine) {
      toast.info('내가 쓴 글만 삭제할 수 있어요.');
      return;
    }
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
