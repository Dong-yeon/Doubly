/**
 * 홈 히어로 — 배경 사진 위의 "우리" 영역.
 *
 * <p><b>좌우 분할</b>: 위쪽에 공통(D+ 숫자), 아래는 <b>왼쪽=나 / 오른쪽=상대</b>로
 * 화면을 반으로 나눈다. 예전에는 한 줄로 쭉 이어져(아바타 둘 → 상태 문구 한 줄 →
 * 공용 최근 기록) 두 사람의 정보가 섞여 있었고, 세로 여백이 크게 남았다
 * (실측 440x956 에서 빈 공간 51%).
 *
 * <p>분할하면 "오늘 누가 뭘 했나"를 <b>같은 자리에서 같은 순서로</b> 비교하게 된다 —
 * 운동/식단이 좌우 같은 높이에 놓이므로 눈이 가로로만 움직인다.
 *
 * <p><b>좌우의 뜻은 하나뿐이다</b>: 사람(나/상대). 운동·식단 같은 종류는 세로로
 * 쌓는다. 좌우를 두 가지 뜻으로 쓰면 어느 쪽이 무엇인지 매번 다시 읽어야 한다.
 *
 * <p>순수 표현 컴포넌트다 — 스토어를 직접 읽지 않고 전부 props 로 받는다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { Avatar } from '../../../components/Avatar';
import { DoublyMark } from '../../../components/DoublyLogo';
import { formatDateLabel } from '../../../utils/date';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import { onColor } from '../../../theme/onColor';
import { layout } from '../../../theme/layout';

/** 한 사람의 오늘 — 열 하나에 들어가는 값 묶음 */
export interface PersonToday {
  name: string;
  imageUrl?: string | null;
  workoutDone: boolean;
  mealDone: boolean;
  streak: number;
  /** 그 사람의 가장 최근 기록 한 줄. 없으면 안내 문구가 뜬다 */
  latestLabel?: string | null;
  latestTime?: string | null;
}

export interface CoupleHeroProps {
  me: PersonToday;
  partner: PersonToday;
  /** 함께한 일수 (D+N) */
  dday: number;
  /** 기준 날짜 (YYYY-MM-DD) — 없으면 "눌러서 설정" 안내가 뜬다 */
  anniversaryDate?: string | null;
  onPressDday: () => void;
  /** 한 사람의 열을 눌렀을 때 — 그 사람 기록으로 이동 */
  onPressPerson?: (who: 'me' | 'partner') => void;
}

export function CoupleHero({
  me,
  partner,
  dday,
  anniversaryDate,
  onPressDday,
  onPressPerson,
}: CoupleHeroProps) {
  return (
    <View style={styles.wrap}>
      {/* 공통 — D+ 숫자 */}
      <Pressable style={styles.ddayWrap} onPress={onPressDday} accessibilityRole="button">
        <Text style={styles.ddayLabel}>함께한 지</Text>
        <Text style={styles.dday} allowFontScaling={false}>
          D+{dday}
        </Text>
        {anniversaryDate ? (
          <Text style={styles.ddaySince}>{formatDateLabel(anniversaryDate)}부터</Text>
        ) : (
          <Text style={styles.ddaySince}>눌러서 기념일 설정하기</Text>
        )}
      </Pressable>

      {/* 좌=나 / 우=상대. 가운데 마크가 경계선을 겸한다 */}
      <View style={styles.split}>
        <Column person={me} color={colors.me} onPress={() => onPressPerson?.('me')} />
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <DoublyMark size={20} />
          <View style={styles.dividerLine} />
        </View>
        <Column person={partner} color={colors.partner} onPress={() => onPressPerson?.('partner')} />
      </View>
    </View>
  );
}

