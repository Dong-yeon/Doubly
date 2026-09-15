/** 커플 일상 피드 API — PLAN.md Couple Feed */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  FeedItem,
  FeedItemType,
  FeedPhotoSource,
  FeedPhotosPage,
  FeedTimeline,
  Memories,
  ReactionSummary,
} from '../types';

export interface CreatePostPayload {
  content?: string;
  /** 최대 5장 — 서버가 photosOrEmpty()로 검사한다(FeedService.MAX_PHOTOS_PER_POST). */
  imageUrls?: string[];
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

  /**
   * 사진첩("우리" 탭) — 일상·식단·운동·맛집 중 사진 있는 기록. cursor 규칙은 timeline 과 동일.
   *
   * <p>`sources` 를 주면 그 소스만 받는다(상단 필터 칩). 생략하면 4소스 전부 —
   * 서버 기본값과 같으므로 "전체" 칩은 파라미터를 아예 보내지 않는다.
   */
  photos: (cursor?: string | null, limit = 30, sources?: FeedPhotoSource[]) =>
    unwrap(
      apiClient.get<ApiResponse<FeedPhotosPage>>('/feed/photos', {
        params: {
          cursor: cursor ?? undefined,
          limit,
          sources: sources && sources.length > 0 ? sources.join(',') : undefined,
        },
      }),
    ),

  /**
   * 추억 리마인드 — 오늘과 같은 월·일의 1년 이상 전 기록.
   * on 을 생략하면 서버가 오늘(KST)로 잡는다. 추억이 없어도 200 + 빈 groups 다.
   */
  memories: (on?: string) =>
    unwrap(
      apiClient.get<ApiResponse<Memories>>('/feed/memories', {
        params: { on: on ?? undefined },
      }),
    ),

  createPost: (payload: CreatePostPayload) =>
    unwrap(apiClient.post<ApiResponse<FeedItem>>('/feed/posts', payload)),

  removePost: (postId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/feed/posts/${postId}`)),

  /**
   * 이모지 반응 토글 — 갱신된 반응 요약을 돌려준다.
   *
   * 일상 포스트뿐 아니라 운동·식단·맛집 방문 카드에도 달 수 있다. 같은 이모지를
   * 다시 보내면 해제된다.
   */
  react: (type: FeedItemType, refId: number, emoji: string) =>
    unwrap(
      apiClient.post<ApiResponse<ReactionSummary[]>>(
        `/feed/items/${type}/${refId}/reactions`,
        { emoji },
      ),
    ),
};
