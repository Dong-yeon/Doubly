/**
 * 홈 히어로 — 사진 <b>아래</b> 패널의 "우리" 구역. 가운데 정렬이다.
 *
 * <p><b>이력</b>
 * <ul>
 *   <li>~2026-09-22: 가운데 큰 D+ 와 좌우 2열이 화면 <b>전면</b>에 퍼져 있었다. 그 글자들이 어느 사진 위에서도
 *       읽히게 하려고 사진에 흰 스크림을 84~97% 깔아서, 배경 사진이 거의 안 보였다.</li>
 *   <li>2026-09-23: 글자를 하단 패널로 모으고 왼쪽 정렬 한 줄씩으로 바꿨다(docs/SCREEN_DESIGN_PASS_2026-09-23.md §1 A 안).</li>
 *   <li><b>2026-09-28: 가운데 배치로 되돌렸다</b> — 동연님 판단: "상태가 가운데 있는 게 더 좋았다". 대신 9/23 에 고친 것은
 *       남긴다: 글자는 여전히 <b>하단 패널 안</b>에만 있고(패널이 제 배경을 깐다 — HomeScreen 의 panelFade), 사진은
 *       그 위에서 그대로 보인다. 운동/식단은 44px 원 버튼이고 상태는 채움/비움으로만 말한다(✓·— 기호 없음),
 *       빈 자리 예약·상주 안내문도 없다.</li>
 * </ul>
 *
 * <p>구성(위에서부터): 함께한 지 · <b>D+n</b> · 기념일 날짜(누르면 기념일 설정) → 두 사람 좌우 열
 * [아바타(무드 배지) · 이름·스트릭(·럽슐랭 왕관) / 운동·식단 / 최근 기록]. 왼쪽이 나, 오른쪽이 상대.
 *
 * <p><b>버튼은 형제 관계</b>다 — 열 전체를 버튼으로 감싸고 그 안에 운동/식단 버튼을 두면
 * 웹에서 &lt;button&gt; 중첩이 된다(react-native-web 은 accessibilityRole="button" 을 진짜
 * &lt;button&gt; 으로 그린다). 열은 View 이고, [사람 영역] [운동] [식단] 버튼이 나란히 놓인다.
 *
 * <p>순수 표현 컴포넌트다 — 스토어를 직접 읽지 않고 전부 props 로 받는다.
 */
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { Avatar } from '../../../components/Avatar';
import { HeartSproutIcon } from '../../../components/HeartSproutIcon';
import { LovelichelinCrownSignal } from './LovelichelinCrownSignal';
import { formatDateLabel } from '../../../utils/date';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import { onColor } from '../../../theme/onColor';
import { layout } from '../../../theme/layout';
import type { LovelichelinSignal } from '../../../types';

/** 한 사람의 오늘 — 한 열에 들어가는 값 묶음 */
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
  /** 럽슐랭 왕관 신호 — 오늘 기록했거나 막 등극했으면. 없으면 이름 줄에 아무것도 없다(LovelichelinCrownSignal) */
  crown?: LovelichelinSignal | null;
}

export interface CoupleHeroProps {
  me: PersonToday;
  partner: PersonToday;
  /** 함께한 일수 (D+N) */
  dday: number;
  /** 기준 날짜 (YYYY-MM-DD) — 없으면 D+ 대신 "기념일 정하기"가 뜬다 */
  anniversaryDate?: string | null;
  onPressDday: () => void;
  /** 한 사람의 열(아바타·이름)을 눌렀을 때 — 그 사람의 기록으로 이동 */
  onPressPerson?: (who: 'me' | 'partner') => void;
  /** 운동/식단 버튼을 눌렀을 때 — 그 종류의 기록 화면으로 이동 */
  onPressToday?: (who: 'me' | 'partner', kind: 'workout' | 'meal') => void;
  /** 이름 옆 럽슐랭 왕관을 눌렀을 때 — 그 장소·콘텐츠 상세로 */
  onPressCrown?: (who: 'me' | 'partner') => void;
}

export function CoupleHero({
  me,
  partner,
  dday,
  anniversaryDate,
  onPressDday,
  onPressPerson,
  onPressToday,
  onPressCrown,
}: CoupleHeroProps) {
  return (
    <View style={styles.wrap}>
      {/* D+ — 가운데 크게. 전체가 기념일 설정 버튼이다 */}
      <Pressable
        style={({ pressed }) => [styles.ddayBlock, pressed && styles.pressed]}
        onPress={onPressDday}
        accessibilityRole="button"
        accessibilityLabel={
          anniversaryDate ? `함께한 지 ${dday}일, ${formatDateLabel(anniversaryDate)}부터 — 기념일 바꾸기` : '기념일 정하기'
        }
      >
        {anniversaryDate ? (
          <>
            <Text style={styles.together}>함께한 지</Text>
            <Text style={styles.dday} allowFontScaling={false}>
              D+{dday}
            </Text>
            <Text style={styles.since} numberOfLines={1}>
              {formatDateLabel(anniversaryDate)}부터
            </Text>
          </>
        ) : (
          <View style={styles.ddaySet}>
            <MaterialCommunityIcons name="calendar-heart" size={18} color={colors.textSecondary} />
            <Text style={styles.ddaySetText}>기념일 정하기</Text>
          </View>
        )}
      </Pressable>

      {/* 두 사람 — 왼쪽이 나, 오른쪽이 상대. 가운데 하트가 둘을 잇는다 */}
      <View style={styles.columns}>
        <PersonColumn
          person={me}
          fill={colors.meFill}
          onPress={() => onPressPerson?.('me')}
          onPressToday={(kind) => onPressToday?.('me', kind)}
          onPressCrown={() => onPressCrown?.('me')}
          mealHint="한 끼 기록하기"
        />
        <View style={styles.link} importantForAccessibility="no-hide-descendants">
          <HeartSproutIcon size={16} />
        </View>
        <PersonColumn
          person={partner}
          fill={colors.partnerFill}
          onPress={() => onPressPerson?.('partner')}
          onPressToday={(kind) => onPressToday?.('partner', kind)}
          onPressCrown={() => onPressCrown?.('partner')}
        />
      </View>
    </View>
  );
}

