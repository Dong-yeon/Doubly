/**
 * 홈에서 사진으로 남긴 식단의 <b>보관함</b> — 올리기 전에 사진을 앱 문서 폴더에 먼저 적어 두고, 기록까지 끝나야 지운다.
 *
 * <p><b>왜 필요한가</b> (2026-10-12 제보): "홈에서 사진으로 올리기 하고 끄는데, 실패하면 다시 그 사진으로 올릴 방법이
 * 없다. 밥을 다 먹어서 올릴 사진도 없다." 카메라로 찍은 사진(launchCameraAsync)은 <b>갤러리가 아니라 앱 임시 폴더</b>에만
 * 있고, 홈 시트는 업로드·저장이 끝날 때까지 그 경로를 메모리로만 들고 있었다. 찍고 바로 앱을 끄면 업로드가 죽고,
 * 다시 열어도 사진을 가리킬 방법이 없었다. 저장이 거절되면 올린 사진까지 지웠다.
 *
 * <ul>
 *   <li><b>먼저 적고 나중에 올린다</b>(write-ahead) — 사진을 고르자마자 문서 폴더로 복사하고 목록에 적는다.
 *       앱이 그 뒤 어디서 죽어도 사진과 "언제·어느 끼니"가 남는다. 문서 폴더는 시스템이 비우지 않는다
 *       (chatBackgroundPhoto 와 같은 판단 — 캐시 폴더는 용량이 모자라면 예고 없이 비워진다).
 *   <li><b>다시 올려도 한 끼</b> — 처음 적을 때 만든 clientRequestId 를 끝까지 쓴다. 서버가 저장해 놓고 응답만 못 받은
 *       경우(타임아웃·앱 종료)에 다시 보내면 서버가 먼저 저장한 끼니를 돌려준다(MealService.save 멱등 검사).
 *   <li><b>올린 사진 주소도 적어 둔다</b> — 업로드는 됐는데 저장에서 실패하면 다음엔 업로드를 건너뛴다.
 *       식단 사진 업로드는 하루 한도(MEAL_PHOTO)를 쓰므로 다시 올리면 한 장을 또 깎는다.
 *   <li><b>끼니·날짜는 찍은 순간 것</b> — 저녁에 찍은 사진이 다음 날 아침에 올라가도 어제 저녁이다.
 *   <li>서버가 <b>거절</b>(4xx)한 건 자동으로 다시 보내지 않는다 — 같은 요청은 같은 답이다. 사용자가 다시 누르거나 버린다.
 *       연결 실패·서버 오류(0·5xx)만 앱을 열 때 자동으로 다시 보낸다.
 *   <li>계정마다 따로 — 로그아웃하면 전부 지운다(authStore.clearTokens, writingDraft 와 같은 이유).
 * </ul>
 *
 * <p>웹은 {@code .web.ts} — 브라우저에는 이 파일 시스템이 없고, 웹은 원래 기기 파일을 고르므로 원본이 남는다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { dietApi } from '../api/diet';
import { isApiError } from '../api/client';
import { uploadApi } from '../api/upload';
import type { Meal, MealType } from '../types';
import { uploadImage } from './imageUpload';

const KEY = 'doubly.pendingMealPhotos';
const FOLDER = 'pending-meal-photos';

export interface PendingMealPhoto {
  id: string;
  /** 주인 — 다른 계정의 것은 보이지도 올리지도 않는다 */
  userId: number;
  /** 문서 폴더에 복사한 사진. 복사에 실패했으면 원래(임시) 경로 */
  fileUri: string;
  mealDate: string;
  mealType: MealType;
  clientRequestId: string;
  /** 업로드까지 됐으면 그 주소 — 다음 시도는 업로드를 건너뛴다 */
  photoUrl?: string;
  /** 서버가 거절했다(4xx) — 자동으로 다시 보내지 않는다 */
  rejected?: boolean;
  createdAt: number;
}

export const CAN_KEEP_PENDING_MEAL_PHOTOS = true;

