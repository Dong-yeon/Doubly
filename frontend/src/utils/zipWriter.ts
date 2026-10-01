/**
 * 압축하지 않는(store) ZIP 작성기 — 기록 내보내기용 (docs/DATA_EXPORT_2026-10-01.md §3).
 *
 * <p><b>왜 직접 만드나</b>: 라이브러리(jszip·fflate·react-native-zip-archive)는 의존성 추가라
 * 빌드 대상이 되고(CLAUDE.md 6절), 네이티브 zip 은 아예 새 빌드가 필요하다. 넣을 것이 이미
 * JPEG·m4a 라 다시 압축해도 거의 줄지 않으므로 store 방식이면 충분하고, 그러면 ZIP 은
 * "헤더 + 원본 바이트 + 목차" 일 뿐이라 이 파일 하나로 끝난다. 순수 TS 라 OTA 로 나간다.
 *
 * <p><b>한 장씩 흘려 쓴다</b>: 바이트를 {@link ZipSink} 로 바로 내보내므로 메모리에는 지금 넣는
 * 파일 하나만 있다(네이티브는 expo-file-system FileHandle.writeBytes, 검증 스크립트는 Buffer).
 *
 * <p><b>한계</b>: ZIP64 를 쓰지 않는다 — 전체 4GB·파일 65,535개를 넘으면 {@link ZipLimitError}.
 * 사진은 올릴 때 1024px 로 줄어 장당 수백 KB 라 수천 장이어도 1GB 안쪽이다.
 *
 * <p>검증: npm run verify:export-zip (시스템 unzip 으로 실제로 풀어 본다).
 */

export interface ZipSink {
  write(bytes: Uint8Array): void;
}

export class ZipLimitError extends Error {}

const MAX_U32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

let crcTable: Uint32Array | null = null;

function table(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

export function crc32(data: Uint8Array): number {
  const t = table();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** UTF-8 인코딩 — Hermes 의 TextEncoder 유무에 기대지 않는다. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
  }
  return Uint8Array.from(out);
}

/** ZIP 은 MS-DOS 시각을 쓴다 — 2초 단위, 1980년부터. 기기 현지 시각 그대로. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

interface Entry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

/** 리틀엔디언 바이트 묶음 — 헤더 하나를 만들 때만 쓴다. */
class Bytes {
  private buf: number[] = [];
  u16(v: number): this {
    this.buf.push(v & 0xff, (v >>> 8) & 0xff);
    return this;
  }
  u32(v: number): this {
    this.buf.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
    return this;
  }
  raw(bytes: Uint8Array): this {
    for (let i = 0; i < bytes.length; i++) this.buf.push(bytes[i]);
    return this;
  }
  done(): Uint8Array {
    return Uint8Array.from(this.buf);
  }
}

/** 범용 플래그 11번 비트 — 파일 이름이 UTF-8 이다(한글 이름이 깨지지 않게). */
const FLAG_UTF8 = 0x0800;
const VERSION = 20;

export class ZipWriter {
  private readonly sink: ZipSink;
  private readonly entries: Entry[] = [];
  private offset = 0;
  private finished = false;

  constructor(sink: ZipSink) {
    this.sink = sink;
  }

  /** 지금까지 쓴 바이트 수. */
  get bytesWritten(): number {
    return this.offset;
  }

  get count(): number {
    return this.entries.length;
  }

  private emit(bytes: Uint8Array): void {
    this.sink.write(bytes);
    this.offset += bytes.length;
  }

  /** 파일 하나를 넣는다. 이름은 {@code photos/feed_posts/12.jpg} 처럼 슬래시 경로. */
  addFile(path: string, data: Uint8Array, modified: Date = new Date()): void {
    if (this.finished) throw new Error('ZIP 을 이미 닫았어요.');
    if (this.entries.length >= MAX_ENTRIES) throw new ZipLimitError('파일이 너무 많아요.');
    if (this.offset + data.length + 1024 > MAX_U32) throw new ZipLimitError('4GB 를 넘었어요.');
    const name = utf8(path);
    const crc = crc32(data);
    const { time, date } = dosDateTime(modified);
    const header = new Bytes()
      .u32(0x04034b50)
      .u16(VERSION)
      .u16(FLAG_UTF8)
      .u16(0) // store
      .u16(time)
      .u16(date)
      .u32(crc)
      .u32(data.length)
      .u32(data.length)
      .u16(name.length)
      .u16(0)
      .raw(name)
      .done();
    this.entries.push({ name, crc, size: data.length, offset: this.offset, time, date });
    this.emit(header);
    this.emit(data);
  }

  addText(path: string, text: string, modified?: Date): void {
    this.addFile(path, utf8(text), modified);
  }

  /** 목차(central directory)와 끝 표식을 쓴다. 이 뒤로는 아무것도 넣을 수 없다. */
  finish(): void {
    if (this.finished) return;
    const start = this.offset;
    for (const e of this.entries) {
      this.emit(
        new Bytes()
          .u32(0x02014b50)
          .u16(VERSION)
          .u16(VERSION)
          .u16(FLAG_UTF8)
          .u16(0)
          .u16(e.time)
          .u16(e.date)
          .u32(e.crc)
          .u32(e.size)
          .u32(e.size)
          .u16(e.name.length)
          .u16(0)
          .u16(0)
          .u16(0)
          .u16(0)
          .u32(0)
          .u32(e.offset)
          .raw(e.name)
          .done(),
      );
    }
    const size = this.offset - start;
    this.emit(
      new Bytes()
        .u32(0x06054b50)
        .u16(0)
        .u16(0)
        .u16(this.entries.length)
        .u16(this.entries.length)
        .u32(size)
        .u32(start)
        .u16(0)
        .done(),
    );
    this.finished = true;
  }
}
