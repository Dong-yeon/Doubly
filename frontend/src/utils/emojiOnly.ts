/**
 * "이모지만 있는 메시지"인지 판정한다 — 그런 메시지는 말풍선 없이 크게 그린다
 * (카카오톡·아이메시지와 같은 관습).
 *
 * <p><b>왜 필요한가</b>: 2026-09-15 에 유니코드 이모지 시트("스티커 보내기")를 없앴다.
 * 폰 키보드가 이미 하는 일을 앱 안에 한 벌 더 둔 것이었는데(이모지 팩을 폐지한 것과 같은
 * 논리), 그 시트에만 있던 값은 <b>"큰 이모지"</b> 하나였다 — 시트에서 고르면 STICKER 로
 * 나가 말풍선 없이 56px 로 그려졌고, 같은 이모지를 입력창에 타이핑하면 말풍선 안 작은
 * 글자였다. 판정을 렌더 쪽으로 옮기면 시트 없이도 그 값이 남는다.
 *
 * <p><b>왜 정규식 `\p{Extended_Pictographic}` 를 쓰지 않는가</b>: Unicode 속성 이스케이프는
 * 엔진(Hermes/JSC) 버전에 따라 지원이 갈린다. 여기서 터지면 <b>모든 메시지 렌더가</b>
 * 죽으므로, 코드포인트 범위를 직접 본다.
 */

/** 이모지로 취급하는 코드포인트 범위 — 넓게 잡되 한글·숫자·문장부호는 절대 포함하지 않는다. */
const EMOJI_RANGES: readonly [number, number][] = [
  [0x1f000, 0x1faff], // 그림문자 전반(감정·사물·동물·음식·국기 조합용 지역 표시자 포함)
  [0x2600, 0x27bf], // 기타 기호 + 딩뱃(☕ ★ ✅ ✨ …)
  [0x2b00, 0x2bff], // 별·굵은 화살표(⭐ ⬆️ …)
  [0x2300, 0x23ff], // 기술 기호(⌚ ⏰ ⏯️ …)
  [0x1f1e6, 0x1f1ff], // 지역 표시자(국기) — 위 범위에 이미 들지만 뜻을 남겨 둔다
];

/*
 * 일부러 넣지 않은 범위 — 오탐이 더 나쁘다.
 *
 * <p>화살표(2190–21FF)와 도형(25A0–25FF)은 이모지로도 쓰이지만("↗️" "◼️") 맨 글자
 * "→" "■" 로 타이핑하는 쪽이 훨씬 흔하다. 그것까지 이모지로 보면 "→" 한 글자를 보낸
 * 메시지가 56px 로 커진다. 뺀 대가는 "↗️" 같은 이모지가 말풍선에 들어가는 것뿐이다.
 */

/**
 * 이모지 자체가 아니라 <b>붙어서 모양만 바꾸는</b> 코드포인트 — 개수를 셀 때 제외한다.
 * 변이 선택자(FE0F/FE0E), 결합자(ZWJ), 피부색 수정자, 키캡 결합 기호, 태그 문자.
 */
function isModifier(cp: number): boolean {
  return (
    cp === 0xfe0f ||
    cp === 0xfe0e ||
    cp === 0x200d ||
    cp === 0x20e3 ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0xe0020 && cp <= 0xe007f)
  );
}

function isEmojiCodePoint(cp: number): boolean {
  return EMOJI_RANGES.some(([from, to]) => cp >= from && cp <= to);
}

/**
 * 이모지(와 공백)만으로 이루어진 문자열이면 <b>이모지 개수</b>를, 아니면 0 을 돌려준다.
 *
 * <p>개수를 함께 주는 이유: 하나일 때와 여럿일 때 크기를 달리 그리고, 너무 많으면
 * (예: 이모지 20개) 큰 글자로 그리면 화면을 덮으므로 호출부가 상한을 정할 수 있어야 한다.
 */
export function emojiOnlyCount(text: string | null | undefined): number {
  if (!text) {
    return 0;
  }
  let count = 0;
  for (const ch of text.trim()) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) {
      return 0;
    }
    if (isModifier(cp)) {
      continue;
    }
    // 이모지 사이의 공백은 허용한다 — "❤️ 🙂" 처럼 띄어 보내는 경우가 흔하다
    if (ch === ' ' || ch === '\n' || ch === '\t') {
      continue;
    }
    if (!isEmojiCodePoint(cp)) {
      return 0;
    }
    count += 1;
  }
  return count;
}
