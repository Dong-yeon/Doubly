/**
 * 운동 기록을 채팅에 공유할 때 쓰는 문구 — PR(자기 최고 기록) 갱신이 있으면
 * 알림창·채팅 카드 문구를 다르게 만든다. PR 여부는 백엔드가 저장 응답(`Workout.prs`)으로
 * 알려준다(WorkoutService.detectPrs) — 프론트는 문구만 조립한다.
 */
import type { WorkoutPrHighlight } from '../types';

/** 채팅 카드 본문의 PR 표시 접두어 — 채팅 렌더러(ChatRoomScreen)도 같은 문자열로 PR 카드를 구분한다(단일 출처). */
export const PR_SHARE_PREFIX = '🔥 PR 갱신!';

export interface WorkoutShareCopy {
  alertTitle: string;
  alertMessage: string;
  /** WORKOUT_CARD 메시지의 content — 채팅방에 그대로 노출된다 */
  cardContent: string;
}

const prLine = (prs: WorkoutPrHighlight[]): string =>
  prs.length === 1
    ? `${prs[0].exerciseName} ${prs[0].previousBestKg}kg → ${prs[0].weightKg}kg`
    : `${prs.map((p) => p.exerciseName).join(', ')} 등 ${prs.length}개 종목`;

/** 저장한 운동을 채팅에 공유할 때 쓸 문구를 조립한다. PR 종목이 있으면 확인창·카드 문구가 달라진다. */
export function buildWorkoutShareCopy(summary: string, prs: WorkoutPrHighlight[] | undefined): WorkoutShareCopy {
  if (!prs || prs.length === 0) {
    return {
      alertTitle: '운동 완료! ',
      alertMessage: '이 운동을 채팅에 공유할까요?',
      cardContent: summary,
    };
  }

  const line = prLine(prs);
  return {
    alertTitle: '🔥 PR 갱신!',
    alertMessage: `${line}\n이 기록을 채팅에 자랑할까요?`,
    cardContent: `${PR_SHARE_PREFIX} ${line} · ${summary}`,
  };
}

/** 채팅 카드 본문이 PR 공유 카드인지 — 뱃지 문구를 바꿀 때 쓴다. */
export function isPrShareContent(content?: string | null): boolean {
  return !!content && content.startsWith(PR_SHARE_PREFIX);
}
