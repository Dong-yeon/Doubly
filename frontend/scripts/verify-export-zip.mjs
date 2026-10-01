/**
 * 기록 내보내기 ZIP 작성기 검증 — utils/zipWriter.ts·utils/exportPaths.ts 를 건드리면 돌린다.
 *
 * 우리가 만든 ZIP 을 <b>다른 구현이 풀 수 있는가</b>가 핵심이라, 직접 파싱해 보는 것과 함께
 * 시스템에 있는 해제 도구(python zipfile → 없으면 tar)로 실제로 풀어 내용·CRC 를 대조한다.
 *
 * 실행: npm run verify:export-zip
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const tmp = mkdtempSync(join(tmpdir(), 'export-zip-'));
for (const name of ['zipWriter.ts', 'exportPaths.ts']) {
  copyFileSync(fileURLToPath(new URL(`../src/utils/${name}`, import.meta.url)), join(tmp, name));
}
const { ZipWriter, crc32, utf8, ZipLimitError } = await import(pathToFileURL(join(tmp, 'zipWriter.ts')));
const { mediaPath, extensionOf, zipFileName } = await import(pathToFileURL(join(tmp, 'exportPaths.ts')));

let failures = 0;
let passes = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

// ── CRC·UTF-8 — 표준 구현과 같아야 한다 ─────────────────────────
eq('crc32 빈 값', crc32(new Uint8Array()), 0);
eq('crc32 "123456789"(표준 검사값)', crc32(Buffer.from('123456789')), 0xcbf43926);
const rnd = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7919) % 256));
eq('crc32 = zlib.crc32', crc32(rnd), zlib.crc32 ? zlib.crc32(rnd) : crc32(rnd));
for (const s of ['abc', '한글 기록', '이모지 💕 끝', 'é ñ']) {
  eq(`utf8 "${s}"`, Buffer.from(utf8(s)).toString('hex'), Buffer.from(s, 'utf8').toString('hex'));
}

// ── 경로 규칙 ────────────────────────────────────────────────
eq('확장자 jpg', extensionOf('https://res.cloudinary.com/x/image/upload/v1/a/b.jpg', 'IMAGE'), 'jpg');
eq('확장자 쿼리 무시', extensionOf('https://x/y/z.PNG?x=1', 'IMAGE'), 'png');
eq('확장자 없으면 종류로', extensionOf('https://x/y/z', 'AUDIO'), 'm4a');
eq('확장자 이상하면 종류로', extensionOf('https://x/y/z.exe', 'IMAGE'), 'jpg');
eq('사진 경로', mediaPath({ section: 'feed_post_photos', rowId: 12, column: 'url', url: 'https://x/a.jpg', kind: 'IMAGE' }),
  'photos/feed_post_photos/12_url.jpg');
eq('음성 경로', mediaPath({ section: 'chat_messages', rowId: 3, column: 'content', url: 'https://x/v.m4a', kind: 'AUDIO' }),
  'audio/chat_messages/3_content.m4a');
eq('ZIP 이름', zipFileName(new Date(2026, 9, 1)), 'Dubly_기록_2026-10-01.zip');

// ── 실제 ZIP ────────────────────────────────────────────────
const files = [
  ['index.html', Buffer.from('<h1>우리 기록</h1>')],
  ['data/chat_messages.json', Buffer.from(JSON.stringify([{ id: 1, content: '안녕 💕' }]))],
  ['photos/feed_posts/1_image_url.jpg', rnd],
  ['빈파일.txt', Buffer.alloc(0)],
];
const chunks = [];
const zip = new ZipWriter({ write: (b) => chunks.push(Buffer.from(b)) });
for (const [name, data] of files) zip.addFile(name, new Uint8Array(data), new Date(2026, 9, 1, 12, 30, 10));
zip.finish();
zip.finish(); // 두 번 닫아도 목차가 두 번 붙지 않는다
const out = Buffer.concat(chunks);
eq('bytesWritten = 실제 길이', zip.bytesWritten, out.length);
eq('항목 수', zip.count, files.length);

// 직접 파싱 — 끝 표식에서 목차를 찾아 각 항목의 CRC·크기를 대조
const eocd = out.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
eq('끝 표식이 맨 끝 22바이트', out.length - eocd, 22);
eq('끝 표식 항목 수', out.readUInt16LE(eocd + 10), files.length);
let p = out.readUInt32LE(eocd + 16);
for (const [name, data] of files) {
  eq(`목차 서명 ${name}`, out.readUInt32LE(p), 0x02014b50);
  const nameLen = out.readUInt16LE(p + 28);
  eq(`목차 이름 ${name}`, out.subarray(p + 46, p + 46 + nameLen).toString('utf8'), name);
  eq(`UTF-8 플래그 ${name}`, (out.readUInt16LE(p + 8) & 0x0800) !== 0, true);
  const local = out.readUInt32LE(p + 42);
  const lnameLen = out.readUInt16LE(local + 26);
  const body = out.subarray(local + 30 + lnameLen, local + 30 + lnameLen + data.length);
  eq(`본문 ${name}`, createHash('sha1').update(body).digest('hex'), createHash('sha1').update(data).digest('hex'));
  p += 46 + nameLen;
}

// 다른 구현으로 풀기 — python zipfile 이 CRC 까지 검사한다(testzip)
const zipPath = join(tmp, 'out.zip');
writeFileSync(zipPath, out);
let external = 'none';
try {
  const py = `import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1])
bad=z.testzip()
print(json.dumps({"bad":bad,"names":z.namelist(),"chat":z.read("data/chat_messages.json").decode("utf-8")}))`;
  const res = JSON.parse(execFileSync(process.platform === 'win32' ? 'py' : 'python3', ['-c', py, zipPath]).toString());
  external = 'python';
  eq('python: CRC 오류 없음', res.bad, null);
  eq('python: 이름 목록', res.names, files.map((f) => f[0]));
  eq('python: 한글 내용', res.chat, files[1][1].toString('utf8'));
} catch {
  try {
    const listed = execFileSync('tar', ['-tf', zipPath]).toString().trim().split(/\r?\n/);
    external = 'tar';
    eq('tar: 이름 목록', listed, files.map((f) => f[0]));
  } catch {
    console.warn('  ! python·tar 모두 없어 외부 해제 검사를 건너뜀 — 직접 파싱 검사만 했다');
  }
}

// 한계 — 4GB 직전이면 거절
const big = new ZipWriter({ write: () => {} });
Object.defineProperty(big, 'offset', { value: 0xffffffff - 10, writable: true });
let limited = false;
try {
  big.addFile('x', new Uint8Array(100));
} catch (e) {
  limited = e instanceof ZipLimitError;
}
eq('4GB 넘으면 ZipLimitError', limited, true);

rmSync(tmp, { recursive: true, force: true });
console.log(`export-zip: ${passes} passed, ${failures} failed (외부 해제: ${external})`);
process.exit(failures ? 1 : 0);
