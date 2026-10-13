/**
 * 게임 하는 법 시트 — 다섯 게임 공통. 내용은 constants/gameHelp.ts.
 *
 * <p>처음 하는 사람에겐 규칙을 모르는 게 가장 큰 벽이다(사용자, 2026-10-12). 게임 화면에 처음 들어가면 한 번
 * 저절로 뜨고(기기에 기억), "하는 법" 단추로 언제든 다시 연다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { MaterialCommunityIcons } from './Icon';
import { GAME_HELP, type GameHelpKey } from '../constants/gameHelp';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

const SEEN_KEY = (game: GameHelpKey) => `doubly.gameHelpSeen.${game}`;

/** 처음 들어오면 한 번 열리고, open/close 로 다시 연다 */
export function useGameHelp(game: GameHelpKey) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SEEN_KEY(game))
      .then((seen) => {
        if (alive && !seen) setVisible(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [game]);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(SEEN_KEY(game), '1').catch(() => undefined);
  }, [game]);
  return { visible, open, close };
}

/**
 * @param onPractice 있으면 "AI와 연습해 보기" 단추를 띄운다 — 연습 판이 있는 게임만 넘긴다
 *                   (docs/game-practice-tutorial_2026-10-13.md)
 */
export function GameHelpSheet({
  game,
  visible,
  onClose,
  onPractice,
}: {
  game: GameHelpKey;
  visible: boolean;
  onClose: () => void;
  onPractice?: () => void;
}) {
  const help = GAME_HELP[game];
  return (
    <Sheet visible={visible} onClose={onClose} position="bottom" cardStyle={styles.card}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{help.title} 하는 법</Text>
        <Text style={styles.goal}>{help.goal}</Text>
        <Text style={styles.section}>규칙</Text>
        {help.rules.map((line, i) => (
          <View key={`r${i}`} style={styles.row}>
            <Text style={styles.num}>{i + 1}</Text>
            <Text style={styles.line}>{line}</Text>
          </View>
        ))}
        <Text style={styles.section}>처음이라면</Text>
        {help.tips.map((line, i) => (
          <View key={`t${i}`} style={styles.row}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.primary} />
            <Text style={styles.line}>{line}</Text>
          </View>
        ))}
        {onPractice ? (
          <Button title="AI와 연습해 보기" variant="secondary" onPress={onPractice} style={styles.ok} />
        ) : null}
        <Button title="알겠어요" onPress={onClose} style={onPractice ? undefined : styles.ok} />
      </ScrollView>
    </Sheet>
  );
}

/** 밝은 화면용 "하는 법" 단추 */
export function GameHelpButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="게임 하는 법"
      hitSlop={8}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="comment-question-outline" size={16} color={colors.textSecondary} />
      <Text style={styles.pillText}>하는 법</Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  card: { maxHeight: '85%' },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  goal: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 22, fontWeight: '600' },
  section: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  num: {
    width: 20,
    height: 20,
    borderRadius: 10,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 12,
    fontWeight: '800',
    color: colors.onPrimary,
    backgroundColor: colors.primary,
    overflow: 'hidden',
  },
  line: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 22 },
  ok: { marginTop: spacing.md },
  pill: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  pressed: { opacity: 0.6 },
}));
