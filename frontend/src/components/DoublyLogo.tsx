/** Doubly 심볼 — 겹치는 두 하트 (나=Coral · 상대=Indigo).
 *
 *  SVG 패스로 그린다. 예전에는 원 2개 + 삼각형을 겹쳐 만들었는데, 도형 경계에
 *  이음매가 보이고 아래쪽이 각져서 작은 크기(26px 커플 줄)에서 깨져 보였다.
 *  패스는 어느 크기에서도 곡선이 매끄럽다.
 *
 *  이모지(🩷🩵)를 글자로 쓰지 않는 이유: Unicode 15(2022) 라 구형 기기에서 두부(☒)가
 *  되고, 플랫폼마다 모양이 달라 브랜드 마크로 쓸 수 없다.
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontSize } from '../constants/theme';

interface Props {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
  style?: ViewStyle;
}

/*
 * 하트 색은 Duo Color System 을 따른다 — 나=Coral · 상대=Indigo.
 *
 * 예전에는 Pink(#FF7EB9)/Sky(#7DD3F0) 를 썼는데, 이 마크가 홈 히어로에서
 * Coral 얼굴과 Indigo 얼굴 <b>사이</b>에 놓인다. 같은 "나/상대" 개념이 한 화면에서
 * 두 벌의 색으로 동시에 나와, 사용자가 학습한 색 코드가 무너졌다.
 *
 * 팔레트 토큰(colors.coral/indigo)을 직접 쓰지 않고 상수로 고정하는 이유:
 * 로고는 라이트/다크에서 같은 색이어야 하는 브랜드 자산이라 테마 반전을 타면 안 된다.
 * 값은 라이트 팔레트의 브랜드 원색과 일치시킨다.
 */
const CORAL = '#FF6A4D';
const INDIGO = '#4A5BFF';

/** 24×24 뷰박스 기준 하트 — 위 두 로브가 둥글고 아래로 부드럽게 모인다 */
const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09' +
  'C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function Heart({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={HEART_PATH} fill={color} />
    </Svg>
  );
}

/** 두 하트 마크 (텍스트 없음) — 살짝 겹쳐 '둘이 함께'를 표현 */
export function DoublyMark({ size = 40 }: { size?: number }) {
  const overlap = size * 0.28;
  const width = size * 2 - overlap;
  return (
    <View style={{ width, height: size }}>
      {/* 상대 (Indigo) — 뒤에 깔린다 */}
      <View style={{ position: 'absolute', left: size - overlap, top: 0 }}>
        <Heart size={size} color={INDIGO} />
      </View>
      {/* 나 (Coral) — 앞에 온다 */}
      <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <Heart size={size} color={CORAL} />
      </View>
    </View>
  );
}

/** 마크 + 워드마크(Doubly) 가로 조합 */
export function DoublyLogo({ size = 40, showWordmark = true, wordmarkColor = colors.ink, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <DoublyMark size={size} />
      {showWordmark ? (
        <Text style={[styles.word, { fontSize: size * 0.78, color: wordmarkColor }]}>Doubly</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  word: { fontWeight: '800', letterSpacing: -1 },
});
