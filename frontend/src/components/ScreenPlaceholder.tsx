/**
 * 1단계 스캐폴딩용 화면 플레이스홀더.
 * 각 화면은 phase 2~5에서 실제 UI로 대체됩니다.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  emoji: string;
  title: string;
  description: string;
}

export function ScreenPlaceholder({ emoji, title, description }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emoji: { fontSize: 56, marginBottom: spacing.md },
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.textPrimary },
  description: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
}));
