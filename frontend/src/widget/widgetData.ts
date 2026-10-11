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
import type { MoodEntry } from '../types';

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
  /**
   * 상대의 지금 무드(유니코드 + 한마디). 우리 이모지 그림은 위젯이 원격 이미지를 그리지 않아 글자로 둔다 —
   * {@code text} 가 있으면 그것(배고파), 없으면 유니코드 대역({@code emoji}, 서버가 늘 채워 준다). {@link widgetMoodOf}.
   * 상대가 아직 고른 적 없으면 null.
   * <b>undefined 는 "이번엔 모른다"</b> — 조회가 실패했을 때 캐시의 값을 지우지 않으려고 구분한다
   * ({@link updateHomeWidget} 가 이전 값으로 메운다).
   */
  partnerMood?: { emoji: string; text?: string | null; message?: string | null } | null;
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

/**
 * 무드 응답 한 사람분 → 위젯에 남길 무드. 홈 화면(앱)과 위젯 태스크(주기 갱신) 두 곳이 같은 모양으로 만든다 —
 * 한쪽만 {@code text} 를 빠뜨리면 앱을 열 때와 30분 갱신 때 위젯 문구가 번갈아 바뀐다.
 */
export function widgetMoodOf(entry: MoodEntry): NonNullable<WidgetData['partnerMood']> {
  return { emoji: entry.emoji, text: entry.moodText ?? null, message: entry.message ?? null };
}

/** 홈 화면과 동일한 규칙 — 시작일을 1일차로 센다 (UTC 파싱으로 인한 하루 오차는 daysSince 참고). */
export function daysTogether(baseDate: string | null): number {
  return daysSince(baseDate);
}
