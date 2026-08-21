/** 이미지 선택(expo-image-picker) + Cloudinary 업로드 (signed 우선, unsigned 폴백) */
import { Image, Platform } from 'react-native';
import { File as FsFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { CLOUDINARY, isCloudinaryConfigured } from '../constants/config';
import { uploadApi } from '../api/upload';
import { errorCodeOf } from '../api/client';
import { toast } from '../store/toastStore';

/** 고른 사진 한 장 — 원본 픽셀 크기까지. 크롭처럼 좌표를 계산하는 쪽이 크기를 알아야 한다 */
export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

const PICKER_OPTIONS = {
  mediaTypes: ['images'],
  quality: 0.7,
  // 시스템 크롭 UI 는 iOS 정사각 · 안드로이드 기기별 화면 · 웹 미지원으로 제각각이라
  // 쓰지 않는다. 프로필 사진처럼 잘라내야 하는 자리는 AvatarCropSheet 로 직접 받는다.
  allowsEditing: false,
} satisfies ImagePicker.ImagePickerOptions;

/**
 * 권한 확인 — 거부됐으면 알려주고 false.
 *
 * <p>예전에는 거부와 취소를 똑같이 조용한 {@code null} 로 돌려줘서, 권한을 막아둔
 * 사용자는 버튼을 눌러도 <b>아무 일도 일어나지 않는</b> 것처럼 보였다
 * ({@code docs/UX_UI_AUDIT.md} "아바타: 권한 거부 시 무피드백 종료").
 * 여기 한 곳에서 알리면 이 함수를 쓰는 화면 전부가 같이 고쳐진다.
 */
async function ensurePermission(kind: 'mediaLibrary' | 'camera'): Promise<boolean> {
  const perm =
    kind === 'mediaLibrary'
      ? await ImagePicker.requestMediaLibraryPermissionsAsync()
      : await ImagePicker.requestCameraPermissionsAsync();
  if (perm.granted) return true;
  toast.error(
    kind === 'mediaLibrary'
      ? '사진 접근 권한이 필요해요. 설정에서 허용해 주세요.'
      : '카메라 접근 권한이 필요해요. 설정에서 허용해 주세요.',
  );
  return false;
}

/** RN 이 실제로 그릴 때 쓰는 크기 — 피커가 크기를 안 줬을 때의 최후 수단 */
function measure(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

async function toPicked(asset: ImagePicker.ImagePickerAsset): Promise<PickedImage> {
  if (asset.width > 0 && asset.height > 0) {
    return { uri: asset.uri, width: asset.width, height: asset.height };
  }
  const size = await measure(asset.uri);
  return { uri: asset.uri, ...size };
}

/** 갤러리에서 이미지 선택 → 원본 크기 포함 (취소/권한 거부 시 null) */
export async function pickImageAsset(): Promise<PickedImage | null> {
  if (!(await ensurePermission('mediaLibrary'))) return null;

  const result = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled || result.assets.length === 0) return null;
  return toPicked(result.assets[0]);
}

/** 카메라 촬영 → 원본 크기 포함 (취소/권한 거부 시 null) */
export async function takePhotoAsset(): Promise<PickedImage | null> {
  if (!(await ensurePermission('camera'))) return null;

  const result = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
  if (result.canceled || result.assets.length === 0) return null;
  return toPicked(result.assets[0]);
}

/** 갤러리에서 이미지 선택 → uri (취소/권한 거부 시 null) */
export async function pickImage(): Promise<string | null> {
  return (await pickImageAsset())?.uri ?? null;
}

/** 카메라 촬영 → uri (취소/권한 거부 시 null) */
export async function takePhoto(): Promise<string | null> {
  return (await takePhotoAsset())?.uri ?? null;
}

async function buildFileForm(uri: string): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('file', blob);
  } else {
    // Expo(SDK 54+) 전역 fetch 는 RN 전통 {uri,type,name} 파트를 지원하지 않는다
    // ("Unsupported FormDataPart implementation"). bytes() 를 구현한
    // expo-file-system File 이 공식 지원 경로다.
    form.append('file', new FsFile(uri) as Blob);
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
