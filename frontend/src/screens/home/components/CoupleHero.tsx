/**
 * 홈 상단 히어로 — 배경 사진 위의 "우리" 영역.
 *
 * <p>스크림이 크림 기반이라 이 안의 색은 <b>테마색을 그대로 쓴다</b>.
 * 예전에는 검정 스크림 + 흰 글씨 고정이었다 (→ HomeScreen 의 SCRIM 주석).
 *
 * <p>예전에는 아바타 둘이 나란히 서고 그 아래 D+ 칩과 스트릭 숫자가 줄줄이 붙어
 * 대시보드처럼 읽혔다. 지금은 <b>D+ 숫자 하나</b>를 주인공으로 두고, 두 사람은
 * 살짝 겹쳐 세워 "함께"라는 인상을 준다. 나머지 수치는 한 줄 요약으로 눌러 담았다.
 *
 * <p>순수 표현 컴포넌트다 — 스토어를 직접 읽지 않고 전부 props 로 받는다.
 * 화면 없이도 미리보기·스냅샷을 찍을 수 있어야 하기 때문.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { Avatar } from '../../../components/Avatar';
import { DoublyMark } from '../../../components/DoublyLogo';
import { formatDateLabel } from '../../../utils/date';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';

export interface CoupleHeroProps {
  meName: string;
  meImageUrl?: string | null;
  meWorkoutDone: boolean;
  meMealDone: boolean;
  partnerName: string;
  partnerImageUrl?: string | null;
  partnerWorkoutDone: boolean;
  partnerMealDone: boolean;
  /** 함께한 일수 (D+N) */
  dday: number;
  /** 기준 날짜 (YYYY-MM-DD) — 없으면 날짜 줄을 생략한다 */
  anniversaryDate?: string | null;
  myStreak: number;
  partnerStreak: number;
  onPressDday: () => void;
}

/** "오늘 기록했다" = 운동·식단 중 하나라도. 둘 다여야 한다면 하루가 너무 자주 실패한다 */
function isActive(workoutDone: boolean, mealDone: boolean): boolean {
  return workoutDone || mealDone;
}

/** 오늘 상태 한 줄 — 숫자 나열 대신 지금 무슨 상황인지 문장으로 */
function todayLine(meDone: boolean, partnerDone: boolean, partnerName: string): string {
  if (meDone && partnerDone) return '오늘 둘 다 기록했어요 🔥';
  if (meDone) return `${partnerName}님의 기록을 기다리는 중`;
  if (partnerDone) return `${partnerName}님은 오늘 기록했어요`;
  return '오늘은 아직 조용해요';
}

export function CoupleHero({
  meName,
  meImageUrl,
  meWorkoutDone,
  meMealDone,
  partnerName,
  partnerImageUrl,
  partnerWorkoutDone,
  partnerMealDone,
  dday,
  anniversaryDate,
  myStreak,
  partnerStreak,
  onPressDday,
}: CoupleHeroProps) {
  const meActive = isActive(meWorkoutDone, meMealDone);
  const partnerActive = isActive(partnerWorkoutDone, partnerMealDone);
  return (
    <View style={styles.wrap}>
      {/* 주인공 — D+ 숫자 */}
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

      {/* 두 사람 — 살짝 겹쳐 세운다. 나=코랄 / 상대=인디고 */}
      <View style={styles.coupleRow}>
        <Face
          name={meName}
          imageUrl={meImageUrl}
          workoutDone={meWorkoutDone}
          mealDone={meMealDone}
          color={colors.coral}
          streak={myStreak}
        />
        <View style={styles.mark}>
          <DoublyMark size={22} />
        </View>
        <Face
          name={partnerName}
          imageUrl={partnerImageUrl}
          workoutDone={partnerWorkoutDone}
          mealDone={partnerMealDone}
          color={colors.indigo}
          streak={partnerStreak}
        />
      </View>

      <Text style={styles.todayLine}>{todayLine(meActive, partnerActive, partnerName)}</Text>
    </View>
  );
}

