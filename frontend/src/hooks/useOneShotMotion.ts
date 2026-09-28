/**
 * 한 번 움직이고 멈추는 그림 — 우리 이모지·캐릭터 스티커 말풍선 공용.
 *
 * <p>모션은 constants/coupleEmojiMotion.ts 의 키프레임 목록(`MotionSpec`)이다. 진행도 0→1 을 값 개수만큼
 * 등분해 보간하고, 모든 트랙이 정지 자세로 끝나서 멈추면 원래 그림과 같다.
 *
 * <p><b>재생 규칙</b>(docs/COUPLE_EMOJI_ANIMATION_SPEC_2026-09-28.md §5-3): 루프하지 않는다. {@code play} 가
 * true 가 되면 한 번, {@code run()} 을 부르면(탭) 다시 한 번. "동작 줄이기"가 켜져 있으면 움직이지 않는다.
 *
 * <p>RN Animated + native driver 다 — transform·opacity 만 움직이므로 UI 스레드에서 돈다
 * (Reanimated 를 쓰지 않는 이유는 AnimatedCoupleEmoji 주석).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';
import type { MotionSpec, MotionTrack } from '../constants/coupleEmojiMotion';

export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/** 키프레임 목록을 진행도 0→1 에 등분해 보간한다 */
export function track(progress: Animated.Value, values: number[], unit = '') {
  const inputRange = values.map((_, i) => i / (values.length - 1));
  return unit
    ? progress.interpolate({ inputRange, outputRange: values.map((v) => `${v}${unit}`) })
    : progress.interpolate({ inputRange, outputRange: values });
}

export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

interface Options {
  /** true 가 되는 순간 한 번 자동 재생 */
  play: boolean;
  /** 자동 재생을 한 번 끝냈다 — 부모가 같은 메시지를 다시 자동 재생하지 않게 표시한다 */
  onPlayed?: () => void;
  /** 실제로 움직이기 시작할 때마다(자동·탭) — 효과 레이어를 켜는 자리 */
  onRun?: () => void;
}

export function useOneShotMotion(motion: MotionSpec | null, { play, onPlayed, onRun }: Options) {
  const reduced = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));

  const run = useCallback(() => {
    if (!motion || reduced) return;
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
    onRun?.();
  }, [motion, reduced, progress, onRun]);

  /*
   * 자동 재생 — 한 번만. 모션을 아직 모르면(우리 이모지 목록이 늦게 도착) 소비하지 않고 기다린다 —
   * 모션이 정해지는 순간 움직인다. 동작 줄이기는 run 이 스스로 거른다.
   */
  const autoPlayed = useRef(false);
  useEffect(() => {
    if (!play || !motion || autoPlayed.current) return;
    autoPlayed.current = true;
    run();
    onPlayed?.();
  }, [play, motion, run, onPlayed]);

  const transform = useMemo(() => {
    if (!motion) return [];
    const t = motion.tracks;
    const out: Record<string, Animated.AnimatedInterpolation<number | string>>[] = [];
    const add = (key: MotionTrack, unit = '') => {
      const values = t[key];
      if (values) out.push({ [key]: track(progress, values, unit) });
    };
    add('translateX');
    add('translateY');
    add('rotate', 'deg');
    add('scale');
    add('scaleY');
    return out;
  }, [motion, progress]);
  const opacity = motion?.tracks.opacity ? track(progress, motion.tracks.opacity) : 1;

  return { run, reduced, transform, opacity };
}
