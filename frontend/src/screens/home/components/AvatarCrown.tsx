/**
 * 홈 아바타 링 위에 씌우는 럽슐랭 왕관 — "오늘 럽슐랭에 기록했다" / "막 등극했다"(서버 규칙: LovelichelinPulseService).
 *
 * <p><b>왜 이름 옆이 아니라 아바타 위인가</b>(2026-10-02 두 번째 판): 이름 옆 작은 왕관은 스트릭처럼 <b>상태</b>로 읽혔다 —
 * 늘 붙어 있는 배지. 이 신호는 "방금 무슨 일이 있었다"는 <b>사건</b>이라, 사람 위에 내려앉는 모양이 그 뜻을 말한다.
 * 결정 기록: docs/HOME_RECORD_AND_CROWN_2026-10-02.md §3.
 *
 * <ul>
 *   <li>자리 — 링 위쪽 가운데, 약 -12° 기울여 링과 반쯤 겹친다(썼다). 무드 배지(오른쪽 아래)와 떨어져 있다.
 *       열 안에서 절대 위치라 열 높이를 늘리지 않는다 — 홈 한 화면 고정 레이아웃을 건드리지 않는다.</li>
 *   <li>색 — 오늘 기록 = togetherText, 등극 = lovelichelinGold. 둘 다 PRO 왕관(primary 계열)과 갈린다(verify:theme 가 본다).</li>
 *   <li>연출 — 이 기기에서 <b>처음 보는 신호</b>(signalKey)일 때만 위에서 내려앉으며 한 번 반짝인다. 등극은 반짝임이 길다.
 *       내 신호면 햅틱 한 번. 동작 줄이기면 움직이지 않고 바로 보인다. 루프 없음. 끝까지 돈 뒤에만 '봤음'으로 적는다
 *       (화면이 가려져 프레임이 안 돌면 아무도 못 본 연출이 '봤음'이 되므로). 본 기록을 못 읽으면 연출하지 않는다.</li>
 *   <li>탭 — 아바타 위에 말풍선 "장소명 ★N · 오늘"(콘텐츠는 "제목 ★N")을 3초 보여 준다. 말풍선을 누르면 상세로.</li>
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

/** 왕관 글리프 크기 — 아바타 56 기준 22~24 */
export const CROWN_SIZE = 23;
/** 링 위쪽 가장자리에서 왕관 중심이 걸리는 자리 — 절반쯤 겹친다 */
const CROWN_TOP = -Math.round(CROWN_SIZE * 0.55);
/** 터치 44pt — 글리프(23)에 사방 hitSlop */
const HIT = Math.ceil((44 - CROWN_SIZE) / 2);
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
}

/** 말풍선 문구 — "장소명 ★N · 오늘" / 콘텐츠 "제목 ★N" / 등극 "장소명 · 럽슐랭 N스타". 별점이 없으면 별을 뺀다 */
export function crownBubbleText(s: LovelichelinSignal): string {
  if (s.state === 'CERTIFIED') return `${s.targetName} · 럽슐랭 ${s.tier}스타`;
  const stars = s.rating ? ` ★${s.rating}` : '';
  return s.kind === 'PLACE' ? `${s.targetName}${stars} · 오늘` : `${s.targetName}${stars}`;
}

export function AvatarCrown({ signal, ownerName, mine, onOpen }: Props) {
  const certified = signal.state === 'CERTIFIED';
  const tint = certified ? colors.lovelichelinGold : colors.togetherText;
  const key = signal.signalKey ?? (certified ? signal.certificationKey : null) ?? null;

  const [phase, setPhase] = useState<Phase>('pending');
  const [drop] = useState(() => new Animated.Value(-CROWN_SIZE));
  const [scale] = useState(() => new Animated.Value(0.6));
  const [opacity] = useState(() => new Animated.Value(0));
  const [glow] = useState(() => new Animated.Value(0));
  const decided = useRef<string | null>(null);

  const showStill = () => {
    drop.setValue(0);
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
        // ① 내려앉기 — 위에서 떨어지며 살짝 커졌다 제자리
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.timing(drop, { toValue: 0, duration: 380, easing: Easing.out(Easing.back(1.6)), useNativeDriver: USE_NATIVE_DRIVER }),
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.12, duration: 300, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
            Animated.timing(scale, { toValue: 1, duration: 140, easing: ease, useNativeDriver: USE_NATIVE_DRIVER }),
          ]),
        ]),
        // ② 반짝임 한 번 — 등극은 길게(두 박자)
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
        if (alive) setPhase('shown');
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
    <View style={styles.layer} pointerEvents="box-none">
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
      <Pressable
        onPress={toggleBubble}
        hitSlop={{ top: HIT, bottom: HIT, left: HIT, right: HIT }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
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
            style={{
              opacity: phase === 'pending' ? 0 : opacity,
              transform: [{ translateY: drop }, { rotate: '-12deg' }, { scale }],
            }}
          >
            <MaterialCommunityIcons name="crown" size={CROWN_SIZE} color={tint} style={styles.glyph} />
          </Animated.View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  // 열 위쪽에 겹쳐 놓는 층 — 열 높이에 들어가지 않는다(absolute)
  layer: { position: 'absolute', top: CROWN_TOP, left: 0, right: 0, alignItems: 'center', zIndex: 2, elevation: 2 },
  crownBox: { width: CROWN_SIZE, height: CROWN_SIZE, alignItems: 'center', justifyContent: 'center' },
  // 링 색 위에서도 윤곽이 서도록 배경색 테두리를 두른다(글리프 그림자)
  glyph: { textShadowColor: colors.background, textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  glow: { position: 'absolute', width: CROWN_SIZE, height: CROWN_SIZE, borderRadius: CROWN_SIZE / 2 },
  /*
   * 말풍선 — 왕관 바로 위, 열 가운데. 이름이 길면 말줄임.
   * 폭 상한 160: 왼쪽 열의 중심이 360dp 기기에서 화면 왼쪽 끝에서 약 93pt 라(열 폭 146), 반폭 80 이면 가장자리에
   * 13pt 가 남는다. 200 이었을 때 375pt(iPhone SE)에서 왼쪽 끝이 화면에 거의 붙었다(2026-10-02 웹 확인).
   */
  bubble: {
    position: 'absolute',
    bottom: CROWN_SIZE + spacing.xs,
    maxWidth: 160,
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
