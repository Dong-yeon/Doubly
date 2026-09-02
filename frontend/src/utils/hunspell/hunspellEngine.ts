/**
 * Hunspell 엔진 프로토타입 — RN/Expo 안에서 실제로 도는지 검증용.
 *
 * <p>아직 checkKoreanSpelling 에는 안 붙였다. 여기서 붙이기 전에 먼저 실기기에서
 * 로드·spell·suggest 가 실제로 동작하는지만 확인한다(2026-09-02 프로토타입).
 * 라이브러리: hunspell-asm(진짜 Hunspell을 WASM으로 컴파일), 사전: hunspell-dict-ko.
 */
/*
 * hunspell-asm 이 내부적으로 쓰는 nanoid@2 는 RN 환경이기만 하면(navigator.product===
 * 'ReactNative') crypto 유무와 무관하게 무조건 "secure random generator 없음" 에러를
 * 던진다 — 폴리필로는 못 피한다(실기기에서 react-native-get-random-values 로 시도해봤지만
 * 안 됐다, 2026-09-02). metro.config.js 에서 hunspell-asm 트리 안의 nanoid 요청만
 * nanoid/non-secure(순수 Math.random)로 우회시킨다 — 이 id 는 WASM 가상 파일시스템의
 * 임시 마운트 경로 이름일 뿐이라 보안 랜덤일 필요가 없다.
 */
import { loadModule, type Hunspell } from 'hunspell-asm';
import { KO_AFF_BASE64, KO_DIC_BASE64 } from './koDictionaryData';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 직접 짠 base64 디코더 — RN/Hermes 에 atob 가 항상 있다는 보장이 없어(환경마다 다름)
 * 전역에 기대지 않는다.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let bitBuffer = 0;
  let bitCount = 0;
  let outIdx = 0;
  for (let i = 0; i < clean.length; i++) {
    const val = B64_CHARS.indexOf(clean[i]);
    if (val === -1) continue;
    bitBuffer = (bitBuffer << 6) | val;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[outIdx++] = (bitBuffer >> bitCount) & 0xff;
    }
  }
  return bytes;
}

let instancePromise: Promise<Hunspell> | null = null;

/*
 * hunspell-asm 의 Emscripten 글루코드는 "window 가 있으면 브라우저다"라고 판단하는데,
 * RN 은 window 를 global 의 별칭으로 두면서도(그래서 이 판단은 true 가 된다) document 는
 * 아예 없다 — document.currentScript 에 접근하다 "Property 'document' doesn't exist" 로
 * 죽었다(실기기 확인, 2026-09-02). document.currentScript 가 없다고만 읽히면(=falsy) 그
 * 아래 분기로 자연스럽게 넘어가므로, 빈 객체 하나면 충분하다.
 */
function ensureDocumentShim() {
  if (typeof (global as { document?: unknown }).document === 'undefined') {
    (global as { document?: unknown }).document = {};
  }
}

/** 최초 호출 시에만 로드(수 MB WASM+사전 파싱이라 느릴 수 있다) — 이후는 캐시된 인스턴스 재사용 */
export function getHunspell(): Promise<Hunspell> {
  if (!instancePromise) {
    instancePromise = (async () => {
      ensureDocumentShim();
      const factory = await loadModule();
      const affPath = factory.mountBuffer(base64ToUint8Array(KO_AFF_BASE64), 'ko.aff');
      const dicPath = factory.mountBuffer(base64ToUint8Array(KO_DIC_BASE64), 'ko.dic');
      return factory.create(affPath, dicPath);
    })();
  }
  return instancePromise;
}
