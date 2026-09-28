/**
 * 움직이는 우리 이모지 말풍선 — 그림은 그대로 두고 감정별 모션·효과를 한 번 입힌다.
 *
 * <p>명세: docs/COUPLE_EMOJI_ANIMATION_SPEC_2026-09-28.md §5. 프리셋은 constants/coupleEmojiMotion.ts.
 *
 * <p><b>Reanimated 가 아니라 RN Animated 인 이유</b>: 앱 소스에서 Reanimated 를 import 하는 곳이
 * 아직 하나도 없고(babel 플러그인만 있다) 나머지 애니메이션은 전부 Animated + native driver 다.
 * transform·opacity 만 움직이므로 native driver 로도 UI 스레드에서 돈다 — 첫 Reanimated 사용처가
 * 되어 웹 번들 위험을 새로 질 이유가 없다.
 *
 * <p><b>재생 규칙</b>: 루프하지 않는다. {@code play} 가 true 인 채로 마운트되거나 false→true 로
 * 바뀌면 한 번, 누르면 다시 한 번. "동작 줄이기"가 켜져 있으면 모션·효과 모두 끄고 정지 그림이다.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  ImageStyle,
} from 'react-native';
import { CachedImage } from '../CachedImage';
import { CoupleEmojiLottieEffect } from './CoupleEmojiLottieEffect';
import {
  EffectSpec,
  MOTIONS,
  MotionTrack,
  coupleEmojiEffectsAllowed,
  coupleEmojiMotionOf,
} from '../../constants/coupleEmojiMotion';

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
/** 글리프 효과 한 번의 길이 */
const GLYPH_MS = 1300;
/** Lottie 가 끝을 알리지 못하는 경우(웹·언마운트 경합)에도 레이어가 남지 않게 */
const EFFECT_SAFETY_MS = 3000;

interface Props {
  uri: string;
  /** 감정 키 — null 이면 정지 그림(지운 이모지·모르는 감정) */
  emotion: string | null;
  /** v4 이하·모름이면 효과 레이어를 끈다(그림 안에 이미 그려져 있다) */
  promptVersion?: string | null;
  size: number;
  /** true 인 채로 마운트되거나 true 가 되는 순간 한 번 재생 */
  play: boolean;
  /** 자동 재생을 한 번 끝냈다 — 부모가 같은 메시지를 다시 자동 재생하지 않게 표시한다 */
  onPlayed?: () => void;
  /** 말풍선 길게 누르기(답장·삭제 메뉴) — 이 컴포넌트가 터치를 먹으므로 이어받는다 */
  onLongPress?: () => void;
  imageStyle?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/** 키프레임 목록을 진행도 0→1 에 등분해 보간한다 */
function track(progress: Animated.Value, values: number[], unit = '') {
  const inputRange = values.map((_, i) => i / (values.length - 1));
  return unit
    ? progress.interpolate({ inputRange, outputRange: values.map((v) => `${v}${unit}`) })
    : progress.interpolate({ inputRange, outputRange: values });
}

function useReduceMotion(): boolean {
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

export function AnimatedCoupleEmoji({
  uri,
  emotion,
  promptVersion,
  size,
  play,
  onPlayed,
  onLongPress,
  imageStyle,
  accessibilityLabel,
}: Props) {
  const preset = coupleEmojiMotionOf(emotion);
  const reduced = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));
  /** 재생할 때마다 올린다 — 효과 레이어를 새로 마운트해 처음부터 돌리는 키 */
  const [runId, setRunId] = useState(0);
  const [effectOn, setEffectOn] = useState(false);

