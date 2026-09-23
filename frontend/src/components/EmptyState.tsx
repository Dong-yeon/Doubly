import React from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { Button } from './Button';
import { colors, fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  /** 빈 화면 아이콘 (MaterialCommunityIcons) */
  icon?: IconName;
  title: string;
  description?: string;
  /**
   * 네트워크 오류로 인한 빈 상태 — "진짜 빈 목록"과 구분되게 아이콘·색을 달리하고
   * onRetry 가 있으면 재시도 버튼을 보여준다. (QA_CHECKLIST.md 패턴1: 로드 실패가
   * 빈 상태로 위장돼 사용자가 네트워크 오류인지 진짜 빈 목록인지 구분 못 하던 문제)
   */
  error?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  /**
   * 그림 빈 상태 — 회색 아이콘 대신 캐릭터. 'duo' 는 달걀 둘(스티커 자산 재사용).
   * 오래 보이는 빈 화면(앨범·타임라인)에 쓴다. 오류 상태에는 쓰지 않는다
   * (docs/SCREEN_DESIGN_PASS_2026-09-23.md §4-3 P10).
   */
  illustration?: 'duo' | ImageSourcePropType;
}

const DUO = require('../../assets/stickers/duo_idea.png');

/** 빈 상태 안내 — 연한 단색 아이콘으로 절제된 룩. error=true 면 오류 전용 룩 + 재시도 버튼 */
export function EmptyState({
  icon,
  title,
  description,
  error,
  onRetry,
  retryLabel = '다시 시도',
  illustration,
}: Props) {
  const name: IconName = icon ?? (error ? 'cloud-off-outline' : 'inbox-outline');
  const picture = !error && illustration ? (illustration === 'duo' ? DUO : illustration) : null;
  return (
    <View style={styles.wrap}>
      {picture ? (
        <Image source={picture} style={styles.picture} resizeMode="contain" />
      ) : (
        <View style={styles.iconCircle}>
          {/* textSecondary — textMuted 는 iconCircle(surfaceAlt) 위 2.45:1 로 그래픽 기준(3:1) 미달 */}
          <MaterialCommunityIcons name={name} size={40} color={error ? colors.danger : colors.textSecondary} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {error && onRetry ? (
        <Button title={retryLabel} variant="secondary" size="sm" onPress={onRetry} style={styles.retryBtn} />
      ) : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  picture: { width: 140, height: 140, marginBottom: spacing.sm },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  desc: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: { marginTop: spacing.md },
}));
