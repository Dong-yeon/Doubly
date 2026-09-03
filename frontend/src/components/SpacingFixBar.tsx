/**
 * 띄어쓰기 정리 줄 — 글 쓰는 입력창 아래에 붙는다.
 *
 * <p><b>고쳐주지 않고 물어본다.</b> 맞춤법 검사줄({@link ./SpellCheckBar})과 같은
 * 원칙이다 — 눌러야 바뀌고, 바꾼 뒤에는 되돌릴 수 있다. 띄어쓰기는 특히 그래야 한다:
 * "천일이야"를 "천 일이야"로 바꾸는 게 맞춤법상 틀린 건 아니지만 커플 앱에서
 * "천일"은 하나의 말이다.
 *
 * <p>모델이 240MB 라 화면을 벗어나면 내려야 한다 — 그 정리는 이 컴포넌트를 쓰는
 * 화면이 {@link useSpacingFix} 로 처리한다.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  /** 준비 중이면 스피너를 보여준다 */
  busy: boolean;
  /** 고친 직후라 되돌리기를 보여줄 상태인가 */
  canUndo: boolean;
  onFix: () => void;
  onUndo: () => void;
}

export function SpacingFixBar({ busy, canUndo, onFix, onUndo }: Props) {
  if (canUndo) {
    return (
      <View style={styles.bar}>
        <MaterialCommunityIcons name="auto-fix" size={15} color={colors.primary} />
        <Text style={styles.done}>띄어쓰기를 정리했어요</Text>
        <Pressable onPress={onUndo} hitSlop={8} accessibilityRole="button">
          <Text style={styles.undo}>되돌리기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <Pressable
        style={styles.action}
        onPress={onFix}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="띄어쓰기 정리"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialCommunityIcons name="wrap" size={15} color={colors.primary} />
        )}
        <Text style={styles.actionText}>{busy ? '준비 중…' : '띄어쓰기 정리'}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceAlt,
    },
    actionText: {
      fontSize: fontSize.caption,
      color: colors.primary,
    },
    done: {
      flex: 1,
      fontSize: fontSize.caption,
      color: colors.textSecondary,
    },
    undo: {
      fontSize: fontSize.caption,
      color: colors.primary,
      paddingHorizontal: spacing.xs,
    },
  }),
);
