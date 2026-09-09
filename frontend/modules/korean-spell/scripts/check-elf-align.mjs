#!/usr/bin/env node
/**
 * .so 파일이 16KB 페이지 크기를 지원하는지 검사한다.
 *
 * Play 콘솔은 64비트 ABI(arm64-v8a, x86_64)의 모든 네이티브 라이브러리가 16KB 페이지
 * 크기를 지원해야 프로덕션 출시를 허용한다(Android 15+ 기기 대응). 판정 기준은 ELF
 * 프로그램 헤더의 PT_LOAD 세그먼트 p_align 이 전부 16384 이상인지다 — 링커에
 * `-Wl,-z,max-page-size=16384`(또는 NDK 28+ 기본값)로 만든 바이너리만 통과한다.
 *
 * 외부 도구(readelf 등) 없이 Node 만으로 돌아가므로 Windows 에서도 그대로 쓴다.
 *
 *   node scripts/check-elf-align.mjs android/src/main/jniLibs/arm64-v8a/libkiwi.so ...
 *
 * 하나라도 4KB 정렬이면 종료 코드 1.
 */
import { readFileSync } from 'node:fs';

const PT_LOAD = 1;
const REQUIRED = 16384;

function minLoadAlign(buf) {
  if (buf.readUInt32BE(0) !== 0x7f454c46) return null; // not ELF
  const is64 = buf[4] === 2;
  const phoff = is64 ? Number(buf.readBigUInt64LE(0x20)) : buf.readUInt32LE(0x1c);
  const phentsize = is64 ? buf.readUInt16LE(0x36) : buf.readUInt16LE(0x2a);
  const phnum = is64 ? buf.readUInt16LE(0x38) : buf.readUInt16LE(0x2c);
  let min = Infinity;
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    if (buf.readUInt32LE(o) !== PT_LOAD) continue;
    const align = is64 ? Number(buf.readBigUInt64LE(o + 48)) : buf.readUInt32LE(o + 28);
    min = Math.min(min, align);
  }
  return min;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node check-elf-align.mjs <file.so> [...]');
  process.exit(2);
}

let bad = 0;
for (const f of files) {
  const min = minLoadAlign(readFileSync(f));
  if (min === null) {
    console.log(`SKIP  (ELF 아님)          ${f}`);
    continue;
  }
  const ok = min >= REQUIRED;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '}  p_align=${String(min).padEnd(6)} ${f}`);
}
process.exit(bad ? 1 : 0);
