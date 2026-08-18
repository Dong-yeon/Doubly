/** 음성 응원 녹음 업로드 — Cloudinary 로 직접 올린다 (사진과 같은 계정, 별도 서명 엔드포인트) */
import { Platform } from 'react-native';
import { voiceClipsApi } from '../api/voiceClips';

async function buildFileForm(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob);
  } else {
    // React Native FormData 파일 형식 — RecordingPresets.LOW_QUALITY 확장자(.m4a)와 맞춘다
    form.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' } as unknown as Blob);
  }
  return form;
}

/**
 * 녹음 파일(uri) → Cloudinary 업로드 → secure_url.
 *
 * <p>사진(imageUpload.ts)과 달리 unsigned 폴백이 없다 — 사진 업로드가 이미 되는 환경이면
 * 같은 Cloudinary 계정이 이미 설정돼 있으므로 여기서 다시 개발용 폴백을 만들 이유가 없다.
 *
 * <p>Cloudinary 는 오디오를 "video" 리소스 타입으로 받는다(이미지와 다른 업로드 엔드포인트).
 * 서명은 folder+timestamp 만 서명하고 리소스 타입은 URL 경로일 뿐이라, 사진과 같은 서명
 * 발급 로직(VoiceClipController.uploadSignature)을 그대로 쓸 수 있다.
 */
export async function uploadVoiceClip(uri: string): Promise<string> {
  const sig = await voiceClipsApi.uploadSignature();
  const form = await buildFileForm(uri);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('folder', sig.folder);
  form.append('signature', sig.signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('녹음 업로드에 실패했어요.');
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) throw new Error('녹음 업로드 응답이 올바르지 않아요.');
  return data.secure_url;
}
