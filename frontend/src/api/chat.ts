/** 채팅 REST API — 설계서 v2.0 4.5 (실시간 송수신은 chatSocket.ts) */
import { apiClient, unwrap } from './client';
import type { ApiResponse, ChatMessage, ChatReactionSummary, ChatRoom } from '../types';

export const chatApi = {
  rooms: () => unwrap(apiClient.get<ApiResponse<ChatRoom[]>>('/chat/rooms')),
  messages: (relationId: number, cursor?: number) =>
    unwrap(
      apiClient.get<ApiResponse<ChatMessage[]>>(`/chat/rooms/${relationId}/messages`, {
        params: { cursor },
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
};
