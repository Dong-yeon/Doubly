/**
 * 홈 위젯 데이터 — 앱이 캐시를 쓰고, 위젯(headless task)이 읽는다.
 *
 * 위젯은 앱 프로세스 밖 주기 갱신(30분)에서 네트워크·인증 없이 그려져야 하므로,
 * 홈 화면이 데이터를 성공적으로 불러올 때마다 여기에 스냅샷을 남긴다.
 * D-day 는 저장 시점 값이 아니라 렌더 시점에 기념일로부터 다시 계산한다 —
 * 앱을 며칠 안 열어도 위젯의 D+N 은 매일 갱신된다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { daysSince } from '../utils/date';

const KEY = 'doubly.widgetData';

export interface WidgetData {
  connected: boolean;
  /** D-day 기준일 (기념일 ?? 연결일, ISO) — 없으면 D-day 미표시 */
  anniversaryDate: string | null;
  partnerName: string | null;
  /** 내 개인 운동 스트릭 (현재 연속일) */
  myStreak: number;
  /** 상대 개인 운동 스트릭 (현재 연속일) */
  partnerStreak: number;
  /** 캐시 시각 (ISO) — 디버깅용 */
  updatedAt: string;
}

export async function saveWidgetData(data: WidgetData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 캐시 실패는 위젯이 이전 값을 보여줄 뿐 — 앱 흐름에 영향 없음
  }
}

export async function loadWidgetData(): Promise<WidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WidgetData) : null;
  } catch {
    return null;
  }
}

/** 홈 화면과 동일한 규칙 — 시작일을 1일차로 센다 (UTC 파싱으로 인한 하루 오차는 daysSince 참고). */
export function daysTogether(baseDate: string | null): number {
  return daysSince(baseDate);
}
