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
 *
 * <p><b>응원 리액션은 두 종류 모두에 붙는다.</b> 예전에는 일상 포스트에만 달렸는데,
 * 정작 매일 쌓이는 건 운동·식단·맛집 카드다 — "기록을 상대가 봐주고 응원해주는 순간"이
 * 이 앱의 존재 이유라, 거기에 반응할 방법이 없으면 루프가 닫히지 않는다.
 * <p>다만 <b>펼치는 방식이 다르다</b>. 사진 포스트는 카드가 크니 이모지 줄을 그대로 깔고,
 * 자동 기록은 버튼 하나로 접는다({@link RecordCard} 주석 참고) — 작은 카드에 칩 다섯 개를
 * 늘어놓으면 응원이 기록보다 커진다.
 */
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import type { FeedItem, FeedItemType, ReactionSummary } from '../../../types';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import { isHovered } from '../../../utils/pointer';
import { layout } from '../../../theme/layout';
import { onColor } from '../../../theme/onColor';

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
    CONTENT_LOG: { icon: 'movie-open-outline' as IconName, color: colors.danger },
  })[type];

export interface FeedCardProps {
  item: FeedItem;
  timeLabel: string;
  quickEmojis: readonly string[];
  onReact: (item: FeedItem, emoji: string) => void;
  onLongPress: (item: FeedItem) => void;
}

export function FeedCard({ item, timeLabel, quickEmojis, onReact, onLongPress }: FeedCardProps) {
  if (item.type !== 'POST') {
    return (
      <RecordCard item={item} timeLabel={timeLabel} quickEmojis={quickEmojis} onReact={onReact} />
    );
  }
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

/**
 * 운동·식단·맛집 — 자동으로 쌓이는 기록이라 작게.
 *
 * <p><b>응원은 접어 둔다.</b> 예전엔 상대 기록마다 빈 이모지 칩 5개가 항상 펼쳐져 있었다.
 * 칩이 터치 타깃(44px)을 지키느라 리액션 줄만 48px — 기록 본문(34px)보다 커서 카드의
 * 절반을 먹었고, 가로로도 콘텐츠 폭의 2/3 를 차지했다. 정작 보러 온 기록이 눌린 것이다.
 * 이제는 본문 행 안의 <b>버튼 하나</b>로 접고, 누를 때만 이모지를 편다 — 버튼이 행 높이
 * 안에 들어가므로 카드가 세로로 자라지 않는다(98px → 60px).
 *
 * <p>카드를 길게 눌러도 같은 피커가 열린다 — 버튼을 못 찾은 사람을 위한 두 번째 길이다.
 */
function RecordCard({
  item,
  timeLabel,
  quickEmojis,
  onReact,
}: Pick<FeedCardProps, 'item' | 'timeLabel' | 'quickEmojis' | 'onReact'>) {
  const meta = typeMeta(item.type as Exclude<FeedItemType, 'POST'>);
  const reactions = item.reactions ?? [];
  const [picking, setPicking] = useState(false);
  // 내 기록엔 응원 버튼을 열지 않는다 — 받은 응원만 보여준다(내 기록 밑의 응원 버튼은 소음)
  const canReact = !item.mine;
  return (
    <Pressable
      style={styles.record}
      onLongPress={canReact ? () => setPicking(true) : undefined}
      delayLongPress={400}
    >
      <View style={styles.recordRow}>
        <View style={[styles.recordIcon, { backgroundColor: meta.color }]}>
          {/* 다크의 소유자 색은 파스텔이라 흰 아이콘이 1.50~1.69:1 이었다 — 배경 휘도로 고른다 */}
          <MaterialCommunityIcons name={meta.icon} size={18} color={onColor(meta.color)} />
        </View>
        <View style={styles.recordBody}>
          <View style={styles.recordTitleRow}>
            <Text style={styles.recordTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {/* 데이트 식단 — 커플 양쪽 짝 중 한 장만 내려오므로 "누가" 대신 "함께"로 읽힌다 */}
            {item.shared ? (
              <View style={styles.sharedBadge}>
                <Text style={styles.sharedBadgeText}>함께</Text>
              </View>
            ) : null}
          </View>
          {item.content ? (
            <Text style={styles.recordContent} numberOfLines={1}>
              {item.content}
            </Text>
          ) : null}
        </View>
        <View style={styles.recordMeta}>
          <Text style={styles.recordWho} numberOfLines={1}>
            {item.shared ? '둘이' : item.mine ? '나' : item.userName}
          </Text>
          <Text style={styles.recordTime}>{timeLabel}</Text>
        </View>
        {/* 사진이 있는 식단·맛집은 작은 썸네일까지만 */}
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumb} /> : null}
        <ReactionTrigger
          reactions={reactions}
          canReact={canReact}
          open={picking}
          onPress={() => setPicking((v) => !v)}
        />
      </View>
      {picking ? (
        <Reactions
          reactions={reactions}
          quickEmojis={quickEmojis}
          onPress={(emoji) => {
            onReact(item, emoji);
            setPicking(false);
          }}
          compact
        />
      ) : null}
    </Pressable>
  );
}

