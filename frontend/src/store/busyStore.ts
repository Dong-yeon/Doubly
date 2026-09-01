/**
 * 작업 진행 중 화면 잠금 — 어디서든 `runBusy('올리는 중…', fn)` 으로 감싼다.
 *
 * 사진 업로드는 몇 초 걸린다. 버튼 하나만 로딩으로 바꾸면 사용자는 "안 눌렸나?" 하고
 * 다른 곳을 누르거나 뒤로 가서, 중복 업로드·이탈이 생긴다.
 * 그래서 작업 동안 화면 전체를 덮어 입력을 막고 무슨 일이 일어나는지 알려준다.
 *
 * <b>AI 호출에는 쓰지 않는다.</b> AI 는 백그라운드 작업 + 폴링으로 바뀌면서 대기가 분
 * 단위까지 늘 수 있는데(api/aiJob.ts), 그동안 앱 전체를 덮으면 사용자가 아무것도 못 한다.
 * 거기서 잠가야 할 것은 화면이 아니라 <b>그 버튼과 결과가 들어갈 자리</b>뿐이라,
 * 각 화면의 로딩 상태로 좁혀 처리한다. 이 오버레이는 <b>초 단위로 끝나는</b> 작업 전용이다.
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
