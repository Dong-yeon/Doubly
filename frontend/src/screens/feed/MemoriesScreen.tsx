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
import { SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AlbumStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { FeedCard } from '../home/components/FeedCard';
import { QUICK_EMOJIS, feedItemKey, feedTimeLabel } from './FeedTimelineScreen';
import { feedApi } from '../../api/feed';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { haptics } from '../../utils/haptics';
import type { FeedItem, MemoryAnniversary, MemoryGroup } from '../../types';
import { MaterialCommunityIcons } from '../../components/Icon';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<AlbumStackParamList, 'Memories'>;

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

export function MemoriesScreen({ navigation, route }: Props) {
  const on = route.params?.on;
  const [sections, setSections] = useState<Section[]>([]);
  /* 오늘의 기념일 — 지난 기록과 별개로 머리에 한 줄씩 */
  const [anniversaries, setAnniversaries] = useState<MemoryAnniversary[]>([]);
  const [loading, setLoading] = useState(false);
  // 첫 진입에 빈 상태를 먼저 그리지 않도록 — 로드가 끝난 적이 있는지
  const [loaded, setLoaded] = useState(false);
  // 로드 실패와 "진짜 빈 추억"을 구분한다 (QA_CHECKLIST.md 패턴 1)
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await feedApi.memories(on);
      setSections(toSections(res.groups));
      setAnniversaries(res.anniversaries ?? []);
    } catch (e) {
      toast.error(getErrorMessage(e, '추억을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [on]);

  useFocusEffect(useCallback(() => void load(), [load]));

  /*
   * 반응 전송 중인 카드 — 반응은 토글이라 연달아 두 번 가면 켰다 바로 꺼진다. 앞 요청이 끝날 때까지
   * 같은 카드의 탭은 무시한다(AlbumScreen.onReact 와 같은 방식, first-experience-audit.md #26)
   */
  const [reacting] = useState(() => new Set<string>());
  const onReact = async (item: FeedItem, emoji: string) => {
    const key = feedItemKey(item);
    if (reacting.has(key)) return;
    reacting.add(key);
    haptics.light();
    try {
      const reactions = await feedApi.react(item.type, item.refId, emoji);
      setSections((prev) =>
        prev.map((s) => ({
          ...s,
          data: s.data.map((i) => (feedItemKey(i) === key ? { ...i, reactions } : i)),
        })),
      );
    } catch (e) {
      toast.error(getErrorMessage(e, '반응을 남기지 못했어요.'));
    } finally {
      reacting.delete(key);
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
        ListHeaderComponent={
          anniversaries.length > 0 ? (
            <View style={styles.anniversaries}>
              {anniversaries.map((a) => (
                <View key={`${a.kind}:${a.eventId ?? a.label}`} style={styles.anniversaryRow}>
                  <MaterialCommunityIcons name="calendar-heart" size={18} color={colors.together} />
                  <Text style={styles.anniversaryText}>{a.label}</Text>
                </View>
              ))}
            </View>
          ) : null
        }
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
            onOpenComments={(i) => navigation.navigate('FeedComments', { postId: i.refId })}
          />
        )}
        ListEmptyComponent={
          // 기념일만 있는 날은 빈 안내를 띄우지 않는다 — 머리에 이미 오늘의 소식이 있다
          loaded && !loading && (loadError || anniversaries.length === 0) ? (
            loadError ? (
              <EmptyState
                error
                onRetry={load}
                title="추억을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
              />
            ) : (
              <EmptyState
                illustration="duo"
                title="아직 이 날의 추억이 없어요"
                description={'오늘을 남기면\n내년 오늘 찾아올 거예요.'}
              />
            )
          ) : null
        }
        ListFooterComponent={<View style={styles.tail} />}
      />
    </SafeAreaView>
  );
}

// themedStyles — StyleSheet.create 는 모듈 로드 시 색이 굳어 실행 중 테마 전환이 반영되지 않았다
const styles = themedStyles((colors) => ({
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
  anniversaries: { gap: spacing.xs, marginBottom: spacing.md },
  anniversaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.togetherPastelBg,
  },
  anniversaryText: { flex: 1, fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
}));
