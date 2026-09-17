#!/usr/bin/env node
/**
 * App Store 인앱 구입 키가 진짜 동작하는지 확인 — Railway 에 넣기 전에 10초 만에 본다.
 *
 * 이 키는 틀려도 조용하다. 잘못 넣으면 증상이 "결제는 됐는데 PRO 가 안 열림" 하나뿐이고,
 * 그걸 알아채는 건 심사자가 먼저다. 특히 흔한 실수가 <b>제출용 키</b>(eas.json 의
 * ascApiKeyPath)를 넣는 것인데, 그건 여기서 401 로 바로 드러난다.
 *
 * 판정법: 없는 거래 id 를 하나 물어본다. <b>401 이 아니면 인증은 통과한 것이다</b> —
 * 애플은 JWT 를 먼저 검사하고, 그게 통과해야 거래 id 를 본다.
 *   - 401                     -> 키/발급자 ID/키 ID/번들 ID 중 하나가 틀렸다
 *   - 404 + errorCode 4040010 -> 인증 통과, 그런 거래가 없다  = <b>키 정상</b>
 *   - 400 + errorCode 4000006 -> 인증 통과, 거래 id 형식이 아니다 = <b>키 정상</b>
 *   - 200                     -> 실제 거래 id 를 넘겼고 구독 상태까지 읽혔다
 *
 *   node scripts/check-app-store-key.mjs [transactionId]
 *
 * 값은 환경변수로도 받는다(없으면 아래 기본 경로·값):
 *   APP_STORE_KEY_PATH  (기본: secrets/ 안의 AuthKey_*.p8 자동 탐색)
 *   APP_STORE_ISSUER_ID / APP_STORE_KEY_ID / APP_STORE_BUNDLE_ID
 *
 * 발급 절차는 docs/APP_STORE_BILLING.md 3절.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ISSUER = process.env.APP_STORE_ISSUER_ID;
// iOS 번들 ID 는 안드로이드 패키지명과 다르다 — app.json 의 ios.bundleIdentifier 다.
// JWT 의 bid 가 안 맞으면 애플은 401 을 준다(무엇이 틀렸는지는 말해주지 않는다).
const BUNDLE = process.env.APP_STORE_BUNDLE_ID || 'com.doubly.app.ios';
let keyPath = process.env.APP_STORE_KEY_PATH;
let keyId = process.env.APP_STORE_KEY_ID;

/*
 * 파일 이름에서 키 ID 를 읽는다. 애플이 주는 이름이 두 가지다 —
 * App Store Connect API 키는 AuthKey_XXXXXXXXXX.p8, 인앱 구입 키는
 * SubscriptionKey_XXXXXXXXXX.p8 로 받은 사례가 있다. 둘 다 받아준다.
 */
const KEY_FILE = /^(?:AuthKey|SubscriptionKey)_(\w{10})\.p8$/;
const p8sIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.p8')) : []);

if (!keyPath) {
  const named = p8sIn('secrets').filter((f) => KEY_FILE.test(f));
  if (named.length === 1) keyPath = path.join('secrets', named[0]);
  else if (named.length > 1) {
    console.error(`secrets/ 에 키가 ${named.length} 개다 — APP_STORE_KEY_PATH 로 지정한다:\n  ${named.join('\n  ')}`);
    process.exit(1);
  }
}
if (!keyId && keyPath) {
  keyId = KEY_FILE.exec(path.basename(keyPath))?.[1];
}

// 키 ID 는 아래에서 파일 이름으로 채워질 수 있으므로 여기서 요구하지 않는다.
const missing = [
  !keyPath && 'APP_STORE_KEY_PATH (또는 secrets/AuthKey_*.p8 · SubscriptionKey_*.p8)',
  !ISSUER && 'APP_STORE_ISSUER_ID',
].filter(Boolean);
if (missing.length) {
  console.error(`빠진 값:\n  ${missing.join('\n  ')}\n\n발급 절차: docs/APP_STORE_BILLING.md 3절`);
  process.exit(1);
}
if (!fs.existsSync(keyPath)) {
  // 이름을 잘못 짚은 경우가 대부분이라, 있는 것을 보여주고 끝낸다.
  const here = p8sIn('secrets');
  console.error(`키 파일이 없다: ${keyPath}`);
  console.error(here.length
    ? `\nsecrets/ 에 있는 .p8:\n  ${here.join('\n  ')}\n\n위 이름으로 APP_STORE_KEY_PATH 를 다시 지정한다.`
    : '\nsecrets/ 에 .p8 이 하나도 없다. 다운로드한 파일을 그 폴더로 옮긴다.');
  process.exit(1);
}
if (!keyId) {
  console.error(`키 ID 를 파일 이름에서 읽지 못했다: ${path.basename(keyPath)}`);
  console.error('APP_STORE_KEY_ID 로 직접 지정한다(App Store Connect 의 키 목록에 있는 10자리).');
  process.exit(1);
}

