/** 이미지 선택(expo-image-picker) + Cloudinary 업로드 (signed 우선, unsigned 폴백) */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CLOUDINARY, isCloudinaryConfigured } from '../constants/config';
import { uploadApi } from '../api/upload';
import { errorCodeOf } from '../api/client';

/** 갤러리에서 이미지 선택 → uri (취소 시 null) */
export async function pickImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

/** 카메라 촬영 → uri (취소/권한 거부 시 null) */
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

async function buildFileForm(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob);
  } else {
    // React Native FormData 파일 형식
    form.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' } as unknown as Blob);
  }
  return form;
}

async function postToCloudinary(cloudName: string, form: FormData): Promise<string> {
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('이미지 업로드에 실패했어요.');
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) throw new Error('이미지 업로드 응답이 올바르지 않아요.');
  return data.secure_url;
}

/**
 * Cloudinary 업로드 → secure_url.
 *
 * <p>백엔드 서명(signed)을 우선 사용하고, <b>서명 기능이 꺼져 있을 때만</b>
 * unsigned preset 으로 폴백한다.
 *
 * <p><b>⚠️ 아무 실패에나 폴백하면 안 된다.</b> 예전에는 {@code .catch(() => null)} 로
 * 모든 실패를 삼키고 unsigned 로 넘어갔는데, 그러면 사진 한도(402)를 받아도 조용히
 * 우회해서 <b>게이팅이 아무 일도 하지 않는다</b>. 네트워크 오류도 마찬가지로 삼키면
 * 운영에서 존재하지도 않는 unsigned preset 으로 가서 원인 모를 실패가 된다.
 * 폴백해도 되는 건 서버가 명시적으로 "설정 안 됨"이라고 답한 경우 하나뿐이다.
 */
export async function uploadImage(uri: string): Promise<string> {
  let sig: Awaited<ReturnType<typeof uploadApi.signature>> | null = null;
  try {
    sig = await uploadApi.signature();
  } catch (e) {
    // 한도 초과(402)는 여기서 그대로 던진다 — api/client 가 이미 업그레이드 안내를 띄웠다.
    if (errorCodeOf(e) !== 'UPLOAD_NOT_CONFIGURED') throw e;
  }

  if (sig) {
    const form = await buildFileForm(uri);
    form.append('api_key', sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('folder', sig.folder);
    form.append('signature', sig.signature);
    return postToCloudinary(sig.cloudName, form);
  }

  // 폴백: unsigned preset (서명 백엔드 미설정 시 — 개발 환경 전용 경로)
  if (!isCloudinaryConfigured()) {
    throw new Error('이미지 업로드가 아직 설정되지 않았어요. (Cloudinary)');
  }
  const form = await buildFileForm(uri);
  form.append('upload_preset', CLOUDINARY.uploadPreset);
  return postToCloudinary(CLOUDINARY.cloudName, form);
}
