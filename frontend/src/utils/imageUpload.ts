/** 이미지 선택(expo-image-picker) + Cloudinary 업로드 (signed 우선, unsigned 폴백) */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CLOUDINARY, isCloudinaryConfigured } from '../constants/config';
import { uploadApi } from '../api/upload';

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
 * 백엔드 서명(signed)을 우선 사용하고, 서명 미설정(503 등) 시
 * 기존 unsigned preset 으로 폴백한다.
 */
export async function uploadImage(uri: string): Promise<string> {
  const sig = await uploadApi.signature().catch(() => null);

  if (sig) {
    const form = await buildFileForm(uri);
    form.append('api_key', sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('folder', sig.folder);
    form.append('signature', sig.signature);
    return postToCloudinary(sig.cloudName, form);
  }

  // 폴백: unsigned preset (서명 백엔드 미설정 시)
  if (!isCloudinaryConfigured()) {
    throw new Error('이미지 업로드가 아직 설정되지 않았어요. (Cloudinary)');
  }
  const form = await buildFileForm(uri);
  form.append('upload_preset', CLOUDINARY.uploadPreset);
  return postToCloudinary(CLOUDINARY.cloudName, form);
}
