#!/usr/bin/env node
/**
 * Play 서비스 계정 권한 점검 — 백엔드가 결제에 쓰는 Play Developer API 호출이 권한 때문에 막히지 않는지 본다.
 *
 * 서버는 구독 조회·결제 승인(acknowledge)·무효 결제(환불) 조회를 이 서비스 계정으로 한다
 * (backend `GooglePlayDeveloperApiClient`, docs/my-current-state.md §7-2 후속 조치). 권한이 없으면
 * 서버는 실패를 로그 warn 으로만 남기고 넘어가서, 결제는 깨지지 않지만 보호(3일 자동 환불 방지·
 * 환불 크레딧 회수)도 조용히 안 된다. 그래서 결제를 기다리지 않고 미리 확인한다.
 *
 * 무엇을 하나 — 전부 아무것도 바꾸지 않는다:
 *   ① 무효 결제 목록 1건 조회(GET)                         → "재무 데이터, 주문, 취소 설문조사 응답 보기"
 *   ② 구독 상태 조회 — 존재하지 않는 가짜 토큰으로(GET)    → 구독 동기화가 쓰는 조회 권한
 *   ③ 구독·일회성 상품 승인 — 존재하지 않는 가짜 토큰으로  → "주문 및 구독 관리"
 * ②③은 가짜 토큰이라 결제가 없으므로 아무 일도 일어나지 않는다. Google 은 권한부터 보므로
 * 권한이 없으면 401/403, 있으면 "토큰이 틀렸다"(400/404/410)로 답한다 — 그 차이로 권한을 판정한다.
 *
 * 어느 키를 쓰나 — **백엔드가 쓰는 키**로 봐야 의미가 있다. 제출용 키(secrets/)와 다를 수 있다.
 *   PLAY_SERVICE_ACCOUNT_JSON_BASE64=<Railway 의 GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 값> node scripts/check-play-permissions.mjs
 *   node scripts/check-play-permissions.mjs        # 없으면 secrets/play-service-account.json (check-play-track.mjs 와 같은 키)
 * 어느 계정으로 봤는지 맨 위에 출력한다 — Play Console 사용자 및 권한의 이메일과 대조한다.
 *
 * 권한을 바꾼 직후에는 Google 쪽 반영이 늦을 수 있다(몇 시간~하루). 그때는 잠시 뒤 다시 돌린다.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const KEY_PATH = process.env.PLAY_SERVICE_ACCOUNT_KEY || 'secrets/play-service-account.json';
const PKG = process.env.PLAY_PACKAGE_NAME || 'com.doubly.app';
// 서버의 SubscriptionProducts.PRO · CreditProduct 와 같은 상품 id
const SUBSCRIPTION_ID = 'pro_monthly';
const CREDIT_PRODUCT_ID = 'emoji_set_1';
const FAKE_TOKEN = 'permission-check-not-a-real-token';

function loadKey() {
  const fromEnv = process.env.PLAY_SERVICE_ACCOUNT_JSON_BASE64;
  if (fromEnv && fromEnv.trim()) {
    try {
      return { key: JSON.parse(Buffer.from(fromEnv.trim(), 'base64').toString('utf8')), source: 'PLAY_SERVICE_ACCOUNT_JSON_BASE64' };
    } catch {
      console.error('PLAY_SERVICE_ACCOUNT_JSON_BASE64 를 해석하지 못했다 — base64 로 인코딩한 서비스 계정 JSON 이어야 한다.');
      process.exit(1);
    }
  }
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`서비스 계정 키가 없다: ${KEY_PATH}\n백엔드 키로 보려면 PLAY_SERVICE_ACCOUNT_JSON_BASE64 를 넘긴다(파일 머리 주석 참고).`);
    process.exit(1);
  }
  return { key: JSON.parse(fs.readFileSync(KEY_PATH, 'utf8')), source: KEY_PATH };
}

async function accessToken(key) {
  const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const signingInput = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 300,
  })}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  });
  const body = await res.json();
  if (!body.access_token) {
    console.error('토큰 발급 실패:', res.status, body.error_description || body.error || '');
    console.error('키가 폐기됐거나 잘못된 JSON 이다. Google Cloud 콘솔에서 서비스 계정 키 상태를 확인한다.');
    process.exit(1);
  }
  return body.access_token;
}

/** 권한 없음 = 401/403. 그 밖의 4xx 는 "권한은 있고 요청(가짜 토큰)이 틀렸다". */
function verdict(status) {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'denied';
  if (status >= 400 && status < 500) return 'ok';
  return 'unknown';
}

const { key, source } = loadKey();
const token = await accessToken(key);
const auth = { Authorization: `Bearer ${token}` };
const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

const checks = [
  {
    name: '무효 결제(환불) 조회',
    permission: '재무 데이터, 주문, 취소 설문조사 응답 보기',
    usedBy: '환불된 크레딧 회수',
    request: () => fetch(`${api}/purchases/voidedpurchases?maxResults=1`, { headers: auth }),
  },
  {
    name: '구독 상태 조회',
    permission: '재무 데이터, 주문, 취소 설문조사 응답 보기',
    usedBy: '구독 검증·웹훅 동기화',
    request: () => fetch(`${api}/purchases/subscriptionsv2/tokens/${FAKE_TOKEN}`, { headers: auth }),
  },
  {
    name: '구독 결제 승인',
    permission: '주문 및 구독 관리',
    usedBy: '3일 자동 환불 방지(구독)',
    request: () =>
      fetch(`${api}/purchases/subscriptions/${SUBSCRIPTION_ID}/tokens/${FAKE_TOKEN}:acknowledge`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: '{}',
      }),
  },
  {
    name: '일회성 상품 승인',
    permission: '주문 및 구독 관리',
    usedBy: '3일 자동 환불 방지(이모지 크레딧)',
    request: () =>
      fetch(`${api}/purchases/products/${CREDIT_PRODUCT_ID}/tokens/${FAKE_TOKEN}:acknowledge`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: '{}',
      }),
  },
];

console.log(`서비스 계정: ${key.client_email}`);
console.log(`키 출처:     ${source}`);
console.log(`앱:          ${PKG}\n`);

let denied = 0;
for (const check of checks) {
  let status;
  let message = '';
  try {
    const res = await check.request();
    status = res.status;
    const body = await res.json().catch(() => ({}));
    message = body?.error?.message || '';
  } catch (e) {
    status = 0;
    message = e.message;
  }
  const v = verdict(status);
  const mark = v === 'ok' ? '✓' : v === 'denied' ? '✗' : '?';
  console.log(`${mark} ${check.name.padEnd(14)} HTTP ${status}  — ${check.usedBy}`);
  if (v === 'denied') {
    denied++;
    console.log(`    권한 필요: "${check.permission}"`);
    if (message) console.log(`    Google: ${message}`);
  } else if (v === 'unknown') {
    console.log(`    판정 불가(서버 오류·네트워크) — 잠시 뒤 다시 돌린다.${message ? ` ${message}` : ''}`);
  }
}

console.log('');
if (denied === 0) {
  console.log('필요한 권한이 모두 있다.');
} else {
  console.log(`권한이 없는 항목 ${denied}개 — Play Console > 사용자 및 권한 > ${key.client_email} > 앱 권한(Dubly)에서 켠다.`);
  console.log('켠 직후에는 반영이 늦을 수 있다(몇 시간~하루). 그 뒤 다시 돌린다.');
  process.exitCode = 1;
}
