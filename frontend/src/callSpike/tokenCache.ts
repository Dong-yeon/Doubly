/**
 * 스파이크용 Stream 토큰 캐시 — widget/widgetData.ts 와 같은 이유로 존재한다.
 *
 * StreamVideoRN.setPushConfig 의 createStreamVideoClient 는 <b>백그라운드에서, React 트리
 * 없이</b> 호출될 수 있다(푸시로 앱이 깨어날 때). 그 시점엔 API 호출 없이 마지막으로
 * 로그인 화면에서 받아둔 토큰을 읽어야 한다.
 */
import { storage } from '../utils/storage';
import type { StreamTokenResponse } from './api';

const KEY = 'callSpike.streamToken';

export async function saveStreamToken(data: StreamTokenResponse): Promise<void> {
  await storage.setItem(KEY, JSON.stringify(data));
}

export async function loadStreamToken(): Promise<StreamTokenResponse | null> {
  const raw = await storage.getItem(KEY);
  return raw ? (JSON.parse(raw) as StreamTokenResponse) : null;
}
