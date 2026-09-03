/** 채팅 REST API — 설계서 v2.0 4.5 (실시간 송수신은 chatSocket.ts) */
import { apiClient, unwrap } from './client';
import type { UploadSignature } from './upload';
import type { ApiResponse, ChatBookmark, ChatMessage, ChatReactionSummary, ChatRoom, LatestTouch } from '../types';

export const chatApi = {
  rooms: () => unwrap(apiClient.get<ApiResponse<ChatRoom[]>>('/chat/rooms')),
  /** 내가 받은 가장 최근 가상 터치 — 홈 화면이 CoupleEvent.TOUCH 수신 시 호출한다. 없으면 null */
  latestTouch: (relationId: number) =>
    unwrap(apiClient.get<ApiResponse<LatestTouch | null>>(`/chat/${relationId}/touch/latest`)),
  messages: (relationId: number, cursor?: number) =>
    unwrap(
      apiClient.get<ApiResponse<ChatMessage[]>>(`/chat/rooms/${relationId}/messages`, {
        params: { cursor },
      }),
    ),
  /** 대화 검색 — 텍스트 메시지 본문, 전체 기간, 최신순 커서 페이징 */
  search: (relationId: number, q: string, cursor?: number) =>
    unwrap(
      apiClient.get<ApiResponse<ChatMessage[]>>(`/chat/rooms/${relationId}/search`, {
        params: { q, cursor },
      }),
    ),
  markRead: (messageId: number) =>
    unwrap(apiClient.put<ApiResponse<void>>(`/chat/read/${messageId}`)),

  /** 리액션 토글 — 같은 이모지를 다시 보내면 해제된다 */
  react: (messageId: number, emoji: string) =>
    unwrap(
      apiClient.post<ApiResponse<ChatReactionSummary[]>>(
        `/chat/messages/${messageId}/reactions`,
        { emoji },
      ),
    ),
  /** 메시지 수정 — 작성자 본인의 텍스트 메시지만 */
  edit: (messageId: number, content: string) =>
    unwrap(apiClient.put<ApiResponse<ChatMessage>>(`/chat/messages/${messageId}`, { content })),
  /** 메시지 삭제 — 내용만 지우고 자리는 남는다 */
  remove: (messageId: number) =>
    unwrap(apiClient.delete<ApiResponse<ChatMessage>>(`/chat/messages/${messageId}`)),

  /** 사진 모아보기 — IMAGE 메시지, 전체 기간, 최신순 커서 페이징. 전면 무료 */
  photos: (relationId: number, cursor?: number) =>
    unwrap(
      apiClient.get<ApiResponse<ChatMessage[]>>(`/chat/rooms/${relationId}/photos`, {
        params: { cursor },
      }),
    ),
  /** 중요 대화 저장/저장 취소 — 토글, 커플 공용(한쪽이 취소해도 둘 다에서 사라진다) */
  toggleBookmark: (messageId: number) =>
    unwrap(apiClient.post<ApiResponse<boolean>>(`/chat/messages/${messageId}/bookmark`)),
  /**
   * 저장한 대화 목록 — 저장한 순서 최신순 커서 페이징.
   * 커서는 메시지 id 가 아니라 bookmarkId 다(목록 순서=저장 순서, 메시지 id=보낸 순서
   * 라 서로 다른 값 — 백엔드 ChatBookmarkResponse 주석 참고).
   */
  bookmarks: (relationId: number, cursor?: number) =>
    unwrap(
      apiClient.get<ApiResponse<ChatBookmark[]>>(`/chat/rooms/${relationId}/bookmarks`, {
        params: { cursor },
      }),
    ),

  /**
   * 음성 메시지 업로드용 서명 — 사진과 같은 Cloudinary 계정, 별도 엔드포인트.
   * 한도(Feature.VOICE_MESSAGE)는 이 요청 시점에 소비된다(사진과 같은 패턴).
   */
  voiceUploadSignature: () =>
    unwrap(apiClient.post<ApiResponse<UploadSignature>>('/chat/voice-upload-signature')),
};
