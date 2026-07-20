/**
 * 에러 리포팅 seam.
 *
 * 지금은 콘솔 출력만 하지만, Sentry 등을 붙일 때 호출부를 고치지 않고
 * `setErrorReporter` 로 구현만 갈아끼우면 되도록 분리해둔다.
 *
 * 예) App.tsx 에서
 *   Sentry.init({ dsn });
 *   setErrorReporter((error, ctx) => Sentry.captureException(error, { extra: ctx }));
 */

/** 에러가 발생한 지점 — 리포팅 도구에서 묶어보기 위한 분류 */
export type ErrorSource =
  /** 렌더 중 예외 — ErrorBoundary 가 잡음 */
  | 'render'
  /** 이벤트 핸들러/네이티브 등 전역 예외 — ErrorBoundary 가 못 잡음 */
  | 'global'
  /** 처리되지 않은 Promise 거부 */
  | 'promise';

export interface ErrorContext {
  source: ErrorSource;
  /** 치명적 여부 — true 면 앱이 정상 동작을 이어갈 수 없는 상태 */
  fatal?: boolean;
  /** React 컴포넌트 스택 (렌더 예외일 때) */
  componentStack?: string;
  /** 예외를 잡은 바운더리 이름 — 어느 영역이 죽었는지 구분한다 */
  boundary?: string;
}

type ErrorReporter = (error: Error, context: ErrorContext) => void;

const consoleReporter: ErrorReporter = (error, context) => {
  // eslint-disable-next-line no-console
  console.error(
    `[${context.source}${context.fatal ? '/fatal' : ''}${context.boundary ? `@${context.boundary}` : ''}]`,
    error?.message ?? error,
    error?.stack ?? '',
    context.componentStack ?? '',
  );
};

let reporter: ErrorReporter = consoleReporter;

/** 리포팅 구현 교체 — 앱 시작 시 1회 호출한다. */
export function setErrorReporter(next: ErrorReporter) {
  reporter = next;
}

/**
 * 에러 보고. 리포터 자체가 던져도 앱을 죽이지 않는다
 * — 에러 처리 경로에서 다시 예외가 나면 무한 루프가 된다.
 */
export function reportError(error: unknown, context: ErrorContext) {
  const normalized =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));
  try {
    reporter(normalized, context);
  } catch {
    // 리포팅 실패는 조용히 무시 — 원래 에러를 사용자에게 보여주는 게 우선이다
  }
}
