/**
 * 본문에서 링크를 찾아 조각으로 나눈다 — 순수 함수. 채팅 말풍선이 링크 부분만 탭할 수 있게
 * 그리는 데 쓴다({@code components/LinkedText}).
 *
 * <p><b>왜 정규식 유니코드 속성(`\p{…}`)을 쓰지 않는가</b>: emojiOnly.ts 와 같은 이유 —
 * 엔진(Hermes/JSC)에 따라 지원이 갈리고, 여기서 터지면 <b>모든 텍스트 말풍선</b>이 죽는다.
 *
 * <p><b>무엇을 링크로 보는가</b>: {@code http://}·{@code https://} 로 시작하거나 {@code www.} 로
 * 시작하는 덩어리. 공백·꺾쇠·따옴표에서 끊고, 끝에 붙은 문장부호({@code .,;:!?})와 닫는 괄호는
 * 링크에서 뺀다 — "이거 봐 https://a.com/x." 의 마침표는 문장의 것이다. 한글 경로
 * (namu.wiki/w/한글 같은)는 국내 링크에 흔해 <b>비 ASCII 를 끊지 않는다</b>. 그 대가로
 * "https://a.com봐봐" 처럼 띄어쓰기 없이 붙인 한글은 링크에 딸려 간다 — 붙여넣은 링크 뒤에
 * 공백 없이 타이핑하는 경우는 드물고, 잘못 열려도 사용자가 바로 안다.
 */

export interface TextSegment {
  text: string;
  /** 있으면 링크 — 열 때 쓰는 절대 URL(www. 는 https:// 를 붙인다) */
  url?: string;
}

const SCHEME = /^https?:\/\//i;
/** 링크를 끝내는 문자 — 공백류와 링크를 감싸기 흔한 문자 */
const STOP = ' \t\r\n<>"\'`';
/** 끝에서 떼어내는 문장부호와 닫는 괄호 */
const TRAILING = '.,;:!?)]}>』」”’';

function isStop(ch: string): boolean {
  return STOP.includes(ch);
}

/** i 위치에서 링크가 시작하는가 — 앞 글자가 단어 문자면 아니다("abchttp://" 방지) */
function startsLinkAt(text: string, i: number): boolean {
  if (i > 0) {
    const prev = text[i - 1];
    if (/[A-Za-z0-9@.\-_/]/.test(prev)) return false;
  }
  const rest = text.slice(i, i + 8);
  if (SCHEME.test(rest)) return true;
  return /^www\.[^\s.]/i.test(rest);
}

/** 링크 끝(배타) 인덱스 — 문장부호 정리까지 마친 위치 */
function linkEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && !isStop(text[end])) end++;
  // 여는 괄호 없이 닫는 괄호로 끝나면 문장의 괄호다: "(https://a.com)" 의 ')'
  while (end > start) {
    const ch = text[end - 1];
    if (!TRAILING.includes(ch)) break;
    if (ch === ')' && text.slice(start, end).includes('(')) break;
    end--;
  }
  return end;
}

/** 본문을 텍스트/링크 조각으로 나눈다. 링크가 없으면 조각 하나 */
export function splitLinks(text: string): TextSegment[] {
  if (!text) return [{ text: '' }];
  const out: TextSegment[] = [];
  let plainStart = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if ((ch === 'h' || ch === 'H' || ch === 'w' || ch === 'W') && startsLinkAt(text, i)) {
      const end = linkEnd(text, i);
      // "www." 만 있거나 스킴만 있는 건 링크가 아니다
      const raw = text.slice(i, end);
      const body = raw.replace(SCHEME, '');
      if (body.length >= 3 && body.includes('.')) {
        if (i > plainStart) out.push({ text: text.slice(plainStart, i) });
        out.push({ text: raw, url: SCHEME.test(raw) ? raw : `https://${raw}` });
        plainStart = end;
        i = end;
        continue;
      }
    }
    i++;
  }
  if (plainStart < text.length) out.push({ text: text.slice(plainStart) });
  return out.length > 0 ? out : [{ text }];
}

export function hasLink(text: string): boolean {
  return splitLinks(text).some((s) => !!s.url);
}
