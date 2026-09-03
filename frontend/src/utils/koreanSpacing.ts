/**
 * 띄어쓰기 교정 — Kiwi 형태소 분석기(네이티브)로 문장의 띄어쓰기를 고친다.
 *
 * <p><b>채팅에는 쓰지 않는다.</b> 커플 채팅에서는 "오늘 시간돼?" 처럼 붙여 쓰는 게
 * 말투라, 띄어쓰기를 지적하면 그 자체가 오탐이 된다 — 규칙 엔진도 채팅체 띄어쓰기는
 * 일부러 안 건드린다({@link ./koreanSpellRules}). 리뷰·일상 기록처럼 <b>문장을
 * 쓰는 화면</b>에서만 쓴다.
 *
 * <p><b>자동으로 고치지 않는다.</b> 맞춤법상으로는 맞아도 사용자가 원치 않는 변경이
 * 있다 — "천일이야"를 "천 일이야"로, "챙겨주셔서"를 "챙겨 주셔서"로 바꾼다(실기기
 * 확인). 단위명사를 띄어 쓰는 게 원칙이라 Kiwi 쪽이 틀린 건 아니지만, 커플 앱에서
 * "천일"은 하나의 말이다. 그래서 눌러야 바뀌고, 되돌릴 수 있게 만든다.
 *
 * <p>모델이 3~4초 로딩에 240MB 를 쓴다 — 화면에 들어올 때 미리 올리고 나갈 때 반드시
 * 내린다({@link useSpacingCorrection}).
 */
import KoreanSpell from '../../modules/korean-spell';

/** 준비 상태 — 화면이 버튼을 어떻게 보여줄지 정하는 데 쓴다 */
export type SpacingStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

let loadPromise: Promise<boolean> | null = null;

/**
 * 모델을 준비한다. 여러 번 불러도 실제 로딩은 한 번만 일어난다.
 *
 * <p>실패해도 던지지 않는다 — 32비트 기기에는 모델이 없고, 그렇다고 글쓰기 화면이
 * 망가질 이유는 없다. 그냥 이 기능만 빠진다.
 */
export function loadSpacing(): Promise<boolean> {
  if (!loadPromise) {
    loadPromise = KoreanSpell.loadSpacing().catch(() => false);
  }
  return loadPromise;
}

/**
 * 모델을 내리고 240MB 를 돌려준다. 다시 쓰려면 {@link loadSpacing} 을 다시 부른다.
 */
export async function unloadSpacing(): Promise<void> {
  loadPromise = null;
  try {
    await KoreanSpell.unloadSpacing();
  } catch {
    // 애초에 안 올라갔으면 내릴 것도 없다
  }
}

/** 띄어쓰기를 고친 문장. 준비 전이거나 실패하면 원문 그대로 */
export async function correctSpacing(text: string): Promise<string> {
  if (!text.trim()) return text;
  try {
    return await KoreanSpell.correctSpacing(text);
  } catch {
    return text;
  }
}

/**
 * 고칠 게 있는지 — 결과가 원문과 같으면 버튼을 눌러봐야 아무 일도 안 일어난다.
 * 공백만 다른지 비교하므로 다른 변화(있어선 안 되지만)가 있으면 다르다고 본다.
 */
export function isSameText(before: string, after: string): boolean {
  return before === after;
}
