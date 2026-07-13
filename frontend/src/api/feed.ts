/** 커플 일상 피드 API — PLAN.md Couple Feed */
import { apiClient, unwrap } from './client';
import type { ApiResponse, FeedItem, FeedTimeline, ReactionSummary } from '../types';

export interface CreatePostPayload {
  content?: string;
  imageUrl?: string;
}

export const feedApi = {
  /** 통합 타임라인 — cursor 는 이전 페이지의 nextCursor */
  timeline: (cursor?: string | null, limit = 20) =>
    unwrap(
      apiClient.get<ApiResponse<FeedTimeline>>('/feed', {
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
