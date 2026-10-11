/**
 * 무드 시트의 "더 쓰기"가 그날 페이지로 넘기는 아직 저장하지 않은 값 — 메모리에서만 한 번 건넨다.
 *
 * <p><b>왜 라우트 파라미터로 넘기지 않나</b>: 웹에서는 React Navigation 이 파라미터를 URL 쿼리로 굽는다.
 * 실제로 {@code /JournalDay?draftBody=점심 먹고…} 가 주소창과 방문 기록에 남았다(2026-10-02 웹 확인).
 * 나만 보는 기록의 본문이 브라우저 기록·공유한 링크에 실리면 비공개 원칙이 깨진다. 그래서 파라미터에는
 * 날짜와 입구만 두고, 초안은 여기서 한 번 꺼내 쓰고 지운다(앱을 껐다 켜면 사라지는 것이 맞다).
 */
export interface JournalDraft {
  date: string;
  mood?: string;
  body?: string;
}

let pending: JournalDraft | null = null;

export function setJournalDraft(draft: JournalDraft): void {
  pending = draft;
}

/** 그 날짜의 초안을 꺼내고 지운다 — 날짜가 다르면 버린다(다른 날 페이지에 섞이지 않게) */
export function takeJournalDraft(date: string): JournalDraft | null {
  const draft = pending;
  pending = null;
  return draft && draft.date === date ? draft : null;
}