  const effect: EffectSpec | null =
    preset && coupleEmojiEffectsAllowed(promptVersion) ? preset.effect : null;
  const motion = preset ? MOTIONS[preset.motion] : null;

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
    setRunId((n) => n + 1);
    if (effect) setEffectOn(true);
  }, [motion, reduced, progress, effect]);

  /*
   * 자동 재생 — 한 번만. 감정을 아직 모르면(우리 이모지 목록이 늦게 도착) 소비하지 않고 기다린다 —
   * 목록이 들어와 모션이 정해지는 순간 움직인다. 동작 줄이기는 run 이 스스로 거른다.
   */
  const autoPlayed = useRef(false);
  useEffect(() => {
    if (!play || !motion || autoPlayed.current) return;
    autoPlayed.current = true;
    run();
    onPlayed?.();
  }, [play, motion, run, onPlayed]);

  useEffect(() => {
    if (!effectOn) return;
    const t = setTimeout(() => setEffectOn(false), EFFECT_SAFETY_MS);
    return () => clearTimeout(t);
  }, [effectOn, runId]);

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

  const image = (
    <CachedImage uri={uri} style={[{ width: size, height: size }, imageStyle]} contentFit="cover" />
  );

  // 움직일 게 없으면 예전과 똑같은 정지 그림 — 터치도 가로채지 않아 말풍선 길게 누르기가 그대로 간다
  if (!preset) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {image}
      </View>
    );
  }

  const effectSize = Math.round(size * 0.45);
  return (
    <Pressable
      onPress={run}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel ?? '우리 이모지'}, 누르면 다시 움직입니다`}
    >
      <Animated.View style={[styles.frame, { opacity, transform } as unknown as Animated.WithAnimatedValue<ViewStyle>]}>
        {image}
        {effect && effectOn && !reduced ? (
          <View
            pointerEvents="none"
            style={[
              styles.effect,
              { width: effectSize, height: effectSize, top: -effectSize * 0.25, right: -effectSize * 0.25 },
            ]}
          >
            {effect.kind === 'lottie' ? (
              <CoupleEmojiLottieEffect
                key={runId}
                code={effect.code}
                style={{ width: effectSize, height: effectSize }}
                onFinish={() => setEffectOn(false)}
              />
            ) : (
              <GlyphEffect
                key={runId}
                glyph={effect.glyph}
                path={effect.path}
                size={effectSize}
                travel={size}
                onFinish={() => setEffectOn(false)}
              />
            )}
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

type GlyphPath = Extract<EffectSpec, { kind: 'glyph' }>['path'];

/** 이모지 글자 하나를 경로대로 띄웠다 사라지게 한다 */
function GlyphEffect({
  glyph,
  path,
  size,
  travel,
  onFinish,
}: {
  glyph: string;
  path: GlyphPath;
  size: number;
  /** 이동 거리의 기준 — 말풍선 그림 크기 */
  travel: number;
  onFinish: () => void;
}) {
  const [p] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(p, {
      toValue: 1,
      duration: GLYPH_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(({ finished }) => finished && onFinish());
    // 한 번만 — 다시 재생은 부모가 key 를 바꿔 새로 마운트한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useMemo(() => {
    switch (path) {
      case 'rise':
        return {
          opacity: track(p, [0, 1, 1, 0]),
          transform: [{ translateY: track(p, [0, -travel * 0.3]) }, { scale: track(p, [0.7, 1]) }],
        };
      case 'fall':
        // 볼 옆 눈물 — 우상단 자리에서 아래로 떨어진다
        return {
          opacity: track(p, [0, 1, 1, 0]),
          transform: [{ translateY: track(p, [travel * 0.2, travel * 0.55]) }],
        };
      case 'pulse':
        return {
          opacity: track(p, [0, 1, 1, 1, 0]),
          transform: [{ scale: track(p, [0.6, 1.2, 0.9, 1.2, 1]) }],
        };
      case 'drift':
        return {
          opacity: track(p, [0, 1, 1, 0]),
          transform: [
            { translateX: track(p, [0, travel * 0.25]) },
            { translateY: track(p, [0, -travel * 0.1]) },
          ],
        };
      case 'blink':
        return { opacity: track(p, [0, 1, 0, 1, 0, 1, 0]) };
    }
  }, [path, p, travel]);

  return (
    <Animated.View style={[styles.glyphBox, style as Animated.WithAnimatedValue<ViewStyle>]}>
      <Text style={{ fontSize: size * 0.7, lineHeight: size }}>{glyph}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 효과가 원 밖으로 나가도 잘리지 않게
  frame: { overflow: 'visible' },
  effect: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  glyphBox: { alignItems: 'center', justifyContent: 'center' },
});
