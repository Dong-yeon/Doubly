/**
 * 홈 아바타 링에 비스듬히 씌우는 럽슐랭 왕관 — "오늘 럽슐랭에 기록했다" / "막 등극했다"(서버 규칙: LovelichelinPulseService).
 *
 * <p><b>왜 이름 옆이 아니라 아바타 위인가</b>(2026-10-02 두 번째 판): 이름 옆 작은 왕관은 스트릭처럼 <b>상태</b>로 읽혔다 —
 * 늘 붙어 있는 배지. 이 신호는 "방금 무슨 일이 있었다"는 <b>사건</b>이라, 사람 위에 내려앉는 모양이 그 뜻을 말한다.
 * 결정 기록: docs/HOME_RECORD_AND_CROWN_2026-10-02.md §3·§4.
 *
 * <ul>
 *   <li>자리 — 링의 <b>왼쪽 위(10시 반)</b>에 걸쳐 -22° 기울인다. 모자를 비스듬히 쓴 모양이고, 무드 배지(오른쪽 아래)와
 *       대각선으로 마주 본다. 나·상대 열 모두 같은 자리다. 열 안에서 절대 위치라 열 높이를 늘리지 않는다.
 *       (셋째 판, 2026-10-02 — 위쪽 가운데는 정수리에 똑바로 올린 장식처럼 보였다. 비스듬히 걸쳐야 "썼다"로 읽힌다)</li>
 *   <li>색 — 두 상태 모두 lovelichelinGold. 오늘 기록에 쓰던 togetherText(초록)는 PRO 왕관(primary)·상대 색(partnerFill)과
 *       같은 초록 계열이라 무엇의 표시인지 흐려졌다(셋째 판). 등극은 색이 아니라 <b>반짝임 길이</b>와 말풍선 문구로 가른다.
 *       금색은 '나' 아바타 채움(meFill)과 대비가 1.05~1.7 이라 색으로는 안 갈린다 — 배경색 외곽선(같은 왕관을 한 겹 크게
 *       뒤에 깐다)이 경계를 만든다(왕관/외곽선 대비 라이트 3.12·다크 10.08, verify:theme).</li>
 *   <li>연출 — 이 기기에서 <b>처음 보는 신호</b>(signalKey)일 때만 왼쪽 위에서 대각선으로 내려앉으며 한 번 반짝인다.
 *       등극은 반짝임이 길다. 내 신호면 햅틱 한 번. 동작 줄이기면 움직이지 않고 바로 보인다. 루프 없음. 끝까지 돈 뒤에만
 *       '봤음'으로 적는다(화면이 가려져 프레임이 안 돌면 아무도 못 본 연출이 '봤음'이 되므로). 본 기록을 못 읽으면 연출하지 않는다.</li>
 *   <li>탭 — 왕관 바로 아래, 아바타 아래쪽 위에 말풍선 "장소명 ★N · 오늘"(콘텐츠는 "제목 ★N")을 3초 보여 준다. 누르면 상세로.
 *       (넷째 손질, 2026-10-03 — 아바타 위에 띄우면 D+ 블록의 "기념일 정하기"·"…부터" 줄을 가렸다. 그 블록은 기념일 유무로
 *       높이·폭이 바뀌어 위쪽엔 비는 자리가 없다. 아바타 위라면 가리는 글자가 없다 — 3초 동안 얼굴 아래쪽과 무드 배지만 덮는다)</li>
 *       왕관 터치는 hitSlop 이 아니라 <b>실제 44×44 상자</b>다 — 겹친 아바타 버튼보다 위에 그려져, 그 상자 안의 탭은 왕관만 받는다.</li>
 * </ul>
 *
 * <p>아이콘은 서브셋에 이미 있는 crown 하나다 — 새 글리프는 폰트(fingerprint 입력)를 바꿔 업데이트가 막힌다.
 * 반짝임은 글리프가 아니라 뒤에 깐 원(View)으로 그린다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { USE_NATIVE_DRIVER } from '../../../hooks/useOneShotMotion';
import { isFirstSight, markSeen } from '../../../utils/lovelichelinSeen';
import { haptics } from '../../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../../constants/theme';
import { themedStyles } from '../../../theme/themedStyles';
import type { LovelichelinSignal } from '../../../types';

/** 왕관 글리프 크기 — 아바타 56 기준 */
export const CROWN_SIZE = 25;
/** 배경색 외곽선 두께 — 같은 왕관을 이만큼 크게 뒤에 깐다 */
const OUTLINE = 2;
/** 터치 상자 — 글리프(25)를 가운데 둔 44×44. hitSlop 대신 실제 크기라 겹친 아바타 버튼과 다투지 않는다 */
const TOUCH = 44;
/** 기울기 — 모자를 비스듬히 쓴 각도(-20~-25°) */
const TILT = '-22deg';
/** 링 위 자리 — 10시 반(왼쪽 위 45°). 링 선 위에 왕관 중심이 걸린다 */
const DIAGONAL = Math.SQRT1_2;
/** 내려앉기 출발점 — 새 자리 기준 왼쪽 위에서 대각선으로 */
const ENTER_FROM = { x: -12, y: -16 };
const BUBBLE_MS = 3000;

