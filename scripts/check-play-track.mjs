#!/usr/bin/env node
/**
 * Play 트랙별 versionCode 확인 — 제출 전에 "지금 뭐가 올라가 있나"를 5초 만에 본다.
 *
 * eas submit 은 올리기만 하고 현재 상태를 보여주지 않는다. 프로덕션에 뭐가 서비스 중인지
 * 모르는 채로 제출하면 되돌릴 때 어떤 버전으로 돌아가야 하는지도 모른다.
 *
 * androidpublisher 는 조회에도 edit 이 필요해 하나 만들고 바로 지운다 — 커밋하지 않으므로
 * 스토어에는 아무 변화가 없다. 서비스 계정 키 발급은 docs/EAS_BUILD.md 10-1 참고.
 *
 *   node scripts/check-play-track.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const KEY_PATH = process.env.PLAY_SERVICE_ACCOUNT_KEY || 'secrets/play-service-account.json';
const PKG = process.env.PLAY_PACKAGE_NAME || 'com.doubly.app';

if (!fs.existsSync(KEY_PATH)) {
  console.error(`서비스 계정 키가 없다: ${KEY_PATH}\ndocs/EAS_BUILD.md 10-1 절차로 발급해 그 경로에 둔다.`);
  process.exit(1);
}
const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

const iat = Math.floor(Date.now() / 1000);
const signingInput = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: key.client_email,
  scope: 'https://www.googleapis.com/auth/androidpublisher',
  aud: 'https://oauth2.googleapis.com/token',
  iat,
  exp: iat + 300,
})}`;
const assertion = `${signingInput}.${crypto.sign('RSA-SHA256', Buffer.from(signingInput), key.private_key).toString('base64url')}`;

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
});
const token = await tokenRes.json();
if (!token.access_token) {
  console.error('토큰 발급 실패:', tokenRes.status, token.error_description || token.error || '');
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token.access_token}` };
const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

const editRes = await fetch(`${api}/edits`, { method: 'POST', headers: auth });
const edit = await editRes.json();
if (!editRes.ok) {
  // 403 이면 Play Console 사용자 및 권한에서 서비스 계정을 초대했는지, androidpublisher API 를
  // 사용 설정했는지 확인한다(10-1의 4·5단계).
  console.error('edit 생성 실패:', editRes.status, edit?.error?.message || '');
  process.exit(1);
}

try {
  const res = await fetch(`${api}/edits/${edit.id}/tracks`, { headers: auth });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
  console.log(`${PKG} 트랙 현황`);
  for (const t of body.tracks || []) {
    const codes = (t.releases || []).flatMap((r) => r.versionCodes || []);
    const status = (t.releases || []).map((r) => r.status).join('/');
    console.log(`  ${t.track.padEnd(12)} ${codes.length ? codes.join(', ') : '(비어 있음)'}${status ? ` — ${status}` : ''}`);
  }
} finally {
  await fetch(`${api}/edits/${edit.id}`, { method: 'DELETE', headers: auth });
}