/**
 * 자동 기록 카드의 응원 버튼 — 본문 행 오른쪽 끝에 선다.
 *
 * <p>세 가지 모습이다. 받은 응원이 있으면 <b>이모지 요약</b>(내가 누른 게 있으면 강조),
 * 없고 응원할 수 있으면 <b>빈 웃는 얼굴</b>, 내 기록인데 응원도 없으면 <b>아무것도</b>
 * 그리지 않는다(자리만 비운다).
 *
 * <p>크기를 {@code layout.touchTarget}(44)로 잡은 건 접근성 때문만이 아니다 — 카드가
 * 기존에도 썸네일·아이콘으로 그만한 높이를 쓰고 있어, 이 안에 들어가면 행이 안 자란다.
 */
function ReactionTrigger({
  reactions,
  canReact,
  open,
  onPress,
}: {
  reactions: ReactionSummary[];
  canReact: boolean;
  open: boolean;
  onPress: () => void;
}) {
  const total = reactions.reduce((sum, r) => sum + r.count, 0);
  const mine = reactions.some((r) => r.mine);
  if (total === 0 && !canReact) {
    return null;
  }
  return (
    <Pressable
      style={({ pressed }) => [
        styles.trigger,
        total > 0 && styles.triggerFilled,
        mine && styles.triggerMine,
        (pressed || open) && styles.chipPressed,
      ]}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={total > 0 ? `응원 ${total}개, 눌러서 응원 남기기` : '응원 남기기'}
      accessibilityState={{ expanded: open }}
    >
      {total > 0 ? (
        <Text style={styles.triggerEmoji} numberOfLines={1}>
          {/* 종류가 많아도 두 개까지만 — 나머지는 숫자가 대신한다 */}
          {reactions.slice(0, 2).map((r) => r.emoji).join('')}
          {total > 1 ? (
            <Text style={[styles.triggerCount, mine && styles.chipCountMine]}> {total}</Text>
          ) : null}
        </Text>
      ) : (
        <MaterialCommunityIcons name="emoticon-outline" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

/**
 * 여러 장 사진 — 좌우 스와이프로 넘기고 아래에 현재 위치를 점으로 보여준다.
 * 한 장뿐이면 기존처럼 단순 Image 하나만(스크롤뷰·점 오버헤드가 없다).
 */
function PostPhotos({ uris }: { uris: string[] }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  if (uris.length <= 1) {
    return <Image source={{ uri: uris[0] }} style={styles.photo} resizeMode="cover" />;
  }

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          if (width > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
      >
        {uris.map((uri, i) => (
          <Image
            key={i}
            source={{ uri }}
            style={[styles.photo, width > 0 ? { width } : null]}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      {width > 0 ? (
        <View style={styles.dotsRow} pointerEvents="none">
          {uris.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 직접 남긴 일상 — 사진이 있으면 사진이 주인공 */
function PostCard({ item, timeLabel, quickEmojis, onReact, onLongPress }: FeedCardProps) {
  const photos = item.imageUrls && item.imageUrls.length > 0
    ? item.imageUrls
    : item.imageUrl ? [item.imageUrl] : [];
  const hasPhoto = photos.length > 0;
  return (
    <Pressable
      style={[styles.post, hasPhoto && styles.postPhoto]}
      onLongPress={() => onLongPress(item)}
      delayLongPress={400}
    >
      {hasPhoto ? <PostPhotos uris={photos} /> : null}

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

/**
 * @param compact 자동 기록 카드용 — 한 줄짜리 카드에 얹으므로 여백을 줄인다.
 */
function Reactions({
  reactions,
  quickEmojis,
  onPress,
  compact,
}: {
  reactions: ReactionSummary[];
  quickEmojis: readonly string[];
  onPress: (emoji: string) => void;
  compact?: boolean;
}) {
  // 기본 이모지 + 상대가 새로 붙인 이모지 (중복 없이)
  const extra = reactions.map((r) => r.emoji).filter((e) => !quickEmojis.includes(e));
  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));
  return (
    <View style={[styles.reactionRow, compact && styles.reactionRowCompact]}>
      {[...quickEmojis, ...extra].map((emoji) => {
        const summary = byEmoji.get(emoji);
        return (
          <Pressable
            key={emoji}
            style={(state) => [
              styles.chip,
              summary?.mine && styles.chipMine,
              // 마우스에는 "누를 수 있다"는 신호가 커서 말고 없다 — 칩이 라벨처럼 읽힌다
              isHovered(state) && !summary?.mine && styles.chipHovered,
              state.pressed && styles.chipPressed,
            ]}
            onPress={() => onPress(emoji)}
            // 높이 30px — 칩 크기는 유지하고 터치 영역만 넓힌다
            hitSlop={7}
            accessibilityRole="button"
            accessibilityLabel={`${emoji} 리액션`}
            accessibilityState={{ selected: !!summary?.mine }}
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recordIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  recordBody: { flex: 1 },
  recordTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // flexShrink 가 있어야 긴 제목이 '함께' 배지를 행 밖으로 밀지 않고 자기가 줄어든다
  recordTitle: { flexShrink: 1, fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  sharedBadge: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
  },
  sharedBadgeText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  recordContent: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 1 },
  recordMeta: { alignItems: 'flex-end' },
  recordWho: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  recordTime: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  thumb: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },

  // 응원 버튼 — 본문 행 안에 들어가 카드를 세로로 키우지 않는다(위 RecordCard 주석 참고)
  trigger: {
    minWidth: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 받은 응원이 있으면 배경을 깔아 "눌러서 볼 것"이 아니라 "이미 달린 것"으로 읽히게 한다
  triggerFilled: { backgroundColor: colors.surfaceAlt },
  triggerMine: { backgroundColor: colors.primary },
  triggerEmoji: { fontSize: fontSize.body },
  triggerCount: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '800' },

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
  dotsRow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: colors.white },
  postBody: {},
  postBodyOnPhoto: { padding: spacing.md },

  postHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  whoDot: { width: 7, height: 7, borderRadius: 4 },
  who: { flex: 1, fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  time: { fontSize: fontSize.caption, color: colors.textMuted },
  content: { fontSize: fontSize.subtitle, color: colors.textPrimary, marginTop: spacing.xs, lineHeight: 24 },

  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  // 자동 기록 카드는 한 줄짜리라 위 여백을 줄이고 아이콘 열에 맞춰 들여쓴다
  reactionRowCompact: { marginTop: spacing.xs, paddingLeft: 34 + spacing.sm },
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
  // 내가 이미 누른 칩은 primary 로 채워져 있어 hover 를 덧대면 오히려 흐려진다 — 비선택에만
  chipHovered: { backgroundColor: colors.border },
  chipPressed: { opacity: 0.6 },
  chipEmoji: { fontSize: fontSize.body },
  chipCount: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '800' },
  // 내가 누른 칩은 배경이 colors.primary — 라이트/다크 모두 흰 글씨가 대비를 만족한다
  chipCountMine: { color: colors.white },
}));
