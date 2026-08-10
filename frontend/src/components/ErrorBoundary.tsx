/**
 * 렌더 예외를 잡아 앱 전체 화이트스크린을 막는다.
 *
 * 에러 바운더리는 React 클래스 컴포넌트로만 만들 수 있다(훅 대체제 없음).
 * 잡지 못하는 것: 이벤트 핸들러, 비동기 코드, 바운더리 자신의 렌더 예외.
 * 그쪽은 `installGlobalErrorHandlers` 가 담당한다.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DoublyMark } from './DoublyLogo';
import { reportError } from '../utils/errorReporter';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  children: React.ReactNode;
  /** 어느 영역에서 터졌는지 — 리포팅 분류용 */
  label?: string;
}

interface State {
  error: Error | null;
  /** 재시도 횟수 — 반복 실패 시 안내 문구를 바꾼다 */
  retryCount: number;
}

/** 이 횟수를 넘게 실패하면 재시도로는 해결되지 않는 상태로 본다 */
const RETRY_LIMIT = 2;

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, {
      source: 'render',
      fatal: true,
      boundary: this.props.label,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleRetry = () => {
    // 자식을 다시 마운트시켜 복구를 시도한다. 원인이 남아 있으면 즉시 다시 잡힌다.
    this.setState((prev) => ({ error: null, retryCount: prev.retryCount + 1 }));
  };

  render() {
    const { error, retryCount } = this.state;
    if (!error) return this.props.children;

    const exhausted = retryCount >= RETRY_LIMIT;

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <DoublyMark size={48} />
          <Text style={styles.title}>앗, 문제가 생겼어요</Text>
          <Text style={styles.desc}>
            {exhausted
              ? '문제가 계속되고 있어요.\n앱을 완전히 종료했다가 다시 열어주세요.'
              : '잠시 문제가 발생했어요.\n다시 시도하면 대부분 해결돼요.'}
          </Text>

          {/* 기술적 내용은 개발 빌드에서만 — 사용자에게 스택을 보여줄 이유가 없다 */}
          {__DEV__ ? (
            <View style={styles.devBox}>
              <Text style={styles.devLabel}>개발 정보 (이 영역은 배포 빌드에서 숨겨집니다)</Text>
              <Text style={styles.devText} selectable>
                {error.message}
              </Text>
              {error.stack ? (
                <Text style={styles.devStack} selectable>
                  {error.stack}
                </Text>
              ) : null}
            </View>
          ) : null}

          {!exhausted ? (
            <Pressable
              onPress={this.handleRetry}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>다시 시도</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.heading,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.5,
    marginTop: spacing.sm,
  },
  desc: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  devBox: {
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  devLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  devText: { fontSize: fontSize.caption, color: colors.danger, fontWeight: '600' },
  devStack: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  buttonText: { color: '#FFFFFF', fontSize: fontSize.body, fontWeight: '800' },
}));
