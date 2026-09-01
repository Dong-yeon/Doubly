/**
 * 진행 중인 운동 — <b>앱 전체가 아는</b> 상태.
 *
 * <p><b>왜 필요한가.</b> 예전엔 진행 중 세션이 운동 세션 화면의 메모리 안에만 있었다.
 * 그런데 하단 탭을 누르면 그 탭 스택이 popToTop 되면서 세션 화면이 <b>언마운트</b>되고,
 * 언마운트 정리가 초안을 지워버려서 하던 운동이 <b>경고도 흔적도 없이</b> 사라졌다.
 * 헬스장에서 노래 바꾸고 카톡 답하고 돌아오는 건 세트마다 일어나는 일이라, 그때마다
 * 기록이 날아갈 수 있는 앱은 쓸 수가 없다.
 *
 * <p><b>모델을 바꿨다.</b> 운동은 "화면이 떠 있는 동안"이 아니라 <b>시작해서 끝낼 때까지</b>
 * 살아 있다. 화면을 떠나는 것으로는 끝나지 않고, 끝내는 방법은 둘뿐이다 — <b>운동 완료</b>(저장)
 * 또는 <b>버리기</b>(명시적 확인). 짐워크·번핏이 쓰는 모델이 이거고, 그래서 그 앱들에선
 * 하던 운동을 잃어버릴 수가 없다.
 *
 * <p>이 스토어는 그 "살아 있음"을 화면 밖으로 꺼내 하단 고정 바와 운동 홈의
 * "이어서 하기"가 읽게 한다. <b>진실의 원본은 여전히 기기에 저장된 초안</b>
 * ({@code sessionDraft})이고, 여기 있는 건 그걸 요약한 표시용 사본이다 —
 * 앱을 껐다 켜도 {@link useActiveWorkoutStore.sync} 로 다시 맞춘다.
 */
import { create } from 'zustand';
import { loadSessionDraft, type SessionDraft } from '../screens/workout/sessionDraft';
import { toDateString } from '../utils/date';

/** 하단 바·재개 카드가 그리는 데 필요한 만큼만. 세션 전체를 들고 있지 않는다. */
export interface ActiveWorkoutSummary {
  /** 마지막 스냅샷 시각(ISO) — "N분 전까지 하던 운동" 안내에 쓴다 */
  savedAt: string;
  /** 완료 체크한 세트 수 */
  doneSets: number;
  /** 담긴 종목 수 */
  exerciseCount: number;
  /** 대표 이름 — 루틴이면 루틴명, 아니면 첫 종목명 */
  label: string;
}

interface ActiveWorkoutState {
  active: ActiveWorkoutSummary | null;
  /** 저장된 초안을 읽어 상태를 맞춘다 — 앱 시작·포그라운드 복귀 때 부른다. */
  sync: () => Promise<void>;
  /** 세션 화면이 스냅샷할 때마다 알린다. */
  publish: (draft: SessionDraft) => void;
  /** 저장했거나 버렸다 — 더 이상 진행 중이 아니다. */
  clear: () => void;
}

function summarize(draft: SessionDraft): ActiveWorkoutSummary {
  const doneSets = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  return {
    savedAt: draft.savedAt,
    doneSets,
    exerciseCount: draft.exercises.length,
    label: draft.routineTitle?.trim() || draft.exercises[0]?.name || '운동',
  };
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>((set) => ({
  active: null,

  sync: async () => {
    // loadSessionDraft 는 날짜가 지났거나 되살릴 게 없는 초안을 스스로 정리한다
    const draft = await loadSessionDraft(toDateString()).catch(() => null);
    set({ active: draft ? summarize(draft) : null });
  },

  /*
   * 빈 세션은 "진행 중"이 아니다 — 화면을 열었다 바로 나온 경우까지 바에 띄우면
   * 지울 수도 없는 안내가 계속 붙어 있게 된다. 읽기 쪽(loadSessionDraft)과 같은 기준이다.
   */
  publish: (draft) =>
    set({ active: draft.exercises.length > 0 ? summarize(draft) : null }),

  clear: () => set({ active: null }),
}));