type Phase = 'pending' | 'shown' | 'entering';

interface Props {
  signal: LovelichelinSignal;
  /** 왕관 주인 이름 — 접근성 라벨용 */
  ownerName: string;
  /** 내 신호면 처음 볼 때 햅틱 한 번 */
  mine: boolean;
  /** 말풍선을 눌렀다 — 상세로 */
  onOpen: () => void;
  /** 링 바깥 지름 — 오늘 챙김 링이면 68, 예전 테두리 링이면 64. 왕관이 이 원 위 10시 반에 걸린다 */
  ringSize?: number;
}

/** 말풍선 문구 — "장소명 ★N · 오늘" / 콘텐츠 "제목 ★N" / 등극 "장소명 · 럽슐랭 N스타". 별점이 없으면 별을 뺀다 */
export function crownBubbleText(s: LovelichelinSignal): string {
  if (s.state === 'CERTIFIED') return `${s.targetName} · 럽슐랭 ${s.tier}스타`;
  const stars = s.rating ? ` ★${s.rating}` : '';
  return s.kind === 'PLACE' ? `${s.targetName}${stars} · 오늘` : `${s.targetName}${stars}`;
}

/** 링 위 10시 반 점 — 열 위쪽 가운데(링 중심의 x, 링 위 끝의 y)를 원점으로 잰다 */
export function crownCenter(ringSize: number): { x: number; y: number } {
  const r = ringSize / 2;
  return { x: Math.round(-r * DIAGONAL), y: Math.round(r - r * DIAGONAL) };
}

