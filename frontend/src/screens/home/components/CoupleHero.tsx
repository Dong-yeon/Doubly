/**
 * 홈 히어로 — 사진 <b>아래</b>에 놓이는 "우리" 패널.
 *
 * <p><b>2026-09-23 다시 짰다</b>(docs/SCREEN_DESIGN_PASS_2026-09-23.md §1, A 안). 예전에는
 * D+ 숫자·좌우 2열·최근 기록이 화면 전면에 퍼져 있었고, 그 글자들이 어디에 와도 읽히게
 * 하려고 사진 위에 흰 스크림을 84~97% 로 깔았다 — 결과적으로 "배경 사진 위의 우리 화면"인데
 * 사진이 안 보였다. 이제 글자는 <b>하단 한 구역</b>에만 모이고, 사진은 그 위에서 그대로 보인다.
 *
 * <p>구성(위에서부터):
 * <ul>
 *   <li>머리 — 겹친 아바타 둘 + 이름 둘, 오른쪽에 D+ (누르면 기념일 설정)</li>
 *   <li>오늘 — 사람마다 한 줄: 아바타(무드 배지) · 이름 · 최근 기록, 오른쪽에 운동/식단 버튼</li>
 * </ul>
 * 좌우 대칭 2열은 없앴다. 사람 구분은 아바타·이름·소유자 색으로 충분하고, 한쪽이 빈 날
 * 빈 자리를 예약해 두던 것(streakSlot·minHeight)도 함께 사라졌다. 줄은 <b>왼쪽 정렬</b>이다.
 *
 * <p><b>버튼은 형제 관계</b>다 — 줄 전체를 버튼으로 감싸고 그 안에 운동/식단 버튼을 두면
 * 웹에서 &lt;button&gt; 중첩이 된다(react-native-web 은 accessibilityRole="button" 을 진짜
 * &lt;button&gt; 으로 그린다). 줄은 View 이고, [사람 영역][운동][식단] 세 버튼이 나란히 놓인다.
 *
 * <p>순수 표현 컴포넌트다 — 스토어를 직접 읽지 않고 전부 props 로 받는다.
 */
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { Avatar } from '../../../components/Avatar';
import { HeartSproutIcon } from '../../../components/HeartSproutIcon';
import { formatDateLabel } from '../../../utils/date';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import { onColor } from '../../../theme/onColor';
import { layout } from '../../../theme/layout';

/** 한 사람의 오늘 — 한 줄에 들어가는 값 묶음 */
export interface PersonToday {
  name: string;
  imageUrl?: string | null;
  workoutDone: boolean;
  mealDone: boolean;
  streak: number;
  /** 그 사람의 가장 최근 기록 한 줄. 없으면 비운다(안내 문장을 상주시키지 않는다) */
  latestLabel?: string | null;
  latestTime?: string | null;
  /** 지금 무드(Obimy 벤치마킹, PLAN.md "무드 상태" 참고) — 있으면 아바타 모서리에 작은 배지로 */
  moodEmoji?: string | null;
  /**
   * 우리 이모지로 무드를 걸었으면 그 이미지 — 있으면 {@link moodEmoji} 대신 그린다(설계 메모 §18).
   * 상대가 그 이모지를 지우면 서버가 null 로 내려주므로 저절로 유니코드로 돌아간다.
   */
  moodImageUrl?: string | null;
}

export interface CoupleHeroProps {
  me: PersonToday;
  partner: PersonToday;
  /** 함께한 일수 (D+N) */
  dday: number;
  /** 기준 날짜 (YYYY-MM-DD) — 없으면 D+ 대신 "기념일 정하기"가 뜬다 */
  anniversaryDate?: string | null;
  onPressDday: () => void;
  /** 한 사람의 줄(아바타·이름·최근 기록)을 눌렀을 때 — 그 사람의 기록으로 이동 */
  onPressPerson?: (who: 'me' | 'partner') => void;
  /** 운동/식단 버튼을 눌렀을 때 — 그 종류의 기록 화면으로 이동 */
  onPressToday?: (who: 'me' | 'partner', kind: 'workout' | 'meal') => void;
}

export function CoupleHero({
  me,
  partner,
  dday,
  anniversaryDate,
  onPressDday,
  onPressPerson,
  onPressToday,
}: CoupleHeroProps) {
  return (
    <View style={styles.wrap}>
      {/* 머리 — 우리 둘 + D+. 전체가 기념일 설정 버튼이다 */}
      <Pressable
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
        onPress={onPressDday}
        accessibilityRole="button"
        accessibilityLabel={
          anniversaryDate ? `함께한 지 ${dday}일, ${formatDateLabel(anniversaryDate)}부터 — 기념일 바꾸기` : '기념일 정하기'
        }
      >
        <View style={styles.pair}>
          <View style={[styles.pairRing, { borderColor: colors.meFill }]}>
            <Avatar name={me.name} imageUrl={me.imageUrl} size={36} color={colors.meFill} />
          </View>
          <View style={[styles.pairRing, styles.pairSecond, { borderColor: colors.partnerFill }]}>
            <Avatar name={partner.name} imageUrl={partner.imageUrl} size={36} color={colors.partnerFill} />
          </View>
        </View>
        <View style={styles.headText}>
          <Text style={styles.names} numberOfLines={1}>
            {me.name}
            <Text style={styles.namesAnd}> & </Text>
            {partner.name}
          </Text>
          {anniversaryDate ? (
            <Text style={styles.since} numberOfLines={1}>
              {formatDateLabel(anniversaryDate)}부터
            </Text>
          ) : null}
        </View>
        {anniversaryDate ? (
          <Text style={styles.dday} allowFontScaling={false}>
            D+{dday}
          </Text>
        ) : (
          <View style={styles.ddaySet}>
            <MaterialCommunityIcons name="calendar-heart" size={16} color={colors.textSecondary} />
            <Text style={styles.ddaySetText}>기념일 정하기</Text>
          </View>
        )}
      </Pressable>

      {/* 오늘 — 사람마다 한 줄. 위가 나, 아래가 상대 */}
      <View style={styles.rows}>
        <PersonRow
          person={me}
          fill={colors.meFill}
          onPress={() => onPressPerson?.('me')}
          onPressToday={(kind) => onPressToday?.('me', kind)}
          mealHint="한 끼 기록하기"
        />
        <PersonRow
          person={partner}
          fill={colors.partnerFill}
          onPress={() => onPressPerson?.('partner')}
          onPressToday={(kind) => onPressToday?.('partner', kind)}
        />
      </View>
    </View>
  );
}

