/**
 * 우리 이모지 API — 사진 한 장으로 감정 17종 캐릭터 세트를 만든다.
 * 설계·실측은 docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md (프론트는 §7).
 *
 * <p><b>원본 업로드가 공용 경로와 다르다.</b> 서버는 전용 폴더(`fitto/emoji-source`)에 올라간
 * URL 만 받는다 — 생성이 끝나면 원본을 <b>지우기</b> 때문에(§9-1), 아무 URL 이나 받으면
 * 남의 사진을 지우는 경로가 된다. 그래서 서명도 전용 엔드포인트에서 받아야 한다.
 *
 * <p><b>{@link generate} 는 결과를 기다리지 않는다.</b> 다른 AI 기능은 `runAiJob` 으로 감싸
 * 평범한 Promise 처럼 쓰지만, 이건 몇 분짜리라 대기 화면이 "감정 칸이 하나씩 채워지는"
 * 형태여야 한다(§7). 그러려면 화면이 폴링 주기를 직접 쥐고 사이사이 {@link list} 를 다시
 * 불러야 해서, 여기서는 접수증(jobId)만 돌려준다.
 */
import { apiClient, unwrap } from './client';
import { uploadImageWithSignature } from '../utils/imageUpload';
import type { AiJobStart } from './aiJob';
import type { UploadSignature } from './upload';
import type { ApiResponse, CoupleEmoji, CoupleEmojiEmotion } from '../types';

export const coupleEmojiApi = {
  /** 원본 사진 업로드 서명 — 전용 폴더. 사진 한도(PHOTO_UPLOAD)를 한 번 쓴다 */
  uploadSignature: () =>
    unwrap(apiClient.post<ApiResponse<UploadSignature>>('/couple-emojis/upload-signature')),

  /** 생성 접수 — 202 + jobId. 결과는 화면이 폴링한다(파일 주석) */
  /** emotions 를 비우면 전체 — 일부만 보내면 그 감정만 그린다(부분 재생성) */
  generate: (payload: {
    sourceImageUrl: string;
    subjectUserId?: number;
    emotions?: CoupleEmojiEmotion[];
  }) =>
    unwrap(apiClient.post<ApiResponse<AiJobStart>>('/couple-emojis/generate', payload)),

  /** 트레이 목록 — 관계의 살아 있는 이모지 전부(최근 세트가 위). 둘 다 같은 목록을 본다 */
  list: () => unwrap(apiClient.get<ApiResponse<CoupleEmoji[]>>('/couple-emojis')),

  /** 한 장 숨기기 — 만든 사람이 아니어도 커플이면 누구나(§9-2) */
  remove: (emojiId: number) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/couple-emojis/${emojiId}`)),

  /** 세트 통째로 숨기기 */
  removeBatch: (batchId: string) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/couple-emojis/batches/${batchId}`)),
};

/**
 * 크롭된 로컬 사진 → 전용 폴더 업로드 → 생성 접수. 돌려주는 건 jobId 다.
 *
 * <p>업로드와 접수를 한 함수로 묶은 이유: 둘 사이에 끼어들 화면 상태가 없고, 전용 폴더
 * 서명을 쓰는 것을 잊으면 서버가 `INVALID_PHOTO_URL` 로 거절한다 — 순서를 여기서 못 박는다.
 */
export async function startCoupleEmojiGeneration(
  croppedUri: string,
  subjectUserId?: number,
  emotions?: CoupleEmojiEmotion[],
): Promise<string> {
  const signature = await coupleEmojiApi.uploadSignature();
  const sourceImageUrl = await uploadImageWithSignature(croppedUri, signature);
  const { jobId } = await coupleEmojiApi.generate({ sourceImageUrl, subjectUserId, emotions });
  return jobId;
}
