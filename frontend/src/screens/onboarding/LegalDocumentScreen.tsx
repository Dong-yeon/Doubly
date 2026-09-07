/** 약관·개인정보처리방침·오픈소스 고지 전문 보기 (AUTH-09) */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  PRIVACY_POLICY,
  PRIVACY_VERSION,
  TERMS_OF_SERVICE,
  TERMS_VERSION,
} from '../../constants/legal';
import { OPEN_SOURCE_NOTICE } from '../../constants/openSourceLicenses';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

/**
 * 온보딩(가입 전)과 설정(가입 후) 양쪽 스택에서 쓰이므로 특정 ParamList 에 묶지 않는다.
 * 필요한 것은 doc 파라미터와 뒤로가기뿐이다.
 */
type Props = {
  navigation: { goBack: () => void };
  route: { params: { doc: 'terms' | 'privacy' | 'oss' } };
};

/*
 * 오픈소스 고지는 개정 이력을 따로 관리하지 않는다 — 약관·방침과 달리 재동의 대상이
 * 아니고, 의존성이 바뀔 때마다 갱신되는 목록이라 버전을 붙여도 의미가 없다.
 */
const DOCS = {
  terms: { title: '이용약관', body: TERMS_OF_SERVICE, version: TERMS_VERSION },
  privacy: { title: '개인정보처리방침', body: PRIVACY_POLICY, version: PRIVACY_VERSION },
  oss: { title: '오픈소스 라이선스', body: OPEN_SOURCE_NOTICE, version: null },
} as const;

export function LegalDocumentScreen({ navigation, route }: Props) {
  const { title, body, version } = DOCS[route.params.doc];

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
        {version ? <Text style={styles.version}>v{version}</Text> : null}
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
