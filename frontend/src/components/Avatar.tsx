import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { onColor } from '../theme/onColor';

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
      {/* 글자색은 배경 휘도로 고른다 — 흰색 고정이면 다크의 파스텔 위에서 1.55:1 이었다 */}
      <Text style={[styles.letter, { fontSize: size * 0.42, color: onColor(color) }]}>
        {name?.charAt(0) ?? ''}
      </Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  img: { backgroundColor: colors.surfaceAlt },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontWeight: '800' }, // 색은 onColor(배경) 로 인라인 지정한다
}));
