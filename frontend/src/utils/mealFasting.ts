/**
 * 식사 저장 ↔ 간헐적 단식 연동의 앱 쪽 마무리(2026-10-16, docs/LOVEBODY_FASTING_WATER_ANALYSIS_2026-10-16.md).
 *
 * 판정은 서버가 한다(MealService.save → FastingService.onMealSaved) — 저장 경로가 넷(기록 화면·홈 사진·보관함
 * 재시도·외식 기록)이라 앱에서 나눠 판정하면 어긋난다. 여기는 그 결과(Meal.fasting)를 사용자에게 보여 주기만 한다.
 *
 * - ENDED: 저장 토스트에 "단식 n시간 성공"을 붙이고 [되돌리기] — 몰아 적기 등으로 잘못 끝났을 때 10분 안에 되살린다.
 * - ASK_END: 끝내지 않고 묻는다(시작 4시간 전이거나 오늘 오후 시작한 단식에 오늘 끼니를 적었다).
 * - OFFER_START: 저녁 뒤 "단식 시작할까요?" — 다 먹고 한참 뒤 기록하는 사람이 많아 시작 시각을 앞당겨 고를 수 있다.
 *
 * 다이얼로그·토스트 모두 루트에 그려지므로(ConfirmDialog·Toast) 기록 화면이 닫힌 뒤에도 뜬다.
 */
import { create } from 'zustand';
import { fastingApi } from '../api/fasting';
import { toast } from '../store/toastStore';
import { Alert } from './alert';
import { getErrorMessage } from './error';
import { haptics } from './haptics';
import type { FastingPlan, MealFastingOutcome } from '../types';

/**
 * 단식 상태가 화면 밖에서 바뀌었다는 신호 — 식단 화면이 구독해 단식 줄을 다시 받는다.
 * (되돌리기·시작은 기록 화면이 닫힌 뒤 일어나 식단 화면의 포커스 갱신을 놓친다)
 */
export const useFastingSignal = create<{ version: number; bump: () => void }>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));

const bump = () => useFastingSignal.getState().bump();

export const FASTING_PLAN_LABEL: Record<FastingPlan, string> = {
  SIXTEEN_EIGHT: '16:8',
  EIGHTEEN_SIX: '18:6',
  TWENTY_FOUR: '20:4',
  OMAD: 'OMAD',
  CUSTOM: '직접 설정',
};

/** 분 → "15시간 40분" / "16시간" / "40분" */
export function formatFastingDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}분`;
  return r === 0 ? `${h}시간` : `${h}시간 ${r}분`;
}

/** 끝나는 시각 안내 — "내일 오전 10:40" (기기 시각 기준) */
export function formatFastingEnd(from: Date, hours: number): string {
  const end = new Date(from.getTime() + hours * 3600_000);
  const dayDiff = Math.round(
    (new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
      new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) /
      86_400_000,
  );
  const day = dayDiff === 0 ? '오늘' : dayDiff === 1 ? '내일' : `${end.getMonth() + 1}월 ${end.getDate()}일`;
  const h = end.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${day} ${ampm} ${h12}:${String(end.getMinutes()).padStart(2, '0')}`;
}

async function reopenFast() {
  try {
    await fastingApi.reopen();
    haptics.light();
    toast.success('단식을 이어갈게요');
  } catch (e) {
    toast.error(getErrorMessage(e, '단식을 되돌리지 못했어요.'));
  } finally {
    bump();
  }
}

async function endFast() {
  try {
    const res = await fastingApi.end();
    haptics.success();
    toast.success(
      res.achieved
        ? `🎉 ${res.targetHours}시간 단식 성공!`
        : `단식을 ${formatFastingDuration(res.elapsedMin ?? 0)}으로 끝냈어요`, // "시간"·"분" 모두 받침 → 으로
    );
  } catch (e) {
    toast.error(getErrorMessage(e, '단식 종료에 실패했어요.'));
  } finally {
    bump();
  }
}

async function startFast(plan: FastingPlan, hours: number, minutesAgo: number) {
  try {
    await fastingApi.start(plan, hours, minutesAgo);
    haptics.success();
    toast.success(`${plan === 'CUSTOM' ? `${hours}시간` : FASTING_PLAN_LABEL[plan]} 단식을 시작했어요 ⏱️`);
  } catch (e) {
    toast.error(getErrorMessage(e, '단식 시작에 실패했어요.'));
  } finally {
    bump();
  }
}

/**
 * 식사 저장 직후 부른다. saveMessage 는 그 화면이 띄우려던 저장 토스트.
 *
 * @returns true 면 저장 토스트까지 여기서 띄웠다(호출자는 자기 토스트를 띄우지 않는다)
 */
export function announceMealFasting(outcome: MealFastingOutcome | null | undefined, saveMessage: string): boolean {
  if (!outcome) return false;

  if (outcome.result === 'ENDED' && outcome.status) {
    const s = outcome.status;
    const line = s.achieved
      ? `🎉 ${s.targetHours}시간 단식 성공(${formatFastingDuration(s.elapsedMin ?? 0)})`
      : `단식은 ${formatFastingDuration(s.elapsedMin ?? 0)}으로 끝냈어요`;
    // 토스트 슬롯이 하나라 저장 문구와 합친다 — 따로 띄우면 앞의 것이 곧바로 덮인다
    toast.success(`${line} · ${saveMessage}`.trim(), { label: '되돌리기', onPress: reopenFast });
    bump();
    return true;
  }

  if (outcome.result === 'ASK_END' && outcome.status) {
    const elapsed = outcome.status.elapsedMin ?? 0;
    Alert.alert(
      '단식 중이에요',
      `${elapsed < 1 ? '방금 시작한 단식이에요' : `시작한 지 ${formatFastingDuration(elapsed)} 지났어요`}. 이 식사로 단식을 끝낼까요?`,
      [
        { text: '끝내기', onPress: endFast },
        { text: '계속할게요', style: 'cancel' },
      ],
    );
    return false;
  }

  if (outcome.result === 'OFFER_START' && outcome.suggestPlan && outcome.suggestHours) {
    const plan = outcome.suggestPlan;
    const hours = outcome.suggestHours;
    const label = plan === 'CUSTOM' ? `${hours}시간` : FASTING_PLAN_LABEL[plan];
    Alert.alert(
      '간헐적 단식 시작할까요?',
      `${label} · 지금 시작하면 ${formatFastingEnd(new Date(), hours)}에 끝나요.\n다 먹은 지 좀 됐다면 그때부터 셀게요.`,
      [
        { text: '지금부터 시작', onPress: () => startFast(plan, hours, 0) },
        { text: '30분 전부터', onPress: () => startFast(plan, hours, 30) },
        { text: '1시간 전부터', onPress: () => startFast(plan, hours, 60) },
        { text: '오늘은 안 할래요', style: 'cancel' },
      ],
    );
    return false;
  }

  return false;
}