/**
 * 한 사람 — 아바타 + 오늘의 운동·식단.
 *
 * <p>좌우는 <b>나 / 상대</b>다(Duo Color System: 나=Gold·상대=Green).
 * 운동·식단은 그 축을 쓰지 않고 <b>각 사람 아래에 나란히</b> 놓는다.
 * 좌우를 종류에 또 쓰면 한 화면에서 좌우가 두 가지 뜻을 갖는다.
 *
 * <p>두 종류는 <b>아바타 하단 좌우 배지</b>로 얹는다. 이름 아래 별도 줄로 두면 세로를
 * 29px 더 먹는데, 홈은 스크롤 없는 고정 화면이라 360×640 같은 기기에서 히어로가 잘렸다
 * (측정값: 슬롯 314px vs 히어로 317px). 배지는 아바타 위에 겹치므로 높이 증가가 0이다.
 *
 * <p>아바타 링은 <b>하나라도</b> 했으면 켜진다.
 */
function Face({
  name,
  imageUrl,
  workoutDone,
  mealDone,
  color,
  streak,
}: {
  name: string;
  imageUrl?: string | null;
  workoutDone: boolean;
  mealDone: boolean;
  color: string;
  streak: number;
}) {
  const active = isActive(workoutDone, mealDone);
  return (
    <View style={styles.face}>
      <View style={[styles.avatarRing, { borderColor: active ? color : colors.border }]}>
        <Avatar name={name} imageUrl={imageUrl} size={62} color={color} />
        {/* 왼쪽=운동 · 오른쪽=식단. 아바타 위에 겹치므로 세로를 차지하지 않는다 */}
        <Track
          icon="dumbbell"
          label="운동"
          done={workoutDone}
          color={color}
          name={name}
          style={styles.trackLeft}
        />
        <Track
          icon="silverware-fork-knife"
          label="식단"
          done={mealDone}
          color={color}
          name={name}
          style={styles.trackRight}
        />
      </View>
      <Text style={styles.faceName} numberOfLines={1}>
        {name}
      </Text>
      {/* 연속 기록은 0일 때 숨긴다 — '0일'은 알려주는 정보가 없고 시선만 끈다 */}
      {streak > 0 ? <Text style={styles.faceStreak}>🔥 {streak}일</Text> : null}
    </View>
  );
}

/** 오늘의 한 종류 — 했으면 사람 색으로 채우고, 아니면 비운다 */
function Track({
  icon,
  label,
  done,
  color,
  name,
  style,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  done: boolean;
  color: string;
  name: string;
  style: object;
}) {
  return (
    <View
      style={[styles.track, style, done && { backgroundColor: color, borderColor: color }]}
      accessibilityRole="image"
      accessibilityLabel={`${name}님 오늘 ${label} ${done ? '기록함' : '기록 없음'}`}
    >
      <MaterialCommunityIcons
        name={icon}
        size={12}
        // 채워진 배지 위에는 흰색, 빈 배지는 크림 위라 흐린 텍스트색
        color={done ? colors.white : colors.textMuted}
      />
    </View>
  );
}

const styles = themedStyles((colors) => ({
  wrap: { paddingHorizontal: spacing.xs, alignItems: 'stretch' },


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

  coupleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  // 하트 마크가 두 얼굴 사이에 끼도록 좌우를 당긴다
  mark: { marginHorizontal: -spacing.xs, marginTop: 20 },
  face: { alignItems: 'center', width: 96 },
  avatarRing: { borderWidth: 2.5, borderRadius: 999, padding: 3 },
  faceName: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '800', marginTop: spacing.xs },

  // 오늘의 운동·식단 — 아바타 하단 좌우에 겹친다 (세로 증가 0)
  track: {
    position: 'absolute',
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    // 크림 스크림 위 — 배지가 아바타와 겹치므로 테두리는 배경색으로 오려낸다
    borderColor: colors.background,
    backgroundColor: colors.surfaceAlt,
  },
  trackLeft: { left: -2 },
  trackRight: { right: -2 },

  faceStreak: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '700', marginTop: 1 },

  todayLine: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
}));
