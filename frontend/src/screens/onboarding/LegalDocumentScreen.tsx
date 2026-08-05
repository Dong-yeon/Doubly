/** 약관·개인정보처리방침 전문 보기 (AUTH-09) */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  PRIVACY_POLICY,
  PRIVACY_VERSION,
  TERMS_OF_SERVICE,
  TERMS_VERSION,
} from '../../constants/legal';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

/**
 * 온보딩(가입 전)과 설정(가입 후) 양쪽 스택에서 쓰이므로 특정 ParamList 에 묶지 않는다.
 * 필요한 것은 doc 파라미터와 뒤로가기뿐이다.
 */
type Props = {
  navigation: { goBack: () => void };
  route: { params: { doc: 'terms' | 'privacy' } };
};

export function LegalDocumentScreen({ navigation, route }: Props) {
  const isTerms = route.params.doc === 'terms';
  const title = isTerms ? '이용약관' : '개인정보처리방침';
  const body = isTerms ? TERMS_OF_SERVICE : PRIVACY_POLICY;
  const version = isTerms ? TERMS_VERSION : PRIVACY_VERSION;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <Text style={styles.backText}>닫기</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.version}>v{version}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.body}>{body}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { minHeight: 44, justifyContent: 'center', paddingRight: spacing.md },
  backText: { fontSize: fontSize.body, color: colors.primary, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  title: { flex: 1, fontSize: fontSize.subtitle, fontWeight: '800', color: colors.ink },
  version: { fontSize: fontSize.caption, color: colors.textSecondary },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  body: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 24 },
}));