async function readAll(): Promise<PendingMealPhoto[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingMealPhoto[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: PendingMealPhoto[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** 목록 갱신은 한 줄로 세운다 — 자동 재시도와 사용자의 "다시 올리기"가 겹쳐도 서로의 쓰기를 덮지 않게 */
let queue: Promise<unknown> = Promise.resolve();
function update<T>(fn: (list: PendingMealPhoto[]) => { list: PendingMealPhoto[]; result: T }): Promise<T> {
  const next = queue.then(async () => {
    const { list, result } = fn(await readAll());
    await writeAll(list);
    return result;
  });
  queue = next.catch(() => {});
  return next;
}

function deleteFile(uri: string): void {
  try {
    const file = new File(uri);
    // 우리 폴더의 것만 지운다 — 복사에 실패해 임시 경로를 그대로 들고 있는 경우는 시스템 몫이다
    if (file.exists && uri.includes(`/${FOLDER}/`)) file.delete();
  } catch {
    // 청소일 뿐이다
  }
}

/** 사진을 보관함에 적는다 — 업로드보다 <b>먼저</b> 부른다 */
export async function stashMealPhoto(
  userId: number,
  sourceUri: string,
  mealDate: string,
  mealType: MealType,
): Promise<PendingMealPhoto> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let fileUri = sourceUri;
  try {
    const dir = new Directory(Paths.document, FOLDER);
    if (!dir.exists) dir.create();
    const destination = new File(dir, `${id}.jpg`);
    await new File(sourceUri).copy(destination);
    fileUri = destination.uri;
  } catch {
    // 복사가 안 되면 임시 경로라도 적는다 — 앱이 살아 있는 동안의 재시도는 그걸로 된다
  }
  const entry: PendingMealPhoto = {
    id,
    userId,
    fileUri,
    mealDate,
    mealType,
    clientRequestId: `meal-sheet-${id}`,
    createdAt: Date.now(),
  };
  await update((list) => ({ list: [...list, entry], result: undefined }));
  return entry;
}

export async function listPendingMealPhotos(userId: number): Promise<PendingMealPhoto[]> {
  return (await readAll()).filter((p) => p.userId === userId);
}

const inFlight = new Map<string, Promise<Meal>>();

/**
 * 자동 재시도가 건드리지 말아야 할 것 — 지금 올리는 중이거나 방금(1분 안) 찍은 사진.
 * 카메라에서 돌아오는 순간 안드로이드는 앱을 다시 "활성"으로 알리고 홈의 자동 재시도가 돈다. 그때 방금 찍은 사진을
 * 시트의 저장 경로와 재시도가 함께 잡으면 같은 끼니를 두 번 알린다(저장은 멱등키로 한 번이지만 토스트가 둘).
 */
export function isPendingMealPhotoBusy(entry: PendingMealPhoto): boolean {
  return inFlight.has(entry.id) || Date.now() - entry.createdAt < 60_000;
}

/**
 * 보관함의 사진 한 장을 기록한다 — 성공하면 보관함에서 지운다. 실패하면 남기고 던진다.
 * 같은 사진을 동시에 두 번 부르면(자동 재시도 + 버튼) 진행 중인 것을 같이 기다린다.
 */
export function submitPendingMealPhoto(entry: PendingMealPhoto): Promise<Meal> {
  const running = inFlight.get(entry.id);
  if (running) return running;
  const task = submit(entry).finally(() => inFlight.delete(entry.id));
  inFlight.set(entry.id, task);
  return task;
}

async function submit(entry: PendingMealPhoto): Promise<Meal> {
  try {
    let photoUrl = entry.photoUrl;
    if (!photoUrl) {
      photoUrl = await uploadImage(entry.fileUri, { purpose: 'meal' });
      const uploaded = photoUrl;
      await update((list) => ({
        list: list.map((p) => (p.id === entry.id ? { ...p, photoUrl: uploaded } : p)),
        result: undefined,
      }));
    }
    const saved = await dietApi.save({
      mealDate: entry.mealDate,
      mealType: entry.mealType,
      photoUrl,
      clientRequestId: entry.clientRequestId,
    });
    await update((list) => ({ list: list.filter((p) => p.id !== entry.id), result: undefined }));
    deleteFile(entry.fileUri);
    return saved;
  } catch (e) {
    // 4xx 는 다시 보내도 같은 답이다 — 자동 재시도 대상에서 뺀다(사용자가 누르면 다시 시도한다)
    const rejected = isApiError(e) && e.status >= 400 && e.status < 500;
    if (rejected) {
      await update((list) => ({
        list: list.map((p) => (p.id === entry.id ? { ...p, rejected: true } : p)),
        result: undefined,
      })).catch(() => {});
    }
    throw e;
  }
}

/** 사용자가 버린다 — 올려 둔 사진이 있으면 서버에도 치우라고 알린다 */
export async function discardPendingMealPhoto(entry: PendingMealPhoto): Promise<void> {
  await update((list) => ({ list: list.filter((p) => p.id !== entry.id), result: undefined }));
  deleteFile(entry.fileUri);
  if (entry.photoUrl) uploadApi.discard(entry.photoUrl);
}

/** 로그아웃 — 다음 계정에 남의 식단 사진이 뜨면 안 된다 */
export async function clearPendingMealPhotos(): Promise<void> {
  const all = await readAll();
  all.forEach((p) => deleteFile(p.fileUri));
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
