/**
 * 채팅 링크 → "럽슐랭에 추가할까요?" 칩 — 어떤 링크에 칩을 띄우는가. 순수 함수(scripts/verify-place-link.mjs).
 *
 * <p><b>칩을 띄우는 것과 해석하는 것은 다른 일이다</b>: 여기는 문자열만 보고 판단한다. 서버는 칩을 눌렀을
 * 때만 부른다(POST /places/resolve-link) — 메시지가 그려질 때마다 부르면 스크롤 한 번에 요청이 수십 개다.
 *
 * <p>목록은 서버 {@code PlaceLinkHosts.ALLOWED_HOSTS} 와 같아야 한다. 범위를 넓힐 때(콘텐츠·인스타, 2차)는
 * 두 곳에 한 줄씩 더한다. docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md
 *
 * <p>URL 파싱에 {@code new URL()} 을 쓰지 않는다 — RN(Hermes)의 URL 구현은 hostname 등 일부 접근자가 없던
 * 시절이 있어, 여기서 터지면 모든 텍스트 말풍선이 같이 죽는다(linkify.ts 와 같은 이유로 보수적으로).
 */
import { splitLinks } from './linkify';

export const PLACE_LINK_HOSTS: readonly string[] = [
  'place.map.kakao.com',
  'kko.to',
  'map.kakao.com',
  'naver.me',
  'map.naver.com',
  'm.place.naver.com',
];

/** https://host[:443]/… 에서 host 를 꺼낸다 — https 가 아니거나 다른 포트·user@ 가 있으면 null */
export function httpsHostOf(url: string): string | null {
  const m = /^https:\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url.trim());
  if (!m) return null;
  let authority = m[1];
  if (authority.includes('@')) return null;
  const colon = authority.lastIndexOf(':');
  if (colon >= 0) {
    if (authority.slice(colon + 1) !== '443') return null;
    authority = authority.slice(0, colon);
  }
  const host = authority.toLowerCase().replace(/\.$/, '');
  return host || null;
}

/** 칩을 띄울 지도 링크인가 */
export function isPlaceLink(url: string): boolean {
  const host = httpsHostOf(url);
  return host != null && PLACE_LINK_HOSTS.includes(host);
}

/** 본문에서 첫 번째 지도 링크 — 없으면 null. 링크가 여러 개면 칩은 하나만(첫 지도 링크) */
export function findPlaceLink(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const seg of splitLinks(text)) {
    if (seg.url && isPlaceLink(seg.url)) return seg.url;
  }
  return null;
}
