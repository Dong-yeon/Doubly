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
