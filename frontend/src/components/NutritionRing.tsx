/**
 * 영양 링 게이지 — 럽바디 "오늘 영양" 카드의 주인공.
 *
 * <p>예전 이름은 ProteinRing 이었다(2026-08-10, "운동 앱 사용자는 단백질 달성률에 가장 민감하다").
 * 사용자 층이 운동 트래커에서 커플 식단 기록으로 옮겨 가고, 사진 한 장으로 가장 믿을 만하게 채워지는
 * 값이 칼로리라 중심을 <b>남은 칼로리</b>로 바꿨다(docs/LOVEBODY_REVIEW_2026-10-02.md §2-1).
 * 무엇을 보여줄지는 호출부가 정한다 — 이 컴포넌트는 진행률·가운데 글자·캡션만 그린다.
 *
 * <p><b>글자 크기를 따라 커진다.</b> 고정 96 안에 17pt 숫자를 넣으면 시스템 글자 200% 에서 숫자가
 * 링 밖으로 넘쳤다. 배율(최대 1.6배)만큼 지름을 키운다.
 */
import React from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  /** 0~1 진행률. null 이면 목표가 없어 진행 호를 그리지 않는다(빈 트랙만) */
  progress: number | null;
  /** 목표를 넘었는가 — 진행 호와 가운데 아래 글자를 강조색으로 */
  over?: boolean;
  /** 가운데 큰 숫자(이미 포맷된 문자열) */
  value: string;
  /** 숫자 아래 작은 글자 — "kcal 남았어요" 등 */
  label: string;
  /** 스크린리더가 읽을 전체 문장 — 숫자 둘(남은·목표)을 함께 말한다 */
  accessibilityLabel: string;
  /** 누르면 — 계산식 시트 등. 없으면 누를 수 없는 그림 */
  onPress?: () => void;
  size?: number;
  strokeWidth?: number;
}

export function NutritionRing({
  progress,
  over = false,
  value,
  label,
  accessibilityLabel,
  onPress,
  size: baseSize = 104,
  strokeWidth = 10,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const size = Math.round(baseSize * Math.min(1.6, Math.max(1, fontScale)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = progress == null ? 0 : Math.min(1, Math.max(0, progress));
  const dashoffset = circumference * (1 - pct);

  const ring = (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceAlt} strokeWidth={strokeWidth} fill="none" />
        {progress != null && pct > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={over ? colors.danger : colors.primaryLight}
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
      <View style={[styles.center, { width: size, height: size, padding: strokeWidth + 2 }]} pointerEvents="none">
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={[styles.label, over && styles.labelOver]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        {ring}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="계산식을 봅니다"
    >
      {ring}
    </Pressable>
  );
}

// themedStyles — StyleSheet.create 는 모듈 로드 시 색이 굳어 실행 중 테마 전환이 반영되지 않았다
const styles = themedStyles((colors) => ({
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  label: { fontSize: fontSize.micro, color: colors.textSecondary, fontWeight: '700', textAlign: 'center', marginTop: spacing.xxs },
  labelOver: { color: colors.danger },
  pressed: { opacity: 0.7 },
}));
