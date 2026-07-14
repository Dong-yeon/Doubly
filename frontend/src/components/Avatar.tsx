import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';

interface Props {
  name?: string | null;
  imageUrl?: string | null;
  size?: number;
  /** 배경색 (기본 코랄) */
  color?: string;
}

/** 프로필 아바타 — 이미지 없으면 이름 첫 글자 */
export function Avatar({ name, imageUrl, size = 48, color = colors.primary }: Props) {
  const dim = { width: size, height: size, borderRadius: radius.pill };
  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={[dim, styles.img]} />;
  }
  return (
    <View style={[dim, styles.fallback, { backgroundColor: color }]}>
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{name?.charAt(0) ?? ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: colors.surfaceAlt },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: colors.white, fontWeight: '800' },
});
