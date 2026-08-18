/** 커플 음성 응원 API — 애인 목소리로 녹음한 짧은 응원 문구 저장/조회 */
import { apiClient, unwrap } from './client';
import type { UploadSignature } from './upload';
import type { ApiResponse, PartnerVoiceClips, VoiceClip, VoicePhrase } from '../types';

export const voiceClipsApi = {
  // 녹음 업로드용 서명 — 사진과 같은 Cloudinary 계정, 별도 엔드포인트(업로드 한도 없음)
  uploadSignature: () =>
    unwrap(apiClient.post<ApiResponse<UploadSignature>>('/voice-clips/upload-signature')),
  mine: () => unwrap(apiClient.get<ApiResponse<VoiceClip[]>>('/voice-clips')),
  partner: () => unwrap(apiClient.get<ApiResponse<PartnerVoiceClips>>('/voice-clips/partner')),
  save: (phrase: VoicePhrase, audioUrl: string) =>
    unwrap(apiClient.post<ApiResponse<VoiceClip>>('/voice-clips', { phrase, audioUrl })),
  remove: (phrase: VoicePhrase) =>
    unwrap(apiClient.delete<ApiResponse<void>>(`/voice-clips/${phrase}`)),
};
