/** Doubly 심볼 — 겹치는 두 원 (나=Coral · 상대=Indigo · 겹침=Violet).
 *  하트·핑크 없이 '둘'과 '두 배'를 말하는 브랜드 마크. */
import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fontSize } from '../constants/theme';

interface Props {
  size?: number;
  showWordmark?: boolean;
  wordmarkColor?: string;
  style?: ViewStyle;
}

/** 두 원 마크 (텍스트 없음) */
export function DoublyMark({ size = 40 }: { size?: number }) {
  const r = size / 2;
  const overlap = size * 0.42; // 겹침 정도
  const width = size * 2 - overlap;
  return (
    <View style={{ width, height: size }}>
      {/* 나 (Coral) */}
      <View style={[styles.circle, { width: size, height: size, borderRadius: r, left: 0, backgroundColor: colors.coral }]} />
      {/* 상대 (Indigo) */}
      <View style={[styles.circle, { width: size, height: size, borderRadius: r, left: size - overlap, backgroundColor: colors.indigo }]} />
      {/* 겹침 (Violet) — 두 원의 교집합 근사 */}
      <View
        style={[
          styles.lens,
          {
            width: overlap,
            height: size * 0.82,
            borderRadius: overlap,
            left: size - overlap,
            top: size * 0.09,
            backgroundColor: colors.violet,
          },
        ]}
      />
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
  circle: { position: 'absolute', top: 0 },
  lens: { position: 'absolute' },
  word: { fontWeight: '800', letterSpacing: -1 },
});
