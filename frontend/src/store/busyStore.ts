/**
 * 작업 진행 중 화면 잠금 — 어디서든 `runBusy('올리는 중…', fn)` 으로 감싼다.
 *
 * 사진 업로드·AI 분석은 몇 초에서 1분까지 걸린다. 버튼 하나만 로딩으로 바꾸면
 * 사용자는 "안 눌렸나?" 하고 다른 곳을 누르거나 뒤로 가서, 중복 업로드·이탈이 생긴다.
 * 그래서 작업 동안 화면 전체를 덮어 입력을 막고 무슨 일이 일어나는지 알려준다.
 *
 * 토스트와 같은 구조(zustand + 전역 헬퍼)라 컴포넌트 밖에서도 호출할 수 있다.
 */
import { create } from 'zustand';

interface BusyState {
  /** 표시할 메시지 — null 이면 오버레이가 없다 */
  message: string | null;
  /** 겹친 작업 수 — 중첩 호출에서 안쪽이 끝났다고 바깥까지 풀리면 안 된다 */
  depth: number;
  show: (message: string) => void;
  hide: () => void;
}

export const useBusyStore = create<BusyState>((set) => ({
  message: null,
  depth: 0,
  show: (message) => set((s) => ({ message, depth: s.depth + 1 })),
  hide: () =>
    set((s) => {
      const depth = Math.max(0, s.depth - 1);
      return { depth, message: depth === 0 ? null : s.message };
    }),
}));

/**
 * 작업을 화면 잠금으로 감싼다. 성공·실패와 무관하게 반드시 풀린다.
 * 예외는 그대로 던지므로 호출부의 try/catch·토스트 처리는 그대로 둔다.
 */
export async function runBusy<T>(message: string, task: () => Promise<T>): Promise<T> {
  useBusyStore.getState().show(message);
  try {
    return await task();
  } finally {
    useBusyStore.getState().hide();
  }
}
