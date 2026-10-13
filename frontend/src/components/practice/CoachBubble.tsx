/**
 * 연습 판 공용 조각 — 코치 말풍선과 "연습 판" 띠. docs/game-practice-tutorial_2026-10-13.md §2.
 * 게임마다 엔진·AI·레슨은 따로 두고, 화면에 얹는 이 둘만 같이 쓴다.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../Button';
import { MaterialCommunityIcons } from '../Icon';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

export type CoachTone = 'info' | 'good' | 'warn';

/**
 * 코치 말 — tone 으로 칭찬(good)·다시 해 봐요(warn)를 가른다. 색만이 아니라 앞 아이콘도 달라진다.
 * action 이 있으면 말풍선 안에 단추 하나([다음] 등).
 */
export function CoachBubble({
  text,
  tone = 'info',
  actionLabel,
  onAction,
}: {
  text: string;
  tone?: CoachTone;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const icon = tone === 'good' ? 'check-circle' : tone === 'warn' ? 'information-outline' : 'comment-question-outline';
  const tint = tone === 'good' ? colors.success : tone === 'warn' ? colors.chart3 : colors.primary;
  return (
    <View
      style={[styles.bubble, tone === 'good' && styles.bubbleGood, tone === 'warn' && styles.bubbleWarn]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <MaterialCommunityIcons name={icon} size={20} color={tint} />
        <Text style={styles.text}>{text}</Text>
      </View>
      {actionLabel && onAction ? (
        <Button title={actionLabel} size="sm" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

/** 연습 판이라는 표시 — 기록·알림에 남지 않는다는 것을 늘 보이게 */
export function PracticeBanner({ text = '연습 판 — 기록에 남지 않고 상대에게 알림도 가지 않아요' }: { text?: string }) {
  return (
    <View style={styles.banner}>
      <MaterialCommunityIcons name="information-outline" size={14} color={colors.textSecondary} />
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  bubble: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bubbleGood: { borderColor: colors.success, backgroundColor: colors.successBg },
  bubbleWarn: { borderColor: colors.chart3, backgroundColor: colors.warningBg },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  text: { flex: 1, fontSize: fontSize.body, lineHeight: 22, color: colors.textPrimary, fontWeight: '600' },
  action: { alignSelf: 'flex-end' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  bannerText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
}));