export function AvatarCrown({ signal, ownerName, mine, onOpen, ringSize = 68 }: Props) {
  const certified = signal.state === 'CERTIFIED';
  // 두 상태 모두 금색 — 등극은 반짝임 길이와 말풍선 문구로 가른다(파일 상단 주석)
  const tint = colors.lovelichelinGold;
  const key = signal.signalKey ?? (certified ? signal.certificationKey : null) ?? null;
  const center = crownCenter(ringSize);
  /*
   * 말풍선 위 끝 — 왕관 글리프 아래 끝 바로 밑. 왕관은 가리지 않고, 터치 상자 아래 7pt 정도와는 겹친다:
   * 말풍선이 떠 있는 3초 동안 그 띠의 탭은 말풍선(상세)이 받는다 — 글리프 밖이라 왕관을 노린 탭이 아니다.
   */
  const bubbleTop = center.y + CROWN_SIZE / 2 + OUTLINE;

  const [phase, setPhase] = useState<Phase>('pending');
  const [drop] = useState(() => new Animated.Value(ENTER_FROM.y));
  const [slide] = useState(() => new Animated.Value(ENTER_FROM.x));
  const [scale] = useState(() => new Animated.Value(0.6));
  const [opacity] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const decided = useRef<string | null>(null);

  const showStill = () => {
    drop.setValue(0);
    slide.setValue(0);
    scale.setValue(1);
    opacity.setValue(1);
    glow.setValue(0);
    setPhase('shown');
  };

  useEffect(() => {
    const token = key ?? `no-key:${signal.state}:${signal.targetId}`;
    if (decided.current === token) return;
    decided.current = token;
    let alive = true;
    // 처음 보는지 + 동작 줄이기를 <b>지금</b> 묻는다(훅은 false 로 시작해 늦게 바뀐다). 둘 다 응답 콜백에서만 상태를 바꾼다
    void Promise.all([
      key ? isFirstSight(key) : Promise.resolve(false),
      AccessibilityInfo.isReduceMotionEnabled().catch(() => true),
    ]).then(([first, reduced]) => {
      if (!alive) return;
      if (!first || !key) {
        showStill();
        return;
      }
      if (mine) haptics.light();
      if (reduced) {
        showStill();
        void markSeen(key);
        return;
      }
      setPhase('entering');
      const ease = Easing.out(Easing.cubic);
      Animated.sequence([
        // ① 내려앉기 — 왼쪽 위에서 대각선으로 떨어지며 살짝 커졌다 제자리
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(drop, { toValue: 0, duration: 380, easing: Easing.out(Easing.back(1.6)), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(slide, { toValue: 0, duration: 380, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.12, duration: 300, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(scale, { toValue: 1, duration: 140, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
        ]),
        // ② 반짝임 한 번 — 등극은 길게(두 박자). 색이 같아졌으니 두 상태를 가르는 건 이 길이와 말풍선 문구다
        certified
          ? Animated.sequence([
              Animated.timing(glow, { toValue: 1, duration: 260, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
              Animated.timing(glow, { toValue: 0.45, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
              Animated.timing(glow, { toValue: 1, duration: 220, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
              Animated.timing(glow, { toValue: 0, duration: 420, useNativeDriver: USE_NATIVE_DRIVER }),
            ])
          : Animated.sequence([
              Animated.timing(glow, { toValue: 1, duration: 200, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
              Animated.timing(glow, { toValue: 0, duration: 260, useNativeDriver: USE_NATIVE_DRIVER }),
            ]),
      ]).start(({ finished }) => {
        if (!finished) return; // 끊기면 다음에 다시 — '봤음'은 끝까지 돈 뒤에만
        void markSeen(key);
        /*
         * 끝 자세를 값으로 못 박는다 — 앞선 연출이 가려진 화면에서 멈춰 있다가 뒤늦게 프레임을 받으면 마지막 값이 1.12 로
         * 남는 것을 웹 검증에서 봤다(2026-10-02). 연출이 끝나면 언제나 제자리·제 크기다.
         */
        if (alive) showStill();
      });
    });
    return () => {
      alive = false;
    };
    // showStill 은 Animated.Value 만 만진다 — 열쇠가 바뀔 때만 다시 정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, signal.state, signal.targetId, mine]);

  // 말풍선 — 3초 뒤 저절로 접힌다
  const [bubble, setBubble] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const toggleBubble = () => {
    if (timer.current) clearTimeout(timer.current);
    if (bubble) {
      setBubble(false);
      return;
    }
    setBubble(true);
    timer.current = setTimeout(() => setBubble(false), BUBBLE_MS);
  };

  const text = crownBubbleText(signal);
  const label = certified
    ? `${signal.targetName} 럽슐랭 ${signal.tier}스타 등극 — 눌러서 내용 보기`
    : `${ownerName}님이 오늘 럽슐랭에 기록했어요 — 눌러서 내용 보기`;

  return (
    <>
      {/* 말풍선 — 왕관 바로 아래, 아바타 위에 가운데 정렬. 위쪽 D+ 블록·아래쪽 이름·무드 한마디를 가리지 않는다 */}
      <View style={[styles.bubbleLayer, { top: bubbleTop }]} pointerEvents="box-none">
        {bubble ? (
          <Pressable
            style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}
            onPress={() => {
              if (timer.current) clearTimeout(timer.current);
              setBubble(false);
              onOpen();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${text} — 상세 보기`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.bubbleText} numberOfLines={1}>
              {text}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {/* 왕관 — 링 10시 반. 44×44 터치 상자 가운데에 글리프. 열의 위쪽 가운데(left 50%)에서 margin 으로 옮긴다 */}
      <Pressable
        onPress={toggleBubble}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.touch,
          { top: center.y - TOUCH / 2, marginLeft: center.x - TOUCH / 2 },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.crownBox}>
          {phase === 'entering' ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.glow,
                {
                  backgroundColor: tint,
                  opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, certified ? 0.55 : 0.4] }),
                  transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, certified ? 1.9 : 1.6] }) }],
                },
              ]}
            />
          ) : null}
          <Animated.View
            style={[
              styles.crownBox,
              {
                opacity: phase === 'pending' ? 0 : opacity,
                transform: [{ translateX: slide }, { translateY: drop }, { rotate: TILT }, { scale }],
              },
            ]}
          >
            {/* 외곽선 — 같은 왕관을 배경색으로 한 겹 크게. 금색 아바타(meFill) 위에서도 모양이 선다 */}
            <MaterialCommunityIcons name="crown" size={CROWN_SIZE + OUTLINE * 2} color={colors.background} style={styles.outline} />
            <MaterialCommunityIcons name="crown" size={CROWN_SIZE} color={tint} />
          </Animated.View>
        </View>
      </Pressable>
    </>
  );
}

const styles = themedStyles((colors) => ({
  /*
   * 왕관 터치 상자 — 열 기준 절대 위치(열 높이에 안 든다). left 50% 가 열 가운데(= 링 중심 x)이고, top·marginLeft 로
   * 10시 반 자리까지 옮긴다(렌더에서 계산). 아바타 버튼 다음에 오는 형제라 위에 그려지고(zIndex·elevation), 그래서
   * 이 상자 안의 탭은 아바타("기록 보기")가 아니라 왕관이 받는다.
   */
  touch: {
    position: 'absolute',
    left: '50%',
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    elevation: 3,
  },
  crownBox: { width: CROWN_SIZE + OUTLINE * 2, height: CROWN_SIZE + OUTLINE * 2, alignItems: 'center', justifyContent: 'center' },
  outline: { position: 'absolute' },
  glow: { position: 'absolute', width: CROWN_SIZE, height: CROWN_SIZE, borderRadius: CROWN_SIZE / 2 },
  // 말풍선 층 — 열 기준 절대 위치, top 은 렌더에서(왕관 아래 끝). 가운데 정렬이라 링 중심 아래에 온다
  bubbleLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 4,
    elevation: 4,
  },
  /*
   * 말풍선 — 이름이 길면 말줄임. 폭 상한 150: 아바타 높이에 뜨므로 두 열 사이 하트(화면 가운데 16pt)를 비켜야 한다 —
   * 360dp 에서 160 이면 하트 가장자리를 3pt 덮었다. 화면 가장자리 쪽은 20pt 남는다. 200 이었을 때 375pt(iPhone SE)에서
   * 왼쪽 끝이 화면에 거의 붙었다(2026-10-02 웹 확인).
   */
  bubble: {
    maxWidth: 150,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  pressed: { opacity: 0.7 },
}));
