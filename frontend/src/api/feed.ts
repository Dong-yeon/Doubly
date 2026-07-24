/** 커플 일상 피드 API — PLAN.md Couple Feed */
import { apiClient, unwrap } from './client';
import type { ApiResponse, FeedItem, FeedPhotosPage, FeedTimeline, ReactionSummary } from '../types';

export interface CreatePostPayload {
  content?: string;
  imageUrl?: string;
}

export const feedApi = {
  /**
   * 통합 타임라인 — cursor 는 이전 페이지의 nextCursor 를 그대로 넘긴다.
   * 서버가 만든 불투명 토큰이므로 해석하거나 가공하지 말 것(내부 형식은 바뀔 수 있다).
   */
  timeline: (cursor?: string | null, limit = 20) =>
    unwrap(
      apiClient.get<ApiResponse<FeedTimeline>>('/feed', {
        params: { cursor: cursor ?? undefined, limit },
      }),
    ),

  /** 전체 사진첩 — 사진 있는 커플 포스트만. cursor 규칙은 timeline 과 동일 */
  photos: (cursor?: string | null, limit = 30) =>
    unwrap(
      apiClient.get<ApiResponse<FeedPhotosPage>>('/feed/photos', {
        params: { cursor: cursor ?? undefined, limit },
      }),
    ),

  createPost: (payload: CreatePostPayload) =>
    unwrap(apiClient.post<ApiResponse<FeedItem>>('/feed/posts', payload)),

  removePost: (postId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/feed/posts/${postId}`)),

  /** 이모지 반응 토글 — 갱신된 반응 요약을 돌려준다 */
  react: (postId: number, emoji: string) =>
    unwrap(apiClient.post<ApiResponse<ReactionSummary[]>>(`/feed/posts/${postId}/reactions`, { emoji })),
};
