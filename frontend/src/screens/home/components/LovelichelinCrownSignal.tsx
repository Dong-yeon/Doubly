/**
 * 홈 이름 옆 럽슐랭 왕관 — "오늘 럽슐랭에 기록했다" / "막 등극했다"를 짧게 알린다(서버 규칙: LovelichelinPulseService).
 *
 * <p><b>PRO 왕관과 헷갈리지 않게</b> 정한 것(docs/HOME_RECORD_AND_CROWN_2026-10-02.md):
 * <ul>
 *   <li>자리 — 이름 줄, 스트릭 옆. 아바타 모서리(무드 배지 자리)나 운동/식단 줄(매일의 과제)이 아니다.</li>
 *   <li>색 — LovelichelinBadge 와 같은 {@code colors.togetherText}. PRO 왕관은 primary 계열이다.</li>
 *   <li>모양 — 글자 없이 작은 아이콘 하나. 뜻은 접근성 라벨과 누른 뒤 화면이 말한다.</li>
 * </ul>
 *
 * <p><b>반짝임</b>: 등극(CERTIFIED)을 이 기기에서 <b>처음 볼 때 한 번</b>만 — 커졌다 돌아오고 멈춘다(루프 없음).
 * "동작 줄이기"가 켜져 있거나 본 기록을 못 읽으면 반짝이지 않는다. RN Animated + native driver —
 * hooks/useOneShotMotion 과 같은 방식이다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '../../../components/Icon';
import { USE_NATIVE_DRIVER } from '../../../hooks/useOneShotMotion';
import { isFirstSight, markSeen } from '../../../utils/lovelichelinSeen';
import { colors } from '../../../constants/theme';
import type { LovelichelinSignal } from '../../../types';

interface Props {
  signal: LovelichelinSignal;
  /** 왕관 주인 이름 — 접근성 라벨용 */
  ownerName: string;
  onPress: () => void;
}

const SIZE = 14;

export function LovelichelinCrownSignal({ signal, ownerName, onPress }: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const played = useRef<string | null>(null);

  const certKey = signal.state === 'CERTIFIED' ? signal.certificationKey ?? null : null;

  useEffect(() => {
    if (!certKey || played.current === certKey) return;
    played.current = certKey;
    let alive = true;
    /*
     * 동작 줄이기는 <b>지금</b> 묻는다 — useReduceMotion 훅은 처음엔 false 로 시작해 나중에 바뀌므로, 그 사이에
     * 반짝임이 먼저 나가 버릴 수 있다. 묻지 못하면 줄인 것으로 친다(반짝이지 않는 쪽).
     */
    void Promise.all([
      isFirstSight(certKey),
      AccessibilityInfo.isReduceMotionEnabled().catch(() => true),
    ]).then(([first, reduced]) => {
      if (!alive || !first) return;
      // 동작 줄이기 — 반짝이지 않고 본 것으로만 적는다(같은 등극을 계속 "새것"으로 받지 않게)
      if (reduced) {
        void markSeen(certKey);
        return;
      }
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.5, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(scale, { toValue: 0.9, duration: 180, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(scale, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start(({ finished }) => {
        /*
         * 본 것으로 적는 건 <b>끝까지 반짝인 뒤</b>다. 화면이 가려져 있으면(웹 탭이 뒤에 있는 등) 애니메이션 프레임이
         * 돌지 않는데, 시작할 때 적어 버리면 아무도 못 본 반짝임이 "봤음"이 된다. 중간에 끊기면 다음에 다시 반짝인다.
         */
        if (finished) void markSeen(certKey);
      });
    });
    return () => {
      alive = false;
    };
  }, [certKey, scale]);

  const what = signal.kind === 'PLACE' ? '장소' : '콘텐츠';
  const label =
    signal.state === 'CERTIFIED'
      ? `${signal.targetName} 럽슐랭 ${signal.tier}스타 등극 — ${what} 보기`
      : `${ownerName}님이 오늘 럽슐랭에 기록했어요 — ${signal.targetName} 보기`;

  return (
    <Pressable
      onPress={onPress}
      // 아이콘은 작지만 누르는 자리는 넉넉하게 — 이름 줄 높이를 키우지 않고 hitSlop 으로 넓힌다
      hitSlop={{ top: 14, bottom: 14, left: 10, right: 14 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <MaterialCommunityIcons name="crown" size={SIZE} color={colors.togetherText} />
      </Animated.View>
    </Pressable>
  );
}
