/**
 * 추억 — "작년 오늘" (PLAN.md Memories).
 *
 * <p>오늘과 같은 월·일의 1년 이상 전 기록을 연도별로 모아 본다.
 * 카드는 {@link FeedCard} 를 그대로 쓴다 — 렌더러를 복제하면 타임라인과 추억의
 * 카드가 조용히 어긋난다.
 *
 * <p>페이징이 없다. 하루치 × 몇 개 연도라 서버가 한 번에 다 준다(상한 30건).
 */
import React, { useCallback, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { FeedCard } from '../home/components/FeedCard';
import { QUICK_EMOJIS, feedItemKey, feedTimeLabel } from './FeedTimelineScreen';
import { feedApi } from '../../api/feed';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { haptics } from '../../utils/haptics';
import type { FeedItem, MemoryGroup } from '../../types';
import { colors, fontSize, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'Memories'>;

interface Section {
  title: string;
  date: string;
  data: FeedItem[];
}

/** "2025-07-30" → "2025. 7. 30." */
function dateLabel(date: string): string {
  const [y, m, d] = date.split('-');
  return `${y}. ${Number(m)}. ${Number(d)}.`;
}

function toSections(groups: MemoryGroup[]): Section[] {
  return groups.map((g) => ({ title: g.label, date: g.date, data: g.items }));
}

export function MemoriesScreen({ route }: Props) {
  const on = route.params?.on;
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  // 첫 진입에 빈 상태를 먼저 그리지 않도록 — 로드가 끝난 적이 있는지
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await feedApi.memories(on);
      setSections(toSections(res.groups));
    } catch (e) {
      toast.error(getErrorMessage(e, '추억을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [on]);

  useFocusEffect(useCallback(() => void load(), [load]));

  const onReact = async (item: FeedItem, emoji: string) => {
    haptics.light();
    try {
      const reactions = await feedApi.react(item.refId, emoji);
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          data: s.data.map((i) => (feedItemKey(i) === feedItemKey(item) ? { ...i, reactions } : i)),
        })),
      );
    } catch (e) {
      toast.error(getErrorMessage(e, '반응을 남기지 못했어요.'));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <SectionList
        sections={sections}
        keyExtractor={feedItemKey}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={load}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{section.title}</Text>
            <Text style={styles.headerDate}>{dateLabel(section.date)}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            timeLabel={feedTimeLabel(item.occurredAt)}
            quickEmojis={QUICK_EMOJIS}
            onReact={onReact}
            /* 추억은 되돌아보는 화면이다 — 여기서 삭제까지 되면 실수하기 쉽다 */
            onLongPress={() => undefined}
          />
        )}
        ListEmptyComponent={
          loaded && !loading ? (
            <EmptyState
              icon="flower-outline"
              title="아직 이 날의 추억이 없어요"
              description={'오늘을 남기면\n내년 오늘 찾아올 거예요.'}
            />
          ) : null
        }
        ListFooterComponent={<View style={styles.tail} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  headerDate: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
  tail: { height: spacing.lg },
});
