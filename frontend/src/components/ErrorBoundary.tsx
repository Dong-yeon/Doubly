/**
 * 렌더 예외를 잡아 앱 전체 화이트스크린을 막는다.
 *
 * 에러 바운더리는 React 클래스 컴포넌트로만 만들 수 있다(훅 대체제 없음).
 * 잡지 못하는 것: 이벤트 핸들러, 비동기 코드, 바운더리 자신의 렌더 예외.
 * 그쪽은 `installGlobalErrorHandlers` 가 담당한다.
 *
 * <p><b>배포 빌드에서도 원인을 꺼낼 수 있어야 한다.</b> 예전에는 스택을 {@code __DEV__}
 * 에서만 보여줬는데, 리포터가 콘솔 전용({@link ../utils/errorReporter})이라 배포 빌드에서
 * 이 화면이 뜨면 <b>원인을 알 방법이 전혀 없었다</b> — 2026-09-12 "일상 화면 진입 시 오류"
 * 리포트에서 스택을 구하지 못해 추측만 쌓였다. 그래서 접어 둔 "자세히" 안에 요약 한 줄과
 * 복사 버튼을 둔다. 평소에는 안 보이고, 필요할 때 붙여넣을 수 있다.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DoublyMark } from './DoublyLogo';
import { reportError } from '../utils/errorReporter';
import { copyText } from '../utils/share';
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
  /** "자세히" 를 펼쳤는가 — 개발 빌드에서는 처음부터 펼쳐 둔다 */
  detailOpen: boolean;
  /** 복사 완료 표시 — 토스트 스토어를 쓰지 않는다(그쪽도 렌더가 죽어 있을 수 있다) */
  copied: boolean;
  /** 어느 화면에서 터졌는지 — componentStack 첫 줄들에서 뽑는다 */
  componentStack: string | null;
}

/** 이 횟수를 넘게 실패하면 재시도로는 해결되지 않는 상태로 본다 */
const RETRY_LIMIT = 2;

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, retryCount: 0, detailOpen: __DEV__, copied: false, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    reportError(error, {
      source: 'render',
      fatal: true,
      boundary: this.props.label,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private handleRetry = () => {
    // 자식을 다시 마운트시켜 복구를 시도한다. 원인이 남아 있으면 즉시 다시 잡힌다.
    this.setState((prev) => ({ error: null, retryCount: prev.retryCount + 1, copied: false }));
  };

  /**
   * 붙여넣을 수 있는 진단 문자열 — 메시지 + 스택 앞부분 + 컴포넌트 스택 앞부분.
   *
   * <p>앞부분만 자르는 이유: 원인을 짚는 데 필요한 건 <b>가장 안쪽 프레임 몇 줄</b>이고,
   * 전체를 넣으면 붙여넣기가 감당이 안 된다. 릴리스 번들은 어차피 함수명이 뭉개져 있어
   * 길이를 늘려도 얻는 게 적다.
   */
  private diagnosticText(): string {
    const { error, componentStack } = this.state;
    const head = (text: string | null | undefined, lines: number) =>
      (text ?? '').split('\n').slice(0, lines).join('\n').trim();
    return [
      `[${this.props.label ?? 'unknown'}] ${error?.name ?? 'Error'}: ${error?.message ?? ''}`,
      head(error?.stack, 6),
      componentStack ? `--- component ---\n${head(componentStack, 6)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private handleCopy = () => {
    void copyText(this.diagnosticText())
      .then(() => this.setState({ copied: true }))
      // 복사 실패는 조용히 — 아래 텍스트가 selectable 이라 손으로도 집을 수 있다
      .catch(() => undefined);
  };

  render() {
    const { error, retryCount, detailOpen, copied } = this.state;
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

          {/*
            기술적 내용은 접어 둔다 — 평소에는 안 보이지만, 배포 빌드에서도 펼쳐서 복사할 수
            있어야 한다. 이게 없으면 사용자가 겪은 오류의 원인을 아무도 알 수 없다(클래스 주석).
          */}
          <Pressable
            onPress={() => this.setState((prev) => ({ detailOpen: !prev.detailOpen }))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailOpen }}
          >
            <Text style={styles.detailToggle}>{detailOpen ? '자세히 접기' : '자세히'}</Text>
          </Pressable>

          {detailOpen ? (
            <View style={styles.devBox}>
              <View style={styles.devHeader}>
                <Text style={styles.devLabel}>오류 정보</Text>
                <Pressable onPress={this.handleCopy} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.copyLink}>{copied ? '복사됨' : '복사'}</Text>
                </Pressable>
              </View>
              <Text style={styles.devStack} selectable>
                {this.diagnosticText()}
              </Text>
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
  devHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  devLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  copyLink: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  devStack: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  detailToggle: { fontSize: fontSize.caption, color: colors.textTertiary, fontWeight: '700' },
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
