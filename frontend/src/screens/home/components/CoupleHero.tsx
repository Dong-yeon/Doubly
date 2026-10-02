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
 * [아바타(무드 배지·위에 럽슐랭 왕관) · 이름·스트릭 / 운동·식단 / 최근 기록]. 왼쪽이 나, 오른쪽이 상대.
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
import { AvatarCrown } from './AvatarCrown';
import { TodayRing, todayRingLabel, type TodaySlices } from './TodayRing';
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
  /**
   * 무드와 함께 남긴 "상대에게 한마디"(20자). 이름 아래 한 줄 말풍선으로 보인다.
   * 예전에는 피커가 받고 서버가 저장했는데 앱 어디에도 그리지 않아, 쓴 말이 상대에게 닿지 않았다
   * (docs/daily-mood-current-state.md §8-7).
   */
  moodMessage?: string | null;
  /** 럽슐랭 왕관 신호 — 오늘 기록했거나 막 등극했으면 아바타 링 위에 씌운다(AvatarCrown). 없으면 아무것도 없다 */
  crown?: LovelichelinSignal | null;
  /**
   * 오늘 챙김 — 아침·점심·저녁·운동(LOVEBODY_REVIEW §2-2). 있으면 아바타 둘레에 네 조각 링을 그린다.
   * 없으면(구서버라 상대 끼니 종류를 모를 때) 예전처럼 소유자 색 테두리만.
   */
  today?: TodaySlices | null;
  /** 오늘 간식을 남겼는가 — 조각은 없고(4조각 고정) 스크린리더 문장에만 들어간다 */
  snack?: boolean;
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
  /** 아바타 위 럽슐랭 왕관의 말풍선을 눌렀을 때 — 그 장소·콘텐츠 상세로 */
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
          ringColor={colors.me}
          onPress={() => onPressPerson?.('me')}
          onPressToday={(kind) => onPressToday?.('me', kind)}
          onPressCrown={() => onPressCrown?.('me')}
          mine
          mealHint="한 끼 기록하기"
        />
        <View style={styles.link} importantForAccessibility="no-hide-descendants">
          <HeartSproutIcon size={16} />
        </View>
        <PersonColumn
          person={partner}
          fill={colors.partnerFill}
          ringColor={colors.partner}
          onPress={() => onPressPerson?.('partner')}
          onPressToday={(kind) => onPressToday?.('partner', kind)}
          onPressCrown={() => onPressCrown?.('partner')}
        />
      </View>
    </View>
  );
}

/**
 * 한 사람의 열 — [아바타·이름] 버튼 아래에 [운동][식단] 버튼, 그 아래 최근 기록 한 줄. 버튼은 형제다.
 *
 * <p>럽슐랭 왕관(AvatarCrown)은 아바타 버튼 <b>안이 아니라</b> 열 맨 끝의 형제로, 링 위에 절대 위치로 겹친다 —
 * 버튼 안 버튼(웹 마크업 오류, npm run verify:nested-buttons)을 피하고, 열 높이도 늘리지 않는다.
 */
