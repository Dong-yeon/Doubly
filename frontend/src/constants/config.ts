/**
 * 환경 설정. 설계서 4.1 — Base URL: /api/v1
 *
 * 기본은 배포된 Railway 백엔드를 사용한다(휴대폰/Expo Go 에서 바로 동작).
 * 로컬 백엔드로 테스트하려면 USE_LOCAL_BACKEND 를 true 로 바꾼다.
 */
import { Platform } from 'react-native';

// true → 로컬 백엔드(localhost/10.0.2.2:8080) / false → 배포된 Railway 백엔드
const USE_LOCAL_BACKEND = false;

// 배포된 백엔드 호스트 (Railway)
const PROD_HOST = 'fitto-production.up.railway.app';

// Android 에뮬레이터는 호스트 머신을 10.0.2.2 로 접근
const LOCAL_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const API_BASE_URL = USE_LOCAL_BACKEND
  ? `http://${LOCAL_HOST}:8080/api/v1`
  : `https://${PROD_HOST}/api/v1`;

// STOMP over WebSocket — 설계서 4.5 (@stomp/stompjs brokerURL 스킴: 로컬 ws / 배포 wss)
export const WS_BASE_URL = USE_LOCAL_BACKEND
  ? `ws://${LOCAL_HOST}:8080/ws/chat`
  : `wss://${PROD_HOST}/ws/chat`;

export const STORAGE_KEYS = {
  accessToken: 'fitto.accessToken',
  refreshToken: 'fitto.refreshToken',
  // 온보딩 인트로를 한 번 본 뒤로는 다시 보여주지 않기 위한 플래그
  onboardingSeen: 'doubly.onboardingSeen',
  // 푸시 권한 사전 설명을 한 번 보여준 뒤로는 다시 묻지 않기 위한 플래그
  pushPrimed: 'doubly.pushPrimed',
} as const;

/**
 * Cloudinary 이미지 업로드 설정.
 * 무료 계정 생성 → Settings → Upload → unsigned upload preset 만들고 아래 두 값 채우기.
 * (docs/IMAGE_UPLOAD.md 참고)
 */
export const CLOUDINARY = {
  cloudName: 'l0z6b5eu',
  uploadPreset: 'fitto_unsigned',
};

export const isCloudinaryConfigured = () =>
  CLOUDINARY.cloudName !== 'YOUR_CLOUD_NAME' && CLOUDINARY.uploadPreset !== 'YOUR_UNSIGNED_PRESET';

/**
 * 카카오맵 JavaScript 키 (맛집 지도).
 * 클라이언트 노출 전제 키 — 카카오 개발자 콘솔의 Web 플랫폼 도메인 등록으로 보호된다.
 * (등록 필요: http://localhost:8081 + 웹 배포 도메인)
 */
export const KAKAO_JS_KEY = '6d931bf80f9fc59a27ef78e3c135c91e';

export const isKakaoMapConfigured = () => KAKAO_JS_KEY.length > 0;

/**
 * Sentry DSN — 크래시/에러 리포팅.
 *
 * DSN 은 클라이언트 번들에 포함되는 것을 전제로 설계된 값이라 노출되어도 무방하다
 * (카카오 JS 키와 동일한 성격). 이벤트 전송만 가능하고 데이터 조회는 불가능하다.
 *
 * 비워두면 리포팅이 비활성화되고 콘솔 출력으로 폴백한다.
 */
export const SENTRY_DSN =
  'https://0e49f62524d1765099062ca6247613d0@o4511765897019392.ingest.us.sentry.io/4511765904097280';

/**
 * 앱 버전 — 설정 화면 표시용.
 * expo-constants 를 의존성에 추가하지 않기 위해 상수로 둔다.
 * ⚠️ app.json / package.json 의 version 을 올릴 때 여기도 함께 올려야 한다.
 */
export const APP_VERSION = '1.0.0';