/** 한 사람의 열 — 아바타 · 이름 · 오늘 두 줄 · 최근 기록 */
function Column({
  person,
  color,
  onPress,
}: {
  person: PersonToday;
  color: string;
  onPress: () => void;
}) {
  const active = person.workoutDone || person.mealDone;
  return (
    <Pressable
      style={({ pressed }) => [styles.column, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${person.name}님의 기록 보기`}
    >
      <View style={[styles.avatarRing, { borderColor: active ? color : colors.border }]}>
        <Avatar name={person.name} imageUrl={person.imageUrl} size={58} color={color} />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {person.name}
      </Text>
      {/*
        연속 기록. 0일은 알려주는 정보가 없어 <b>글자만</b> 감추고 자리는 남긴다 —
        한쪽만 줄이 사라지면 아래의 운동/식단 칩이 좌우로 어긋나 비교가 깨진다
        (실측 17px 어긋남).
      */}
      <View style={styles.streakSlot}>
        {person.streak > 0 ? <Text style={styles.streak}>🔥 {person.streak}일</Text> : null}
      </View>

      {/* 오늘 — 두 줄을 좌우 같은 높이에 두어 가로로 비교되게 한다 */}
      <View style={styles.todayBox}>
        <TodayRow icon="dumbbell" label="운동" done={person.workoutDone} color={color} />
        <TodayRow icon="silverware-fork-knife" label="식단" done={person.mealDone} color={color} />
      </View>

      <Text style={styles.latest} numberOfLines={2}>
        {person.latestLabel ?? '아직 기록이 없어요'}
      </Text>
      {person.latestTime ? <Text style={styles.latestTime}>{person.latestTime}</Text> : null}
    </Pressable>
  );
}

/** 오늘의 한 종류 — 했으면 사람 색으로 채우고, 아니면 비운다 */
function TodayRow({
  icon,
  label,
  done,
  color,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  done: boolean;
  color: string;
}) {
  return (
    <View
      style={[styles.todayRow, done && { backgroundColor: color, borderColor: color }]}
      accessibilityRole="text"
      accessibilityLabel={`오늘 ${label} ${done ? '기록함' : '기록 없음'}`}
    >
      <MaterialCommunityIcons
        name={icon}
        size={13}
        // 채워진 칩 위 글자색은 그 색의 휘도로 고른다 (다크의 파스텔 위 흰색은 1.55:1 이었다)
        color={done ? onColor(color) : colors.textMuted}
      />
      <Text style={[styles.todayLabel, done && { color: onColor(color) }]}>{label}</Text>
      <Text style={[styles.todayMark, done && { color: onColor(color) }]}>{done ? '✓' : '—'}</Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  /*
   * 남는 세로 공간을 <b>고르게</b> 나눈다.
   * 예전에는 히어로 전체를 가운데 정렬했더니 위 190px · 아래 209px 짜리
   * 큰 공백 두 개가 생겨 화면이 비어 보였다. space-evenly 로 두면 같은 여백이
   * 세 군데로 쪼개져 "의도된 여백"으로 읽힌다.
   */
  wrap: { flex: 1, alignItems: 'stretch', justifyContent: 'space-evenly' },

  ddayWrap: { alignItems: 'center' },
  ddayLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.caption,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dday: {
    color: colors.textPrimary,
    fontSize: 64,
    lineHeight: 74,
    fontWeight: '800',
    letterSpacing: -2,
    // 스크림이 충분히 불투명해 그림자 없이도 읽힌다 (본문 9.12:1 최악값)
  },
  ddaySince: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '600', marginTop: 2 },

  split: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.lg },
  // 두 열은 정확히 반씩 — 같은 항목이 좌우 같은 높이에 놓여야 비교가 된다
  column: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    minHeight: layout.touchTarget,
  },
  pressed: { opacity: 0.7 },

  // 가운데 경계 — 선 사이에 마크를 끼워 "둘"을 나타낸다
  divider: { width: 28, alignItems: 'center', alignSelf: 'stretch', paddingTop: 20 },
  dividerLine: { flex: 1, width: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  avatarRing: { borderWidth: 2.5, borderRadius: 999, padding: 3 },
  name: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '800', marginTop: spacing.xs },
  // 높이를 고정해 좌우 칩의 시작 높이를 맞춘다 (streak 유무와 무관)
  streakSlot: { height: 18, justifyContent: 'center' },
  streak: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '700' },

  todayBox: { alignSelf: 'stretch', gap: 4, marginTop: spacing.sm },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  todayLabel: { flex: 1, color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '700' },
  todayMark: { color: colors.textMuted, fontSize: fontSize.caption, fontWeight: '800' },

  latest: {
    color: colors.textPrimary,
    fontSize: fontSize.caption,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.sm,
    // 한쪽이 두 줄이어도 아래 시간 줄이 어긋나지 않게 두 줄분을 미리 잡는다
    minHeight: 34,
  },
  latestTime: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
}));
