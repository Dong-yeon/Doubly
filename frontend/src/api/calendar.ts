/** 커플 캘린더 API — 일정 CRUD + 월/다가오는 조회 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, CalendarEventType, CoupleCalendarEvent } from '../types';

export interface SaveEventPayload {
  title: string;
  /** YYYY-MM-DD */
  eventDate: string;
  /**
   * 기간 일정의 종료일 — 생략하면 하루 일정. 수정 시에도 생략하면 하루 일정으로
   * 환원된다(백엔드 UpdateEventRequest 참고 — 기간은 시작일과 한 몸이라 요청이
   * 기간 전체를 서술한다). 반복 일정과 함께 쓸 수 없다.
   */
  endDate?: string;
  eventType?: CalendarEventType;
  repeatYearly: boolean;
  memo?: string;
}

export const calendarApi = {
  /** 월 단위 조회 — 반복 일정은 그 달의 발생일로 계산되어 내려온다 */
  month: (year: number, month: number) =>
    unwrap(
      apiClient.get<ApiResponse<CoupleCalendarEvent[]>>(
        `/calendar/events?year=${year}&month=${month}`,
      ),
    ),
  /** 다가오는 일정 — D-day 오름차순 */
  upcoming: (limit = 5) =>
    unwrap(
      apiClient.get<ApiResponse<CoupleCalendarEvent[]>>(`/calendar/events/upcoming?limit=${limit}`),
    ),
  create: (payload: SaveEventPayload) =>
    unwrap(apiClient.post<ApiResponse<CoupleCalendarEvent>>('/calendar/events', payload)),
  update: (id: number, payload: Partial<SaveEventPayload>) =>
    unwrap(apiClient.put<ApiResponse<CoupleCalendarEvent>>(`/calendar/events/${id}`, payload)),
  remove: (id: number) => unwrap(apiClient.delete<ApiResponse<void>>(`/calendar/events/${id}`)),
};
