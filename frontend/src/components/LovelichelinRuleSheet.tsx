/**
 * 럽슐랭 등급 기준 안내 — 배지 옆 ⓘ 를 누르면 열린다.
 *
 * <p><b>왜 필요했나</b>: 앱은 판정만 보여주고 규칙은 어디서도 말하지 않았다. 둘 다 좋아했는데
 * 3 럽스타가 아닌 이유(★★★★ + ★★★★★ = 평균 4.5 → 2 럽스타)를 알 길이 없고, 한쪽이 낮게
 * 주면 "탈락"이라고만 쓰여 있었다. 2026-08 백로그의 "등급 기준 안내 UI" 가 여기다.
 *
 * <p>문구의 숫자는 서버 판정과 같아야 한다 — {@code PlaceService.computeTier} 와
 * {@code ContentService.computeTier}(둘이 같은 규칙)를 고칠 때 이 파일도 함께 본다.
 * 장소·콘텐츠 두 상세 화면이 공유한다.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

const RULES: { head: string; body: string }[] = [
  {
    head: '둘 다 별점을 매겨야 해요',
    body: '한 명만 매긴 동안은 등급 없이 기다려요. 상대에게 알림이 가요.',
  },
  {
    head: '한 명이라도 ★★ 이하면 등급이 안 붙어요',
    body: '취향이 갈린 곳이라는 뜻이지, 나쁜 곳이라는 뜻은 아니에요.',
  },
  {
    head: '둘 다 ★★★ 이상이면 평균으로 정해져요',
    body: '평균 5.0 → 3 럽스타 · 4.0 이상 → 2 럽스타 · 그 외 → 1 럽스타',
  },
];

export function LovelichelinRuleSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} position="bottom">
      <Text style={styles.title}>럽슐랭 등급은 이렇게 정해져요</Text>
      <View style={styles.rules}>
        {RULES.map((r) => (
          <View key={r.head} style={styles.rule}>
            <Text style={styles.ruleHead}>{r.head}</Text>
            <Text style={styles.ruleBody}>{r.body}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.example}>
        예를 들어 나 ★★★★ · 상대 ★★★★★ 면 평균 4.5 라서 <Text style={styles.exampleStrong}>2 럽스타</Text>예요.
      </Text>
      <Button title="알겠어요" variant="secondary" onPress={onClose} style={styles.close} />
    </Sheet>
  );
}

const styles = themedStyles((colors) => ({
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  rules: { marginTop: spacing.md, gap: spacing.md },
  rule: { gap: 2 },
  ruleHead: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  ruleBody: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 19 },
  example: {
    marginTop: spacing.md,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  exampleStrong: { color: colors.togetherText, fontWeight: '800' },
  close: { marginTop: spacing.lg },
}));
