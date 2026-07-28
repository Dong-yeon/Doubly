/**
 * 전역 날짜 선택기 상태 — {@link ConfirmDialog} 와 같은 구조다.
 *
 * <p><b>왜 전역인가</b>: 날짜를 고르는 화면 중 상당수(기념일 설정, 일정 추가, 대결 만들기)가
 * 이미 {@code <Modal>} 안에 있다. 그 안에서 또 Modal 을 띄우면 중첩이 되어
 * 플랫폼마다 쌓임 순서가 달라진다(웹에서는 뒤에 가려지기 쉽다).
 * 달력을 App 최상단의 형제로 두면 어느 화면에서 열든 항상 맨 위에 그려진다.
 */
import { create } from 'zustand';

export interface DatePickerRequest {
  /** 달력 상단 제목 (예: '시작일') */
  title: string;
  /** 현재 값 (YYYY-MM-DD). 없으면 오늘 기준으로 연다 */
  value?: string | null;
  /** 선택 가능한 하한/상한 (YYYY-MM-DD, 경계 포함) */
  min?: string;
  max?: string;
}

type Pending = DatePickerRequest & { resolve: (value: string | null) => void };

interface DatePickerState {
  request: Pending | null;
  open: (request: DatePickerRequest) => Promise<string | null>;
  /** 선택 완료(날짜) 또는 취소(null) */
  close: (value: string | null) => void;
}

export const useDatePickerStore = create<DatePickerState>((set, get) => ({
  request: null,

  open: (request) =>
    new Promise<string | null>((resolve) => {
      // 이미 열려 있으면 이전 요청은 취소로 정리한다 — 대기 중인 Promise 를 남기지 않는다
      get().request?.resolve(null);
      set({ request: { ...request, resolve } });
    }),

  close: (value) => {
    const pending = get().request;
    set({ request: null });
    pending?.resolve(value);
  },
}));

/**
 * 달력을 띄우고 고른 날짜를 돌려준다. 취소하면 null.
 *
 * ```ts
 * const picked = await pickDate({ title: '시작일', value: startDate });
 * if (picked) setStartDate(picked);
 * ```
 */
export function pickDate(request: DatePickerRequest): Promise<string | null> {
  return useDatePickerStore.getState().open(request);
}
