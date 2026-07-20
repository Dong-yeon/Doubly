/**
 * ErrorBoundary 가 잡지 못하는 예외를 수집한다.
 *
 * 바운더리는 "렌더 중" 예외만 잡는다. 실제 크래시 대부분은
 * 이벤트 핸들러·비동기 코드·처리되지 않은 Promise 거부에서 나오는데,
 * 이쪽은 전역 훅으로만 관찰할 수 있다.
 *
 * 네이티브(RN)와 웹(Expo Web) 양쪽에서 동작해야 하므로 각 API 존재를 확인하고 붙인다.
 */
import { reportError } from './errorReporter';

/** RN 이 전역에 노출하는 에러 훅 — 웹 번들에는 없을 수 있다 */
interface ErrorUtilsLike {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
}

let installed = false;

/**
 * 앱 시작 시 1회 호출. 중복 설치되면 같은 에러가 여러 번 보고되므로 가드를 둔다.
 */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;

  installNativeHandler();
  installUnhandledRejectionHandler();
}

/** RN 전역 예외 — 기존 핸들러(빨간 화면 등)를 유지한 채 보고만 얹는다. */
function installNativeHandler() {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, { source: 'global', fatal: !!isFatal });
    // 기존 핸들러를 호출하지 않으면 개발 중 빨간 화면이 사라져 디버깅이 어려워진다
    previous?.(error, isFatal);
  });
}

/** 처리되지 않은 Promise 거부 — 웹은 표준 이벤트, 네이티브는 폴리필이 있을 때만. */
function installUnhandledRejectionHandler() {
  const target = globalThis as {
    addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  };
  if (typeof target.addEventListener !== 'function') return;

  target.addEventListener('unhandledrejection', (event: unknown) => {
    const reason = (event as { reason?: unknown })?.reason ?? event;
    reportError(reason, { source: 'promise', fatal: false });
  });
}
