/**
 * 홈 타임라인 카드 — 내용에 따라 <b>크기가 다르다</b>.
 *
 * <p>예전에는 사진 일상이든 운동 기록이든 같은 크기의 카드로 나와서, 스크롤하면
 * 회색 상자만 줄줄이 이어졌다. 정작 보고 싶은 사진이 "운동 완료 💪" 같은 자동 기록과
 * 같은 비중을 차지했다.
 *
 * <p>그래서 두 종류로 나눈다.
 * <ul>
 *   <li><b>사진</b>이 있으면 — 사진을 카드 폭 전체에 크게 깔고 글은 아래 얹는다.</li>
 *   <li><b>자동 기록</b>(운동·식단·맛집)은 — 아이콘 한 줄짜리 작은 카드로 줄인다.</li>
 * </ul>
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import type { FeedItem, FeedItemType, ReactionSummary } from '../../../types';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import { layout } from '../../../theme/layout';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * 자동 기록의 종류별 아이콘·색 — 한눈에 무슨 기록인지 구분되게.
 * 함수로 두어 렌더 시점에 현재 팔레트를 읽는다(객체로 굳히면 테마 전환을 못 따라온다).
 */
const typeMeta = (
  type: Exclude<FeedItemType, 'POST'>,
): { icon: IconName; color: string } =>
  ({
    WORKOUT: { icon: 'dumbbell' as IconName, color: colors.indigo },
    MEAL: { icon: 'silverware-fork-knife' as IconName, color: colors.violet },
    PLACE_VISIT: { icon: 'map-marker' as IconName, color: colors.coral },
  })[type];

export interface FeedCardProps {
  item: FeedItem;
  timeLabel: string;
  quickEmojis: readonly string[];
  onReact: (item: FeedItem, emoji: string) => void;
  onLongPress: (item: FeedItem) => void;
}

export function FeedCard({ item, timeLabel, quickEmojis, onReact, onLongPress }: FeedCardProps) {
  if (item.type !== 'POST') return <RecordCard item={item} timeLabel={timeLabel} />;
  return (
    <PostCard
      item={item}
      timeLabel={timeLabel}
      quickEmojis={quickEmojis}
      onReact={onReact}
      onLongPress={onLongPress}
    />
  );
}

/** 운동·식단·맛집 — 자동으로 쌓이는 기록이라 작게 */
function RecordCard({ item, timeLabel }: { item: FeedItem; timeLabel: string }) {
  const meta = typeMeta(item.type as Exclude<FeedItemType, 'POST'>);
  return (
    <View style={styles.record}>
      <View style={[styles.recordIcon, { backgroundColor: meta.color }]}>
        <MaterialCommunityIcons name={meta.icon} size={18} color={colors.white} />
      </View>
      <View style={styles.recordBody}>
        <Text style={styles.recordTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.content ? (
          <Text style={styles.recordContent} numberOfLines={1}>
            {item.content}
          </Text>
        ) : null}
      </View>
      <View style={styles.recordMeta}>
        <Text style={styles.recordWho} numberOfLines={1}>
          {item.mine ? '나' : item.userName}
        </Text>
        <Text style={styles.recordTime}>{timeLabel}</Text>
      </View>
      {/* 사진이 있는 식단·맛집은 작은 썸네일까지만 */}
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumb} /> : null}
    </View>
  );
}

/** 직접 남긴 일상 — 사진이 있으면 사진이 주인공 */
function PostCard({ item, timeLabel, quickEmojis, onReact, onLongPress }: FeedCardProps) {
  const hasPhoto = !!item.imageUrl;
  return (
    <Pressable
      style={[styles.post, hasPhoto && styles.postPhoto]}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
    >
      {hasPhoto ? (
        <Image source={{ uri: item.imageUrl! }} style={styles.photo} resizeMode="cover" />
      ) : null}

      <View style={[styles.postBody, hasPhoto && styles.postBodyOnPhoto]}>
        <View style={styles.postHeader}>
          <View style={[styles.whoDot, { backgroundColor: item.mine ? colors.coral : colors.indigo }]} />
          <Text style={styles.who}>{item.mine ? '나' : item.userName}</Text>
          <Text style={styles.time}>{timeLabel}</Text>
        </View>

        {item.content ? <Text style={styles.content}>{item.content}</Text> : null}

        <Reactions
          reactions={item.reactions ?? []}
          quickEmojis={quickEmojis}
          onPress={(emoji) => onReact(item, emoji)}
        />
      </View>
    </Pressable>
  );
}

function Reactions({
  reactions,
  quickEmojis,
  onPress,
}: {
  reactions: ReactionSummary[];
  quickEmojis: readonly string[];
  onPress: (emoji: string) => void;
}) {
  // 기본 이모지 + 상대가 새로 붙인 이모지 (중복 없이)
  const extra = reactions.map((r) => r.emoji).filter((e) => !quickEmojis.includes(e));
  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));
  return (
    <View style={styles.reactionRow}>
      {[...quickEmojis, ...extra].map((emoji) => {
        const summary = byEmoji.get(emoji);
        return (
          <Pressable
            key={emoji}
            style={({ pressed }) => [
              styles.chip,
              summary?.mine && styles.chipMine,
              pressed && styles.chipPressed,
            ]}
            onPress={() => onPress(emoji)}
            // 높이 30px — 칩 크기는 유지하고 터치 영역만 넓힌다
            hitSlop={7}
          >
            <Text style={styles.chipEmoji}>{emoji}</Text>
            {summary && summary.count > 0 ? (
              <Text style={[styles.chipCount, summary.mine && styles.chipCountMine]}>{summary.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  // ---- 자동 기록 (작게) ----
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  recordIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  recordBody: { flex: 1 },
  recordTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  recordContent: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 1 },
  recordMeta: { alignItems: 'flex-end' },
  recordWho: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  recordTime: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  thumb: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },

  // ---- 일상 포스트 ----
  post: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // 사진 카드는 패딩 없이 — 사진이 카드 모서리까지 꽉 찬다
  postPhoto: { padding: 0, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 5, backgroundColor: colors.surfaceAlt },
  postBody: {},
  postBodyOnPhoto: { padding: spacing.md },

  postHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  whoDot: { width: 7, height: 7, borderRadius: 4 },
  who: { flex: 1, fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  time: { fontSize: fontSize.caption, color: colors.textMuted },
  content: { fontSize: fontSize.subtitle, color: colors.textPrimary, marginTop: spacing.xs, lineHeight: 24 },

  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    // hitSlop 은 웹에서 무효 — 최소 높이를 직접 준다
    minHeight: layout.touchTarget,
  },
  chipMine: { backgroundColor: colors.primary },
  chipPressed: { opacity: 0.6 },
  chipEmoji: { fontSize: fontSize.body },
  chipCount: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '800' },
  // 내가 누른 칩은 배경이 colors.primary — 라이트/다크 모두 흰 글씨가 대비를 만족한다
  chipCountMine: { color: colors.white },
}));