/**
 * 한 사람의 열 — [아바타] 버튼, [이름·스트릭(·왕관)] 줄, [운동][식단] 버튼, 최근 기록 한 줄. 버튼은 전부 형제다.
 *
 * <p>이름 줄은 아바타 버튼 <b>밖</b>에 있다(2026-10-02). 그 줄에 럽슐랭 왕관 버튼이 들어가는데, 아바타 버튼 안에 두면
 * 버튼 안 버튼이 된다(웹 마크업 오류 — npm run verify:nested-buttons). 이름을 눌러도 예전처럼 기록으로 가도록 이름·스트릭은
 * 같은 동작의 버튼으로 감싸되, 스크린리더에는 숨긴다 — 아바타 버튼의 라벨("○○님의 기록 보기")이 이미 그 말이다.
 */
function PersonColumn({
  person,
  fill,
  onPress,
  onPressToday,
  onPressCrown,
  mealHint,
}: {
  person: PersonToday;
  /** 그 사람의 채움색 — 완료 버튼·아바타 링 */
  fill: string;
  onPress: () => void;
  onPressToday: (kind: 'workout' | 'meal') => void;
  onPressCrown: () => void;
  /** 식단 버튼이 하는 일이 다를 때(내 쪽은 기록 시트가 열린다) 접근성 힌트 */
  mealHint?: string;
}) {
  const meta = [person.latestLabel, person.latestTime].filter(Boolean).join(' · ');
  return (
    <View style={styles.column}>
      <Pressable
        style={({ pressed }) => [styles.person, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}님의 기록 보기`}
      >
        <View style={[styles.avatarRing, { borderColor: fill }]}>
          <Avatar name={person.name} imageUrl={person.imageUrl} size={56} color={fill} />
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
      </Pressable>

      <View style={styles.nameLine}>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.nameTap, pressed && styles.pressed]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.name} numberOfLines={1}>
            {person.name}
          </Text>
          {person.streak > 0 ? (
            <View style={styles.streak}>
              <HeartSproutIcon size={13} />
              <Text style={styles.streakText}>{person.streak}일</Text>
            </View>
          ) : null}
        </Pressable>
        {/* 럽슐랭 왕관 — 스트릭 옆. PRO 왕관과 헷갈리지 않게 색·자리를 정해 두었다(컴포넌트 주석) */}
        {person.crown ? (
          <LovelichelinCrownSignal signal={person.crown} ownerName={person.name} onPress={onPressCrown} />
        ) : null}
      </View>

      <View style={styles.todayRow}>
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

      {/* 기록이 없으면 줄을 비운다 — "아직 기록이 없어요"를 상주시키지 않는다 */}
      {meta ? (
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
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
  wrap: { gap: spacing.md },
  pressed: { opacity: 0.7 },

  // ── D+ ──
  ddayBlock: { alignItems: 'center', justifyContent: 'center', minHeight: layout.touchTarget },
  together: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '700' },
  // 앱에서 가장 큰 숫자 — 첫눈에 읽히는 자리다. 글꼴 확대는 끈다(두 줄로 넘치지 않게)
  dday: { color: colors.textPrimary, fontSize: 52, fontWeight: '800', letterSpacing: -1.5, lineHeight: 60 },
  since: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '600' },
  ddaySet: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  ddaySetText: { color: colors.textSecondary, fontSize: fontSize.body, fontWeight: '700' },

  // ── 두 사람 ──
  // 넓은 화면(태블릿·가로 큰 폰)에서 두 열이 양 끝으로 벌어지지 않게 — 둘은 한 쌍으로 붙어 있어야 한다
  columns: { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'center', width: '100%', maxWidth: 400 },
  // 두 열 사이 — 아바타 높이 가운데쯤에 하트
  link: { width: 28, height: 64, alignItems: 'center', justifyContent: 'center' },
  column: { flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.xxs },
  person: { alignItems: 'center', gap: spacing.xs, minHeight: layout.touchTarget, maxWidth: '100%' },
  // 소유자 색 링 — 배경색 틈으로 아바타에서 떼어 놓는다
  avatarRing: { borderWidth: 2, borderRadius: radius.full, padding: 2, backgroundColor: colors.background },
  // 아바타 버튼 밖으로 나오면서 열의 gap(xxs)만 남았다 — 예전 버튼 안 간격(xs)에 맞춰 조금 띄운다
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%', marginTop: spacing.xs - spacing.xxs },
  nameTap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1, minWidth: 0 },
  name: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '800', flexShrink: 1 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  streakText: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '700' },
  todayRow: { flexDirection: 'row', justifyContent: 'center' },
  meta: { color: colors.textSecondary, fontSize: fontSize.caption, textAlign: 'center', maxWidth: '100%' },

  // 무드 배지 — 아바타 오른쪽 아래. 배경색 테두리로 아바타에서 떼어 놓는다
  moodBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodBadgeEmoji: { fontSize: fontSize.caption, lineHeight: 16 },
  moodBadgeImage: { width: 22, height: 22, borderRadius: 11 },

  today: { width: layout.touchTarget, height: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  todayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
