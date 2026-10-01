/**
 * 웹 — 서버 배포 스티커도 썸네일만 그린다(remoteStickerFiles.ts 주석). 시그니처만 맞춘다.
 */
import type { AnimationObject } from 'lottie-react-native';

export function cachedRemoteLottie(_url: string): AnimationObject | undefined {
  return undefined;
}

export function loadRemoteLottie(_url: string): Promise<AnimationObject> {
  return Promise.reject(new Error('web: thumbnail only'));
}

/** 웹은 파일을 두지 않는다 — 받기는 바로 끝난 것으로 본다 */
export async function downloadRemoteLotties(urls: string[], onProgress?: (done: number) => void): Promise<number> {
  onProgress?.(urls.length);
  return urls.length;
}

export function deleteRemoteLotties(_urls: string[]): void {}
