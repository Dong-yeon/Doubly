/**
 * 움직이는 캐릭터 스티커 말풍선 — 달걀이·구운이 PNG 를 받은 순간 한 번 움직인다. 누르면 다시.
 *
 * <p>모션은 constants/stickerMotion.ts, 재생 규칙은 hooks/useOneShotMotion.ts(우리 이모지와 같다).
 * 모션이 없는 코드(내린 스티커 등)는 예전과 같은 정지 그림이고 터치를 가로채지 않는다 —
 * 말풍선의 길게 누르기(답장·삭제 메뉴)가 그대로 간다.
 */
import React from 'react';
import { Animated, Image, ImageSourcePropType, ImageStyle, Pressable, StyleProp, ViewStyle } from 'react-native';
import { stickerMotionOf } from '../../constants/stickerMotion';
import { useOneShotMotion } from '../../hooks/useOneShotMotion';

interface Props {
  code: string;
  source: ImageSourcePropType;
  label: string;
  style?: StyleProp<ImageStyle>;
  /** true 인 채로 마운트되거나 true 가 되는 순간 한 번 재생 */
  play: boolean;
  onPlayed?: () => void;
  /** 이 컴포넌트가 터치를 먹으므로 말풍선 길게 누르기를 이어받는다 */
  onLongPress?: () => void;
}

export function AnimatedCharacterSticker({ code, source, label, style, play, onPlayed, onLongPress }: Props) {
  const motion = stickerMotionOf(code);
  const { run, transform, opacity } = useOneShotMotion(motion, { play, onPlayed });

  const image = <Image source={source} style={style} resizeMode="contain" accessibilityLabel={`${label} 스티커`} />;
  if (!motion) return image;

  return (
    <Pressable
      onPress={run}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`${label} 스티커, 누르면 다시 움직입니다`}
    >
      <Animated.View style={{ opacity, transform } as unknown as Animated.WithAnimatedValue<ViewStyle>}>
        {image}
      </Animated.View>
    </Pressable>
  );
}