/*
 * 발급자 ID 는 UUID 다. 키 ID(10자)를 여기 넣는 실수가 잦아서 — 두 값이 같은 화면에
 * 나란히 있다 — 애플에 물어보기 전에 형식부터 막는다. 401 만 보고는 무엇이 틀렸는지
 * 알 수 없으므로, 알 수 있는 것은 여기서 먼저 걸러 준다.
 */
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ISSUER)) {
  console.error(`발급자 ID 형식이 아니다: ${ISSUER}`);
  console.error('  발급자 ID 는 UUID 다 — 예: 69a6de70-1234-5678-9abc-def012345678 (36자)');
  console.error(`  10자짜리(${keyId ?? 'XXXXXXXXXX'})는 키 ID 다. 두 값은 다르다.`);
  console.error('\n  App Store Connect > 사용자 및 액세스 > 통합 > 앱 내 구입 페이지의');
  console.error('  "Issuer ID" 를 복사한다(계정에 하나뿐이라 제출용과 같은 값이다).');
  process.exit(1);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const iat = Math.floor(Date.now() / 1000);
const signingInput = `${b64({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${b64({
  iss: ISSUER,
  iat,
  exp: iat + 600,
  aud: 'appstoreconnect-v1',
  bid: BUNDLE,
})}`;
// JWS 는 r||s 원시 형식을 요구한다 — DER 로 서명하면 애플이 401 을 준다.
const signature = crypto
  .sign('sha256', Buffer.from(signingInput), {
    key: crypto.createPrivateKey(fs.readFileSync(keyPath, 'utf8')),
    dsaEncoding: 'ieee-p1363',
  })
  .toString('base64url');
const token = `${signingInput}.${signature}`;

/*
 * 인증만 확인할 때 쓰는 더미. 애플 거래 id 는 2 로 시작하는 16자리라, 그 모양을 지키되
 * 실제로는 없을 값을 쓴다 — 형식이 아예 틀리면(예: 0 으로 시작) 4000006 이 돌아오는데
 * 그것도 인증 통과이긴 하지만 "없는 거래"라는 더 명확한 4040010 을 받는 편이 낫다.
 */
const transactionId = process.argv[2] || '2000000000000000';
const hosts = [
  ['프로덕션', 'https://api.storekit.itunes.apple.com'],
  ['샌드박스', 'https://api.storekit-sandbox.itunes.apple.com'],
];

console.log(`키 ${keyId} · 발급자 ${ISSUER.slice(0, 8)}… · 번들 ${BUNDLE}`);
console.log(`거래 id ${transactionId}${process.argv[2] ? '' : ' (인증 확인용 더미)'}\n`);

let authOk = false;
for (const [label, host] of hosts) {
  let res;
  try {
    res = await fetch(`${host}/inApps/v1/subscriptions/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.log(`${label}: 연결 실패 — ${e.message}`);
    continue;
  }
  const body = await res.text();
  let json = {};
  try { json = JSON.parse(body); } catch { /* 본문이 JSON 이 아닐 수도 있다 */ }

  if (res.status === 401) {
    console.log(`${label}: 401 — 키·발급자 ID·키 ID 중 하나가 틀렸다.`);
    console.log(`   ① 번들 ID 가 다르다 — 지금 보낸 값은 ${BUNDLE} 이다.`);
    console.log('      iOS 번들 ID 는 안드로이드 패키지명과 다르다(app.json 의 ios.bundleIdentifier).');
    console.log('   ② 제출용 키(AuthKey_*.p8)를 넣었다 — 인앱 구입 키는 SubscriptionKey_*.p8 이다.');
    console.log('   ③ 키를 만든 직후라면 몇 분 뒤에 다시 시도한다.');
    break;
  }
  // 401 이 아니라 거래 id 를 문제 삼았다는 것 자체가 JWT 가 검증을 통과했다는 뜻이다.
  if ((res.status === 404 && json.errorCode === 4040010)
      || (res.status === 400 && json.errorCode === 4000006)) {
    console.log(`${label}: 인증 통과 (${json.errorMessage ?? '거래 없음'} — 더미 id 라 정상)`);
    authOk = true;
    continue;
  }
  if (res.status === 200) {
    const last = json?.data?.[0]?.lastTransactions?.[0];
    console.log(`${label}: 200 — 구독 상태 ${last?.status ?? '?'} (1 활성 · 2 만료 · 3 재시도 · 4 유예 · 5 해지)`);
    authOk = true;
    break;
  }
  console.log(`${label}: ${res.status} ${body.slice(0, 200)}`);
}

console.log(authOk ? '\n✓ 키가 동작한다. Railway 에 넣어도 된다.' : '\n✗ 아직 아니다. 위 메시지를 보고 고친다.');
/*
 * process.exit() 로 끝내지 않는다 — fetch 가 쓴 libuv 핸들이 아직 닫히는 중이면
 * Windows 의 Node 24 가 "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" 으로
 * 죽는다. 출력은 이미 다 나온 뒤라 무해하지만, 스크립트가 터진 것처럼 보인다.
 */
process.exitCode = authOk ? 0 : 1;