function PersonColumn({
  person,
  fill,
  ringColor,
  onPress,
  onPressToday,
  onPressCrown,
  mine = false,
  mealHint,
}: {
  person: PersonToday;
  /** 그 사람의 채움색 — 완료 버튼·(링이 없을 때의) 아바타 테두리 */
  fill: string;
  /** 오늘 챙김 링의 채운 조각 색 — 진한 소유자 값(연한 fill 은 배경 대비 미달) */
  ringColor: string;
  onPress: () => void;
  onPressToday: (kind: 'workout' | 'meal') => void;
  onPressCrown: () => void;
  /** 내 열인가 — 왕관이 처음 내려앉을 때 햅틱은 내 신호에만 */
  mine?: boolean;
  /** 식단 버튼이 하는 일이 다를 때(내 쪽은 기록 시트가 열린다) 접근성 힌트 */
  mealHint?: string;
}) {
  const meta = [person.latestLabel, person.latestTime].filter(Boolean).join(' · ');
  const moodNote = person.moodMessage?.trim() || null;
  return (
    <View style={styles.column}>
      <Pressable
        style={({ pressed }) => [styles.person, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${person.name}님의 기록 보기${person.today ? `. ${todayRingLabel(person.today, !!person.snack)}` : ''}${moodNote ? `. 한마디: ${moodNote}` : ''}`}
      >
        {/*
          오늘 챙김 링 — 바깥 68(예전 테두리 링 64). 아바타 56 은 그대로, 링과 사이에 배경색 틈 2.
          링이 없으면(구서버) 예전 소유자 색 테두리.
        */}
        <View style={person.today ? styles.avatarRingToday : [styles.avatarRing, { borderColor: fill }]}>
          {person.today ? (
            <TodayRing slices={person.today} color={ringColor} size={AVATAR_RING}>
              <Avatar name={person.name} imageUrl={person.imageUrl} size={56} color={fill} />
            </TodayRing>
          ) : (
            <Avatar name={person.name} imageUrl={person.imageUrl} size={56} color={fill} />
          )}
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
        {/* 긴 이름은 이름이 먼저 말줄임된다 — 스트릭은 줄어들지 않는다(styles.streak flexShrink 0) */}
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
        {moodNote ? (
          <View style={styles.moodNote}>
            <Text style={styles.moodNoteText} numberOfLines={1}>
              {moodNote}
            </Text>
          </View>
        ) : null}
      </Pressable>

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

      {/*
        럽슐랭 왕관 — 링 위쪽 가운데에 씌운다. 열의 마지막 자식이라 위에 그려지고, 절대 위치라 열 높이에 안 든다.
        이름 옆에 두었던 첫 판은 상태(배지)로 읽혔다 — 사건으로 보이게 사람 위로 올렸다(AvatarCrown 주석).
      */}
      {person.crown ? (
        <AvatarCrown signal={person.crown} ownerName={person.name} mine={mine} onOpen={onPressCrown} />
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

/** 오늘 챙김 링 바깥 지름 — 아바타 56 + 틈 2 + 굵은 조각 4, 양쪽 */
const AVATAR_RING = 68;

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
  // 두 열 사이 — 아바타 높이 가운데쯤에 하트(오늘 챙김 링 바깥 지름에 맞춘다)
  link: { width: 28, height: AVATAR_RING, alignItems: 'center', justifyContent: 'center' },
  column: { flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.xxs },
  person: { alignItems: 'center', gap: spacing.xs, minHeight: layout.touchTarget, maxWidth: '100%' },
  // 소유자 색 링 — 배경색 틈으로 아바타에서 떼어 놓는다
  avatarRing: { borderWidth: 2, borderRadius: radius.full, padding: 2, backgroundColor: colors.background },
  // 오늘 챙김 링 자리 — 배경색 원 위에 링을 그려 사진 배경 위에서도 조각이 읽히게
  avatarRingToday: { width: AVATAR_RING, height: AVATAR_RING, borderRadius: AVATAR_RING / 2, backgroundColor: colors.background },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '100%' },
  name: { color: colors.textPrimary, fontSize: fontSize.body, fontWeight: '800', flexShrink: 1 },
  // 줄어들지 않는다 — 좁으면 이름이 먼저 말줄임된다
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  streakText: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '700' },
  todayRow: { flexDirection: 'row', justifyContent: 'center' },
  meta: { color: colors.textSecondary, fontSize: fontSize.caption, textAlign: 'center', maxWidth: '100%' },

  // 무드 배지 — 아바타 오른쪽 아래. 배경색 테두리로 아바타에서 떼어 놓는다.
  // 오늘 챙김 링의 틈(4시 반)에 앉힌다 — 68 상자에서 배지 중심 (64,64), 링 중심에서 42.4. 배지(지름 24)가 링(반지름 32)을
  // 가리는 범위가 ±9.4° 로 틈(±8°)과 거의 같다. 예전 −4 면 ±18.5° 라 점심 끝·저녁 시작이 10° 씩 덮였다
  moodBadge: {
    position: 'absolute',
    right: -8,
    bottom: -8,
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
  // 무드 한마디 — 이름 아래 작은 말풍선. 20자라 한 줄이면 충분하고, 좁은 열에서는 말줄임
  moodNote: {
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  moodNoteText: { color: colors.textSecondary, fontSize: fontSize.caption, fontWeight: '600' },

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
