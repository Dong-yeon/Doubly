/**
 * Sentry 연동 — 에러 리포팅 구현체 주입.
 *
 * `errorReporter.ts` 의 seam 에 Sentry 구현을 꽂는다. 호출부(ErrorBoundary·전역 핸들러)는
 * Sentry 를 전혀 모르므로, 나중에 다른 도구로 바꾸거나 제거해도 이 파일만 손대면 된다.
 *
 * <b>웹은 제외한다</b>: @sentry/react-native 는 Expo Web 을 공식 지원하지 않는다.
 * 웹 PWA 에서는 초기화를 건너뛰고 기존 콘솔 출력 폴백을 그대로 쓴다.
 * 웹까지 수집하려면 @sentry/browser 를 별도로 붙여야 한다.
 */
import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { APP_VERSION, BUILD_COMMIT, SENTRY_DSN } from '../constants/config';
import { setErrorReporter } from './errorReporter';

export function initSentry() {
  // 웹이거나 DSN 미설정이면 콘솔 폴백 유지
  if (Platform.OS === 'web' || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    release: `doubly@${APP_VERSION}`,
    /*
     * 같은 버전으로 여러 번 빌드하므로(EAS 재빌드) release 만으로는 어느 산출물에서 난
     * 에러인지 구분되지 않는다. dist 에 커밋을 넣으면 이슈마다 그 값이 붙는다.
     */
    dist: BUILD_COMMIT,
    // 개발 중 발생한 에러까지 대시보드에 쌓이면 실제 사용자 장애가 묻힌다
    enabled: !__DEV__,
    /*
     * 이 앱은 커플의 사진·채팅·기록을 다룬다. 기본값(sendDefaultPii: false)을 유지해
     * IP·쿠키 등이 자동 수집되지 않게 하고, 이벤트에 묻어 들어갈 수 있는 사용자 입력은
     * beforeSend 에서 한 번 더 걷어낸다.
     */
    sendDefaultPii: false,
    beforeSend(event) {
      // 사용자 식별 정보는 보내지 않는다 (버그 재현에 이메일·이름은 불필요)
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });

  setErrorReporter((error, context) => {
    Sentry.captureException(error, {
      tags: { source: context.source, boundary: context.boundary ?? 'none' },
      extra: { fatal: context.fatal, componentStack: context.componentStack },
    });
  });
}

/*
 * 채팅 소켓 계측 — "연결 중이에요"가 오래 뜨는 원인을 가르려고 둔다(docs/server-stability-current-state.md §11-3).
 * 서버 로그로는 앱이 언제 끊김을 알아채고 몇 번 다시 붙으려 했는지 보이지 않는다. 브레드크럼은 다른 에러가 날 때
 * 함께 실려 가고, 느린 재연결은 아래 경고 이벤트로 따로 보낸다. 사용자 입력·토큰은 싣지 않는다.
 */
export function addSocketBreadcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({ category: 'chat.socket', level: 'info', message, data });
}

export function reportSlowSocket(summary: string, tags: Record<string, string>, timeline: string[]): void {
  Sentry.captureMessage('채팅 소켓 재연결 지연', {
    level: 'warning',
    tags,
    extra: { summary, timeline },
  });
}
