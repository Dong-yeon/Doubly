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

/*
 * 통화 벨/웨이크업 스파이크(claude/call-spike-android, PLAN.md "통화·영상통화" 참고) 전용
 * 오버라이드 — 스파이크 백엔드는 이 브랜치에만 있어(/api/v1/call-spike/token) fitto-production
 * 에는 없다. 별도 Railway 서비스를 띄우고 그 URL을 EAS 환경변수로 넘기면 여기서만 적용된다.
 * 값이 없으면(일반 빌드) 기존 동작 그대로다 — 메인 앱 흐름에 영향 없음.
 */
const CALL_SPIKE_API_URL = process.env.EXPO_PUBLIC_CALL_SPIKE_API_URL;
const CALL_SPIKE_WS_URL = process.env.EXPO_PUBLIC_CALL_SPIKE_WS_URL;

export const API_BASE_URL =
  CALL_SPIKE_API_URL ??
  (USE_LOCAL_BACKEND ? `http://${LOCAL_HOST}:8080/api/v1` : `https://${PROD_HOST}/api/v1`);

// STOMP over WebSocket — 설계서 4.5 (@stomp/stompjs brokerURL 스킴: 로컬 ws / 배포 wss)
export const WS_BASE_URL =
  CALL_SPIKE_WS_URL ??
  (USE_LOCAL_BACKEND ? `ws://${LOCAL_HOST}:8080/ws/chat` : `wss://${PROD_HOST}/ws/chat`);

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
 *
 * <p>클라이언트 노출 전제 키다 — 보호 장치는 키를 숨기는 게 아니라
 * <b>도메인 등록</b>이다. 카카오 개발자 콘솔에서
 * {@code 앱 → 플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인} 에
 * 쓰는 주소를 등록해야 한다 (http://localhost:8081 + 웹 배포 도메인).
 * 등록 안 된 곳에서의 요청은 거절된다.
 *
 * <p>키가 틀리면 SDK 요청이 <b>401</b> 로 떨어지고 지도가 뜨지 않는다.
 * 콘솔에서 JavaScript 키를 여러 개 만들 수 있으므로, 도메인을 등록한 키와
 * 여기 값이 같은지 확인할 것.
 *
 * <p>{@code EXPO_PUBLIC_KAKAO_JS_KEY} 로 덮어쓸 수 있다 — 키를 바꿀 때마다
 * 소스를 고치고 커밋할 필요가 없도록. (.env 또는 빌드 환경변수)
 */
export const KAKAO_JS_KEY =
  process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '8349ffe1bb05ed42c9c09dcab71970f1';

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
 * 구글 로그인 — Google Cloud Console(APIs & Services > Credentials)의 OAuth 클라이언트 id.
 * - webClientId: "웹 애플리케이션" 유형 — ID 토큰 발급 기준이라 필수
 * - androidClientId: "Android" 유형 — 패키지명 com.doubly.app + EAS 키스토어 SHA-1 등록
 *
 * 클라이언트 id 는 비밀값이 아니다(노출 전제). 비워두면 로그인 화면에서 구글 버튼이 숨겨진다.
 * ⚠️ 서버(Railway 의 GOOGLE_CLIENT_IDS)에도 같은 id 를 등록해야 토큰이 통과한다.
 */
export const GOOGLE_AUTH = {
  webClientId: '',
  androidClientId: '',
};

export const isGoogleLoginConfigured = () => GOOGLE_AUTH.webClientId.length > 0;

/**
 * 앱 버전 — 설정 화면 표시용.
 * expo-constants 를 의존성에 추가하지 않기 위해 상수로 둔다.
 * ⚠️ app.json / package.json 의 version 을 올릴 때 여기도 함께 올려야 한다.
 */
export const APP_VERSION = '1.0.0';

/**
 * 인앱결제가 붙었는가.
 *
 * <p>아직 `react-native-iap` 이 없어 <b>구매 흐름 자체가 존재하지 않는다.</b>
 * 업그레이드 시트가 "PRO 시작하기" 버튼을 띄워도 누를 곳이 없으므로, 결제를 연결하기
 * 전까지는 "준비 중" 안내만 보여준다 — 없는 화면으로 보내면 막다른 길이 된다.
 *
 * <p>결제를 붙일 때 이 값을 켜고 시트의 버튼에 구매 함수를 연결한다.
 */
export const PURCHASE_ENABLED = false;
