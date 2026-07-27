/** Doubly 심볼 — 겹치는 두 하트 (나=Pink · 상대=Sky).
 *
 *  🩷🩵 를 이모지 글자로 찍지 않고 도형으로 그린다 — 이모지는 플랫폼마다 모양이 다르고,
 *  🩷/🩵 는 Unicode 15(2022) 라 구형 기기에서는 두부(☒)로 떨어진다. 브랜드 마크는
 *  어디서나 같아야 하므로 하트를 직접 그린다(원 2개 + 회전 사각형).
 */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fontSize } from '../constants/theme';

interface Props {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
  style?: ViewStyle;
}

/** 🩷/🩵 에 대응하는 브랜드 하트 색 (팔레트의 coral/indigo 보다 이모지에 가깝게) */
const PINK = '#FF7EB9';
const SKY = '#7DD3F0';

/** 하트 한 개 — 원 2개 + 45° 회전 사각형으로 합성 */
function Heart({ size, color, style }: { size: number; color: string; style?: ViewStyle }) {
  const lobe = size * 0.58; // 위쪽 두 원의 지름
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: lobe,
          height: lobe,
          borderRadius: lobe / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: lobe,
          height: lobe,
          borderRadius: lobe / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.145,
          top: size * 0.145,
          width: size * 0.71,
          height: size * 0.71,
          backgroundColor: color,
          transform: [{ rotate: '45deg' }],
          borderBottomRightRadius: size * 0.08,
        }}
      />
    </View>
  );
}

/** 두 하트 마크 (텍스트 없음) — 살짝 겹쳐 '둘이 함께'를 표현 */
export function DoublyMark({ size = 40 }: { size?: number }) {
  const overlap = size * 0.3;
  const width = size * 2 - overlap;
  return (
    <View style={{ width, height: size }}>
      {/* 상대 (Sky) — 뒤에 깔린다 */}
      <Heart size={size} color={SKY} style={{ position: 'absolute', left: size - overlap, top: 0 }} />
      {/* 나 (Pink) — 앞에 온다 */}
      <Heart size={size} color={PINK} style={{ position: 'absolute', left: 0, top: 0 }} />
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
