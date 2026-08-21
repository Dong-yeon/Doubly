/**
 * 통화 결과 카드(CALL_CARD) content 파서 — 백엔드 CallService.recordOutcome 와 형식이
 * 같은 문자열이어야 한다(단일 출처: "{VOICE|VIDEO}|{MISSED|DECLINED|ENDED}[|durationSec]").
 * PLAN.md "통화·영상통화" 참고.
 */
import type { CallType } from '../api/call';

export interface CallCardInfo {
  callType: CallType;
  outcome: 'MISSED' | 'DECLINED' | 'ENDED';
  durationSec: number | null;
}

export function parseCallCard(content: string | null | undefined): CallCardInfo | null {
  if (!content) return null;
  const [type, outcome, duration] = content.split('|');
  if (type !== 'VOICE' && type !== 'VIDEO') return null;
  if (outcome !== 'MISSED' && outcome !== 'DECLINED' && outcome !== 'ENDED') return null;
  return { callType: type, outcome, durationSec: duration ? Number(duration) : null };
}

/** 통화 시간을 "3분 12초" / "45초" 로 — 워치·통화 앱과 같은 표기. */
export function formatCallDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/** 카드 미리보기/본문 라벨 — MISSED 와 DECLINED 는 같은 문구다(거절인지 못 받은 건지 구분하지 않는다). */
export function callCardLabel(info: CallCardInfo): string {
  const video = info.callType === 'VIDEO';
  if (info.outcome === 'ENDED') {
    const duration = info.durationSec != null ? ` · ${formatCallDuration(info.durationSec)}` : '';
    return `${video ? '영상통화' : '음성통화'} 종료${duration}`;
  }
  return video ? '부재중 영상통화' : '부재중 전화';
}
