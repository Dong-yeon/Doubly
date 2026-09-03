/**
 * 채팅 음성 메시지 녹음 업로드 — Cloudinary 로 직접 올린다.
 *
 * utils/voiceUpload.ts(운동 음성 응원)와 같은 계정·같은 방식이지만 서명 엔드포인트가
 * 다르다 — 저건 한도가 없고(문구당 1개, 재녹음은 교체), 이건 Feature.VOICE_MESSAGE
 * 일일 한도를 여기서(서명 발급 시점에) 소비한다.
 */
import { Platform } from 'react-native';
import { File as FsFile } from 'expo-file-system';
import { chatApi } from '../api/chat';

async function buildFileForm(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob);
  } else {
    form.append('file', new FsFile(uri) as Blob);
  }
  return form;
}

/** 녹음 파일(uri) → Cloudinary 업로드 → secure_url. Cloudinary 는 오디오를 "video" 리소스로 받는다. */
export async function uploadChatVoice(uri: string): Promise<string> {
  const sig = await chatApi.voiceUploadSignature();
  const form = await buildFileForm(uri);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('folder', sig.folder);
  form.append('signature', sig.signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('음성 메시지 업로드에 실패했어요.');
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) throw new Error('음성 메시지 업로드 응답이 올바르지 않아요.');
  return data.secure_url;
}
