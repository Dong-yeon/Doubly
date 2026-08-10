/**
 * 단백질 링 게이지 — 운동 앱 사용자는 총 칼로리보다 단백질(g) 달성률에 훨씬 민감해서,
 * 다른 매크로와 같은 취급을 받던 선형 바 대신 홈 최상단에 단독 원형 게이지로 뺐다.
 * (참고: frontend/src/screens/diet/DietScreen.tsx 의 NutritionBar 는 칼로리/탄수/지방용으로 유지)
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fontSize, spacing } from '../constants/theme';

interface Props {
  consumed: number;
  target?: number | null;
  size?: number;
  strokeWidth?: number;
}

export function ProteinRing({ consumed, target, size = 96, strokeWidth = 10 }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = target && target > 0 ? Math.min(1, consumed / target) : 0;
  const over = target != null && consumed > target;
  const dashoffset = circumference * (1 - pct);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.surfaceAlt}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {target ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={over ? colors.primary : colors.primaryLight}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
              // 12시 방향에서 시작하도록 회전 (기본은 3시 방향)
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          ) : null}
        </Svg>
        <View style={[styles.centerText, { width: size, height: size }]} pointerEvents="none">
          <Text style={styles.value}>{consumed}g</Text>
          {target ? <Text style={styles.target}>/{target}g</Text> : null}
        </View>
      </View>
      <Text style={styles.label}>단백질</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs },
  centerText: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  target: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
});
