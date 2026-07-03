/** 이미지 선택(expo-image-picker) + Cloudinary 업로드 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { CLOUDINARY, isCloudinaryConfigured } from '../constants/config';

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

/** Cloudinary unsigned 업로드 → secure_url */
export async function uploadImage(uri: string): Promise<string> {
  if (!isCloudinaryConfigured()) {
    throw new Error('이미지 업로드가 아직 설정되지 않았어요. (Cloudinary)');
  }

  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob);
  } else {
    // React Native FormData 파일 형식
    form.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' } as unknown as Blob);
  }
  form.append('upload_preset', CLOUDINARY.uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('이미지 업로드에 실패했어요.');
  const data = (await res.json()) as { secure_url?: string };
  if (!data.secure_url) throw new Error('이미지 업로드 응답이 올바르지 않아요.');
  return data.secure_url;
}