/** 한 사람의 오늘 한 줄 — [아바타·이름·최근 기록] [운동] [식단], 버튼 셋이 형제다 */
function PersonRow({
  person,
  fill,
  onPress,
  onPressToday,
  mealHint,
}: {
  person: PersonToday;
  /** 그 사람의 채움색 — 완료 버튼·아바타 채움 */
  fill: string;
  onPress: () => void;
  onPressToday: (kind: 'workout' | 'meal') => void;
  /** 식단 버튼이 하는 일이 다를 때(내 줄은 기록 시트가 열린다) 접근성 힌트 */
  mealHint?: string;
}) {
  const meta = [person.latestLabel, person.latestTime].filter(Boolean).join(' · ');
  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.person, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}님의 기록 보기`}
      >
        <View>
          <Avatar name={person.name} imageUrl={person.imageUrl} size={40} color={fill} />
          {person.moodEmoji ? (
            <View style={styles.moodBadge}>
              {person.moodImageUrl ? (
                <Image source={{ uri: person.moodImageUrl }} style={styles.moodBadgeImage} resizeMode="contain" />
              ) : (
                <Text style={styles.moodBadgeEmoji}>{person.moodEmoji}</Text>
              )}
            </View>
          ) : null}
        </View>
        <View style={styles.personText}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>
              {person.name}
            </Text>
            {person.streak > 0 ? (
              <View style={styles.streak}>
                <HeartSproutIcon size={13} />
                <Text style={styles.streakText}>{person.streak}일</Text>
              </View>
            ) : null}
          </View>
          {/* 기록이 없으면 줄을 비운다 — "아직 기록이 없어요"를 상주시키지 않는다 */}
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <TodayButton
        icon="dumbbell"
        label="운동"
        done={person.workoutDone}
        fill={fill}
        hint={`${person.name} 운동 기록`}
        onPress={() => onPressToday('workout')}
      />
      <TodayButton
        icon="silverware-fork-knife"
        label="식단"
        done={person.mealDone}
        fill={fill}
        hint={mealHint ?? `${person.name} 식단 기록`}
        onPress={() => onPressToday('meal')}
      />
    </View>
  );
}

/**
 * 오늘의 한 종류 — 했으면 사람 색으로 채운 원, 아니면 빈 원. 44px 터치 타깃.
 * 상태는 채움/비움 <b>형태</b>로만 말한다 — "✓ / —" 같은 글자 기호는 쓰지 않는다.
 */
function TodayButton({
  icon,
  label,
  done,
  fill,
  hint,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  done: boolean;
  fill: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.today, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${done ? '기록함' : '기록 없음'}`}
      accessibilityHint={hint}
    >
      <View style={[styles.todayCircle, done ? { backgroundColor: fill, borderColor: fill } : null]}>
        <MaterialCommunityIcons name={icon} size={18} color={done ? onColor(fill) : colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  wrap: { gap: spacing.sm },
  pressed: { opacity: 0.7 },

  // ── 머리 ──
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: layout.touchTarget },
  // 겹친 아바타 둘 — 뒤가 상대. 링은 소유자 채움색, 배경색 테두리로 서로 떼어 놓는다
  pair: { flexDirection: 'row', alignItems: 'center' },
  pairRing: { borderWidth: 2, borderRadius: radius.full, padding: 1, backgroundColor: colors.background },
  pairSecond: { marginLeft: -12 },
  headText: { flex: 1, minWidth: 0 },
  names: { color: colors.textPrimary, fontSize: fontSize.subtitle, fontWeight: '800', lineHeight: 22 },
  namesAnd: { color: colors.textMuted, fontWeight: '600' },
  since: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '600', marginTop: 1 },
  dday: { color: colors.textPrimary, fontSize: fontSize.title, fontWeight: '800', letterSpacing: -0.5 },
  ddaySet: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ddaySetText: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '700' },

  // ── 오늘 ──
  rows: { gap: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  person: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: layout.touchTarget },
  personText: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '700', flexShrink: 1 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  streakText: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: fontSize.caption, marginTop: 1 },

  // 무드 배지 — 아바타 오른쪽 아래. 배경색 테두리로 아바타에서 떼어 놓는다
  moodBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodBadgeEmoji: { fontSize: fontSize.micro, lineHeight: 13 },
  moodBadgeImage: { width: 18, height: 18, borderRadius: 9 },

  today: { width: layout.touchTarget, height: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  todayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
